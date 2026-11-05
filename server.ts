/**
 * Switchr Full-Stack Express Server (TypeScript)
 * Implements REST & SSE API matching the orchestrator specification:
 * - GET /api/health
 * - GET /api/inventory
 * - POST /api/jobs/switch (409 Conflict if locked)
 * - POST /api/jobs/:id/abort
 * - GET /api/jobs/:id/stream (Server-Sent Events)
 * - GET /api/jobs/history
 * - GET /api/config/raw
 * Mounts Vite dev middleware for React SPA assets on port 3000.
 */

import express, { Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.APP_PORT || process.env.DEFAULT_APP_PORT || '3000', 10);
const CONFIG_PATH = process.env.SWITCHR_CONFIG || path.join(__dirname, 'config.yaml');
const LOGS_DIR = path.join(__dirname, 'logs');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// Load Declarative Configuration
// -----------------------------------------------------------------------------
interface ScriptStepConfig {
  name: string;
  script_path: string;
  parameters: string[];
  timeout_seconds: number;
}

interface ConfigProfile {
  name: string;
  description: string;
  script_path?: string;
  parameters?: string[];
  timeout_seconds?: number;
  scripts?: ScriptStepConfig[];
}

interface ServiceConfig {
  id: string;
  host_id: string;
  name: string;
  service_type: string;
  verification_service_name: string;
  active_profile_path?: string;
  current_profile?: string | null;
  description: string;
  profiles: ConfigProfile[];
}

interface HostConfig {
  id: string;
  name: string;
  os_type: 'windows' | 'unix';
  hostname: string;
  port: number;
  use_ssl?: boolean;
  auth: {
    type: 'password' | 'key';
    username: string;
    password_env?: string;
    key_path?: string;
  };
  description: string;
}

interface AppConfig {
  app: {
    name: string;
    version: string;
    dry_run: boolean;
    default_job_timeout: number;
    log_dir: string;
  };
  hosts: HostConfig[];
  services: ServiceConfig[];
}

function getEffectiveScripts(profile: ConfigProfile): ScriptStepConfig[] {
  if (profile.scripts && profile.scripts.length > 0) {
    return profile.scripts;
  }
  if (profile.script_path) {
    return [
      {
        name: 'Execute profile script',
        script_path: profile.script_path,
        parameters: profile.parameters || [],
        timeout_seconds: profile.timeout_seconds || 300,
      },
    ];
  }
  return [];
}

function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Configuration file not found at ${CONFIG_PATH}`);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = YAML.parse(raw) as AppConfig;

  // Initialize active profiles by attempting to read active_profile_path if available
  parsed.services.forEach((svc) => {
    if (svc.active_profile_path && fs.existsSync(svc.active_profile_path)) {
      try {
        const content = fs.readFileSync(svc.active_profile_path, 'utf-8').trim();
        svc.current_profile = content.length > 0 ? content : null;
      } catch {
        svc.current_profile = null;
      }
    } else {
      // If file not on local disk (simulated remote file), keep existing or set null
      // For demo realism, if fin-router or edge-proxy has active_profile_path, assign standard profile
      if (svc.id === 'svc-fin-router') svc.current_profile = 'production-high-throughput';
      else if (svc.id === 'svc-edge-proxy') svc.current_profile = 'active-primary-datacenter';
      else if (svc.id === 'svc-cache-daemon') svc.current_profile = 'write-through-persistent';
      else svc.current_profile = null; // e.g. svc-win-batch uninitialized
    }
  });

  return parsed;
}

let appConfig = loadConfig();

// -----------------------------------------------------------------------------
// Job & Lock Management
// -----------------------------------------------------------------------------
interface LogMessage {
  id: string;
  timestamp: string;
  text: string;
  type: 'stdout' | 'stderr' | 'info' | 'success' | 'warn' | 'error';
}

interface JobRecord {
  job_id: string;
  host_id: string;
  host_name: string;
  os_type: 'windows' | 'unix';
  service_id: string;
  service_name: string;
  target_profile: string;
  previous_profile: string | null;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED' | 'TIMED_OUT';
  exit_code?: number;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  verification_passed: boolean;
  is_simulation: boolean;
  error_summary?: string;
  logs: LogMessage[];
}

const activeLocks = new Map<string, string>(); // `${host_id}:${service_id}` -> job_id
const activeJobs = new Map<string, JobRecord>();
const abortFlags = new Map<string, boolean>();
const sseSubscribers = new Map<string, Set<(event: { type?: string; data: string }) => void>>();

// Load or initialize audit history
let auditHistory: JobRecord[] = [];
const auditHistoryPath = path.join(LOGS_DIR, 'audit_history.json');
if (fs.existsSync(auditHistoryPath)) {
  try {
    auditHistory = JSON.parse(fs.readFileSync(auditHistoryPath, 'utf-8'));
  } catch (err) {
    auditHistory = [];
  }
}

function saveAuditRecord(job: JobRecord) {
  const jobLogPath = path.join(LOGS_DIR, `${job.job_id}_${job.service_id}.log`);
  const logContent = [
    `SWITCHR JOB EXECUTION AUDIT LOG`,
    `====================================================`,
    `Job ID: ${job.job_id}`,
    `Host: ${job.host_name} (${job.host_id})`,
    `Service: ${job.service_name} (${job.service_id})`,
    `Target Profile: ${job.target_profile}`,
    `Previous Profile: ${job.previous_profile || 'None'}`,
    `Status: ${job.status}`,
    `Exit Code: ${job.exit_code ?? 'N/A'}`,
    `Duration: ${job.duration_seconds ?? 'N/A'}s`,
    `Verification Passed: ${job.verification_passed}`,
    `====================================================\n`,
    ...job.logs.map((l) => `[${l.timestamp}] ${l.text}`),
  ].join('\n');

  try {
    fs.writeFileSync(jobLogPath, logContent, 'utf-8');
  } catch (err) {
    console.error(`Failed to write job log:`, err);
  }

  auditHistory.unshift(job);
  if (auditHistory.length > 200) auditHistory.length = 200;
  try {
    fs.writeFileSync(auditHistoryPath, JSON.stringify(auditHistory, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save audit history:`, err);
  }
}

function broadcastLog(job: JobRecord, text: string, type: LogMessage['type'] = 'stdout') {
  const now = new Date();
  const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  const logLine: LogMessage = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: timeStr,
    text,
    type,
  };
  job.logs.push(logLine);

  const subs = sseSubscribers.get(job.job_id);
  if (subs) {
    subs.forEach((cb) => cb({ data: text }));
  }
}

// Simulated background execution worker
async function runAsyncJob(
  job: JobRecord,
  host: HostConfig,
  service: ServiceConfig,
  profile: ConfigProfile,
  simulateFailure: boolean
) {
  const start = performance.now();
  const isWindows = host.os_type === 'windows';
  const proto = isWindows ? 'WinRM (WS-Management 5985)' : 'SSH (Port 22)';
  const scripts = getEffectiveScripts(profile);

  broadcastLog(job, `============================================================`, 'info');
  broadcastLog(job, `SWITCHR ORCHESTRATOR - PROFILE TRANSITION INITIATED`, 'info');
  broadcastLog(job, `Job ID: ${job.job_id} | Pipeline Steps: ${scripts.length}`, 'info');
  broadcastLog(job, `Host: ${host.name} [${host.os_type.toUpperCase()}] (${host.hostname}:${host.port})`, 'info');
  broadcastLog(job, `Service: ${service.name} (id: ${service.id})`, 'info');
  broadcastLog(job, `Target Profile: '${job.previous_profile || 'None'}' -> '${job.target_profile}'`, 'info');
  broadcastLog(job, `Active Profile Path: ${service.active_profile_path || 'None'}`, 'info');
  broadcastLog(job, `============================================================`, 'info');

  await delay(300);
  if (checkAbort(job, host, service)) return;

  broadcastLog(job, `[*] Connecting to host via ${proto} as user '${host.auth.username}'...`, 'info');
  await delay(350);
  if (checkAbort(job, host, service)) return;

  broadcastLog(job, `[✓] Remote session established with ${host.hostname}.`, 'success');

  // Serial step loop
  for (let i = 0; i < scripts.length; i++) {
    const step = scripts[i];
    const stepNumber = i + 1;
    const totalSteps = scripts.length;
    const stepName = step.name || `Script #${stepNumber}`;
    const argsStr = (step.parameters || []).join(' ');

    await delay(200);
    if (checkAbort(job, host, service)) return;

    broadcastLog(job, `[STEP ${stepNumber}/${totalSteps}] Starting: ${stepName} (${step.script_path} ${argsStr})`, 'info');

    await delay(400);
    if (checkAbort(job, host, service)) return;

    if (simulateFailure && i === 1) {
      broadcastLog(job, `[stderr] Error: ${stepName} failed with non-zero exit code 1.`, 'error');
      broadcastLog(job, `[FATAL] Script execution failed at step ${stepNumber}/${totalSteps}: ${stepName}`, 'error');
      broadcastLog(job, `[!] Fail-Fast invariant triggered: halting remaining steps. No blind rollback attempted.`, 'warn');
      finishJob(job, host, service, 'FAILED', 1, false, start, `Step ${stepNumber} failed with exit code 1`);
      return;
    }

    broadcastLog(job, `[stdout] Executing step payload for ${step.script_path.split('\\').pop()?.split('/').pop()}...`, 'stdout');
    await delay(300);
    broadcastLog(job, `[stdout] Step command completed with status OK (exit code 0).`, 'stdout');
    broadcastLog(job, `[STEP ${stepNumber}/${totalSteps}] Finished successfully: ${stepName}`, 'info');
  }

  await delay(300);
  if (checkAbort(job, host, service)) return;

  // Post-execution verification probe
  broadcastLog(job, `============================================================`, 'info');
  broadcastLog(job, `[PROBE] Verifying managed service status for '${service.verification_service_name}'...`, 'info');

  await delay(400);
  if (checkAbort(job, host, service)) return;

  const probeCmd = isWindows
    ? `sc query "${service.verification_service_name}"`
    : `systemctl is-active "${service.verification_service_name}"`;

  broadcastLog(job, `[$] Probe Command: ${probeCmd}`, 'info');
  await delay(300);

  const probeOutput = isWindows
    ? `SERVICE_NAME: ${service.verification_service_name} | STATE: 4 RUNNING | WIN32_EXIT_CODE: 0`
    : `active (running) - Switchr Ingress Worker Pool [PID 38412]`;

  broadcastLog(job, `[stdout] ${probeOutput}`, 'stdout');
  broadcastLog(job, `[✓] PROBE VERIFIED: Service '${service.verification_service_name}' confirmed healthy.`, 'success');

  // Update active profile from active_profile_path
  service.current_profile = job.target_profile;
  if (service.active_profile_path) {
    broadcastLog(job, `[PROBE] Confirmed active profile '${service.current_profile}' from remote file '${service.active_profile_path}'.`, 'success');
  }

  broadcastLog(job, `[SUCCESS] Service is confirmed RUNNING. Configuration switch to '${job.target_profile}' complete.`, 'success');

  finishJob(job, host, service, 'SUCCESS', 0, true, start);
}

function checkAbort(job: JobRecord, host: HostConfig, service: ServiceConfig): boolean {
  if (abortFlags.get(job.job_id)) {
    broadcastLog(job, `[!] Job was aborted by operator. Terminating remote channel.`, 'warn');
    finishJob(job, host, service, 'ABORTED', -1, false, performance.now(), 'Aborted by operator');
    return true;
  }
  return false;
}

function finishJob(
  job: JobRecord,
  host: HostConfig,
  service: ServiceConfig,
  status: JobRecord['status'],
  exitCode: number,
  verificationPassed: boolean,
  startTime: number,
  errorSummary?: string
) {
  const duration = (performance.now() - startTime) / 1000;
  job.status = status;
  job.exit_code = exitCode;
  job.verification_passed = verificationPassed;
  job.completed_at = new Date().toISOString();
  job.duration_seconds = parseFloat(duration.toFixed(2));
  job.error_summary = errorSummary;

  const lockKey = `${host.id}:${service.id}`;
  activeLocks.delete(lockKey);

  broadcastLog(job, `[*] Released execution lock for (${host.id}, ${service.id}).`, 'info');
  broadcastLog(job, `[*] Total Job Duration: ${job.duration_seconds}s | Status: ${job.status}`, status === 'SUCCESS' ? 'success' : 'error');

  saveAuditRecord(job);

  const subs = sseSubscribers.get(job.job_id);
  if (subs) {
    subs.forEach((cb) => cb({ type: 'done', data: job.status }));
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------
// Setup Express Application
// -----------------------------------------------------------------------------
async function bootstrap() {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // GET /api/health
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: appConfig.app.name,
      version: appConfig.app.version,
      dry_run: appConfig.app.dry_run,
    });
  });

  // GET /api/inventory
  app.get('/api/inventory', (req: Request, res: Response) => {
    const hostsView = appConfig.hosts.map((host) => {
      const { auth, ...safeHost } = host;
      const services = appConfig.services
        .filter((s) => s.host_id === host.id)
        .map((s) => {
          const lockKey = `${host.id}:${s.id}`;
          const isLocked = activeLocks.has(lockKey);
          const activeJobId = activeLocks.get(lockKey);
          return {
            ...s,
            current_profile: s.current_profile || null,
            status: isLocked ? 'TRANSITIONING' : 'RUNNING',
            is_locked: isLocked,
            active_job_id: activeJobId,
          };
        });

      return {
        ...safeHost,
        services,
      };
    });

    res.json({
      app_version: appConfig.app.version,
      dry_run: appConfig.app.dry_run,
      hosts: hostsView,
      active_locks_count: activeLocks.size,
    });
  });

  // POST /api/jobs/switch
  app.post('/api/jobs/switch', async (req: Request, res: Response) => {
    const { host_id, service_id, profile_name, simulate_failure } = req.body;

    if (!host_id || !service_id || !profile_name) {
      res.status(400).json({ detail: 'host_id, service_id, and profile_name are required' });
      return;
    }

    const lockKey = `${host_id}:${service_id}`;

    // ENFORCE IN-MEMORY MUTEX LOCK (409 Conflict)
    if (activeLocks.has(lockKey)) {
      const existingJobId = activeLocks.get(lockKey);
      res.status(409).json({
        detail: `Service '${service_id}' on host '${host_id}' is already locked by active job '${existingJobId}'`,
      });
      return;
    }

    const host = appConfig.hosts.find((h) => h.id === host_id);
    if (!host) {
      res.status(400).json({ detail: `Host '${host_id}' not found` });
      return;
    }

    const service = appConfig.services.find((s) => s.id === service_id && s.host_id === host_id);
    if (!service) {
      res.status(400).json({ detail: `Service '${service_id}' not found on host '${host_id}'` });
      return;
    }

    const profile = service.profiles.find((p) => p.name === profile_name);
    if (!profile) {
      res.status(400).json({ detail: `Profile '${profile_name}' not configured for service '${service_id}'` });
      return;
    }

    const jobId = `job-${Math.random().toString(36).substring(2, 10)}`;

    // Acquire lock
    activeLocks.set(lockKey, jobId);

    const jobRecord: JobRecord = {
      job_id: jobId,
      host_id: host.id,
      host_name: host.name,
      os_type: host.os_type,
      service_id: service.id,
      service_name: service.name,
      target_profile: profile_name,
      previous_profile: service.current_profile || null,
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      verification_passed: false,
      is_simulation: true,
      logs: [],
    };

    activeJobs.set(jobId, jobRecord);

    runAsyncJob(jobRecord, host, service, profile, Boolean(simulate_failure));

    res.status(202).json({
      job_id: jobId,
      host_id: host.id,
      service_id: service.id,
      target_profile: profile_name,
      status: 'RUNNING',
      message: 'Profile switch job successfully queued and dispatched.',
    });
  });

  // POST /api/jobs/:id/abort
  app.post('/api/jobs/:id/abort', (req: Request, res: Response) => {
    const jobId = req.params.id;
    const job = activeJobs.get(jobId);
    if (!job) {
      res.status(404).json({ detail: `Job ${jobId} not found` });
      return;
    }

    abortFlags.set(jobId, true);
    broadcastLog(job, `[!] Operator initiated ABORT request.`, 'warn');

    res.json({
      job_id: jobId,
      status: 'ABORTED',
      message: `Job ${jobId} abort signal sent.`,
    });
  });

  // GET /api/jobs/:id/stream (Server-Sent Events)
  app.get('/api/jobs/:id/stream', (req: Request, res: Response) => {
    const jobId = req.params.id;
    const job = activeJobs.get(jobId);

    if (!job) {
      res.status(404).send(`event: error\ndata: Job ${jobId} not found\n\n`);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`: connected to switchr job ${jobId}\n\n`);

    for (const line of job.logs) {
      res.write(`data: ${line.text}\n\n`);
    }

    if (job.status !== 'RUNNING') {
      res.write(`event: done\ndata: ${job.status}\n\n`);
      res.end();
      return;
    }

    if (!sseSubscribers.has(jobId)) {
      sseSubscribers.set(jobId, new Set());
    }

    const listener = (event: { type?: string; data: string }) => {
      if (event.type === 'done') {
        res.write(`event: done\ndata: ${event.data}\n\n`);
        res.end();
      } else {
        res.write(`data: ${event.data}\n\n`);
      }
    };

    sseSubscribers.get(jobId)!.add(listener);

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseSubscribers.get(jobId)?.delete(listener);
    });
  });

  // GET /api/jobs/history
  app.get('/api/jobs/history', (req: Request, res: Response) => {
    res.json({ history: auditHistory });
  });

  // DELETE /api/jobs/history
  app.delete('/api/jobs/history', (req: Request, res: Response) => {
    auditHistory = [];
    try {
      if (fs.existsSync(auditHistoryPath)) {
        fs.writeFileSync(auditHistoryPath, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to clear audit_history.json:', err);
    }
    res.json({ success: true, message: 'Audit history cleared successfully.' });
  });

  // GET /api/config/raw
  app.get('/api/config/raw', (req: Request, res: Response) => {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    res.setHeader('Content-Type', 'text/yaml');
    res.send(raw);
  });

  // ---------------------------------------------------------------------------
  // Vite Integration & HTTP Server
  // ---------------------------------------------------------------------------
  const httpServer = http.createServer(app);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[*] Switchr Express server listening on http://0.0.0.0:${PORT}`);
    console.log(`[*] Target hosts: ${appConfig.hosts.length} | Services: ${appConfig.services.length}`);
    console.log(`[*] Dry-run mode: ${appConfig.app.dry_run}`);
  });
}

bootstrap().catch((err) => {
  console.error('[FATAL] Failed to start Switchr server:', err);
  process.exit(1);
});
