import {
  ConfigProfile,
  JobRecord,
  JobStatus,
  LogLine,
  ManagedService,
  OSType,
  SwitchRequestPayload,
  TargetHost,
} from '../types';

export const INITIAL_HOSTS: TargetHost[] = [
  {
    id: 'win-prod-01',
    name: 'Windows Core Gateway',
    os_type: 'windows',
    hostname: '192.168.10.45',
    port: 5985,
    use_ssl: false,
    auth: {
      type: 'password',
      username: 'orchestrator_svc',
      password_env: 'WIN_CORE_PASSWORD',
    },
    description: 'Primary Windows Server 2022 hosting Core Financial Routing daemon',
  },
  {
    id: 'win-stage-02',
    name: 'Windows Staging Worker',
    os_type: 'windows',
    hostname: '192.168.10.46',
    port: 5986,
    use_ssl: true,
    auth: {
      type: 'password',
      username: 'admin_deploy',
      password_env: 'WIN_STAGE_PASSWORD',
    },
    description: 'Windows Staging Node for batch settlement jobs',
  },
  {
    id: 'unix-prod-01',
    name: 'Linux Edge Proxy & Ingestion',
    os_type: 'unix',
    hostname: '10.200.4.12',
    port: 22,
    auth: {
      type: 'key',
      username: 'deploy_agent',
      key_path: '~/.ssh/switchr_rsa',
    },
    description: 'Ubuntu 24.04 LTS running event ingestion and rate-limiting proxy',
  },
  {
    id: 'unix-db-cache-01',
    name: 'Linux Redis & Session Daemon',
    os_type: 'unix',
    hostname: '10.200.4.18',
    port: 22,
    auth: {
      type: 'key',
      username: 'sysops',
      key_path: '~/.ssh/id_ed25519',
    },
    description: 'Debian 12 cluster node for cache partitioning and session store',
  },
];

export const INITIAL_SERVICES: ManagedService[] = [
  {
    id: 'svc-fin-router',
    host_id: 'win-prod-01',
    name: 'Financial Transaction Router',
    service_type: 'windows_service',
    verification_service_name: 'FinRouterSvc',
    current_profile: 'production-high-throughput',
    description: 'PCI-DSS compliant transaction gateway service',
    status: 'RUNNING',
    is_locked: false,
    profiles: [
      {
        name: 'production-high-throughput',
        description: 'Direct clearinghouse connections with 128 concurrent threads',
        script_path: 'C:\\Services\\FinRouter\\scripts\\switch_profile.bat',
        parameters: ['--profile', 'prod-high', '--pool-size', '128'],
        timeout_seconds: 180,
      },
      {
        name: 'production-balanced',
        description: 'Standard daytime traffic profile with 64 thread pool',
        script_path: 'C:\\Services\\FinRouter\\scripts\\switch_profile.bat',
        parameters: ['--profile', 'prod-balanced', '--pool-size', '64'],
        timeout_seconds: 180,
      },
      {
        name: 'maintenance-drain',
        description: 'Gracefully drain in-flight transactions and reject new requests',
        script_path: 'C:\\Services\\FinRouter\\scripts\\switch_profile.bat',
        parameters: ['--profile', 'drain'],
        timeout_seconds: 240,
      },
    ],
  },
  {
    id: 'svc-win-batch',
    host_id: 'win-stage-02',
    name: 'Nightly Settlement Worker',
    service_type: 'windows_service',
    verification_service_name: 'BatchSettlement',
    current_profile: 'batch-standard',
    description: 'Reconciliation engine processing end-of-day batches',
    status: 'RUNNING',
    is_locked: false,
    profiles: [
      {
        name: 'batch-standard',
        description: 'Single-thread sequential ledger validation',
        script_path: 'D:\\BatchApps\\Settlement\\bin\\apply_config.bat',
        parameters: ['--mode', 'standard'],
        timeout_seconds: 120,
      },
      {
        name: 'batch-stress-test',
        description: 'Synthetic load generation profile with mock transaction inputs',
        script_path: 'D:\\BatchApps\\Settlement\\bin\\apply_config.bat',
        parameters: ['--mode', 'stress-test', '--concurrency', '16'],
        timeout_seconds: 300,
      },
    ],
  },
  {
    id: 'svc-edge-proxy',
    host_id: 'unix-prod-01',
    name: 'Edge Ingress Gateway',
    service_type: 'systemd',
    verification_service_name: 'switchr-ingress',
    current_profile: 'active-primary-datacenter',
    description: 'Reverse proxy managing traffic balancing and TLS termination',
    status: 'RUNNING',
    is_locked: false,
    profiles: [
      {
        name: 'active-primary-datacenter',
        description: 'Routes 100% of ingress traffic to Primary DC (Frankfurt)',
        script_path: '/opt/switchr/scripts/switch_traffic.sh',
        parameters: ['--region', 'eu-central-1', '--weight', '100'],
        timeout_seconds: 90,
      },
      {
        name: 'failover-secondary-datacenter',
        description: 'Emergency failover routing to Secondary DC (Dublin)',
        script_path: '/opt/switchr/scripts/switch_traffic.sh',
        parameters: ['--region', 'eu-west-1', '--weight', '100'],
        timeout_seconds: 90,
      },
      {
        name: 'split-50-50-canary',
        description: '50/50 dual-region traffic distribution for canary testing',
        script_path: '/opt/switchr/scripts/switch_traffic.sh',
        parameters: ['--canary', 'true', '--split', '50:50'],
        timeout_seconds: 120,
      },
    ],
  },
  {
    id: 'svc-cache-daemon',
    host_id: 'unix-db-cache-01',
    name: 'Redis Cache Partition',
    service_type: 'systemd',
    verification_service_name: 'redis-server',
    current_profile: 'write-through-persistent',
    description: 'High-availability in-memory cache and session synchronization',
    status: 'RUNNING',
    is_locked: false,
    profiles: [
      {
        name: 'write-through-persistent',
        description: 'AOF enabled every second with strict RDB snapshots',
        script_path: '/usr/local/bin/redis-config-switch.sh',
        parameters: ['--durability', 'strict'],
        timeout_seconds: 60,
      },
      {
        name: 'in-memory-volatile',
        description: 'Persistence disabled for maximum throughput during migration',
        script_path: '/usr/local/bin/redis-config-switch.sh',
        parameters: ['--durability', 'volatile-lru'],
        timeout_seconds: 60,
      },
    ],
  },
];

const SEED_AUDIT_LOGS: JobRecord[] = [
  {
    job_id: 'job-9a8b1c2d3e',
    host_id: 'unix-prod-01',
    host_name: 'Linux Edge Proxy & Ingestion',
    os_type: 'unix',
    service_id: 'svc-edge-proxy',
    service_name: 'Edge Ingress Gateway',
    target_profile: 'active-primary-datacenter',
    previous_profile: 'split-50-50-canary',
    status: 'SUCCESS',
    exit_code: 0,
    started_at: '2026-10-15T11:42:10.000Z',
    completed_at: '2026-10-15T11:42:15.800Z',
    duration_seconds: 5.8,
    verification_passed: true,
    is_simulation: true,
    logs: [
      { id: '1', timestamp: '11:42:10.120', text: '[*] Initializing SSH connection to 10.200.4.12:22...', type: 'info' },
      { id: '2', timestamp: '11:42:10.450', text: '[✓] SSH session established with deploy_agent (switchr_rsa)', type: 'success' },
      { id: '3', timestamp: '11:42:10.800', text: '[$] Executing: /opt/switchr/scripts/switch_traffic.sh --region eu-central-1 --weight 100', type: 'info' },
      { id: '4', timestamp: '11:42:11.500', text: '[stdout] Switching upstream DNS pool to Frankfurt-01 datacenter...', type: 'stdout' },
      { id: '5', timestamp: '11:42:12.300', text: '[stdout] Traffic weighting updated: 100% to primary DC.', type: 'stdout' },
      { id: '6', timestamp: '11:42:13.200', text: '[stdout] Reloading Nginx ingress worker pool: OK', type: 'stdout' },
      { id: '7', timestamp: '11:42:14.100', text: '[*] Verification Probe: systemctl is-active switchr-ingress -> active', type: 'info' },
      { id: '8', timestamp: '11:42:15.800', text: '[✓] Probe verified. Service is RUNNING.', type: 'success' },
    ],
  },
  {
    job_id: 'job-f4e3d2c1b0',
    host_id: 'win-prod-01',
    host_name: 'Windows Core Gateway',
    os_type: 'windows',
    service_id: 'svc-fin-router',
    service_name: 'Financial Transaction Router',
    target_profile: 'production-high-throughput',
    previous_profile: 'production-balanced',
    status: 'SUCCESS',
    exit_code: 0,
    started_at: '2026-10-15T09:15:00.000Z',
    completed_at: '2026-10-15T09:15:06.400Z',
    duration_seconds: 6.4,
    verification_passed: true,
    is_simulation: true,
    logs: [
      { id: '1', timestamp: '09:15:00.100', text: '[*] Establishing WinRM Session to 192.168.10.45:5985...', type: 'info' },
      { id: '2', timestamp: '09:15:00.400', text: '[✓] WinRM authenticated as orchestrator_svc', type: 'success' },
      { id: '3', timestamp: '09:15:01.000', text: '[$] Executing: C:\\Services\\FinRouter\\scripts\\switch_profile.bat --profile prod-high --pool-size 128', type: 'info' },
      { id: '4', timestamp: '09:15:02.100', text: '[stdout] Applying registry configuration: ThreadPool=128', type: 'stdout' },
      { id: '5', timestamp: '09:15:03.500', text: '[stdout] Stopping FinRouterSvc...', type: 'stdout' },
      { id: '6', timestamp: '09:15:04.200', text: '[stdout] Starting FinRouterSvc with new profile...', type: 'stdout' },
      { id: '7', timestamp: '09:15:05.100', text: '[*] Probe sc query FinRouterSvc -> STATE: 4 RUNNING', type: 'info' },
      { id: '8', timestamp: '09:15:06.400', text: '[✓] Verification succeeded.', type: 'success' },
    ],
  },
];

type LogSubscriber = (line: LogLine) => void;
type JobCompleteSubscriber = (job: JobRecord) => void;

class MockOrchestrator {
  private hosts: TargetHost[] = INITIAL_HOSTS;
  private services: ManagedService[] = INITIAL_SERVICES;
  private activeLocks: Map<string, string> = new Map(); // key `${host_id}:${service_id}` -> job_id
  private jobs: Map<string, JobRecord> = new Map();
  private abortSignals: Map<string, boolean> = new Map();
  private subscribers: Map<string, Set<LogSubscriber>> = new Map();
  private completeSubscribers: Map<string, Set<JobCompleteSubscriber>> = new Map();
  private auditHistory: JobRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const savedAudit = localStorage.getItem('switchr_audit_history');
      if (savedAudit) {
        this.auditHistory = JSON.parse(savedAudit);
      } else {
        this.auditHistory = SEED_AUDIT_LOGS;
      }
    } catch {
      this.auditHistory = SEED_AUDIT_LOGS;
    }
  }

  private saveAudit() {
    try {
      localStorage.setItem('switchr_audit_history', JSON.stringify(this.auditHistory.slice(0, 100)));
    } catch {
      // ignore
    }
  }

  public getHosts(): TargetHost[] {
    return this.hosts;
  }

  public getServices(): ManagedService[] {
    return this.services;
  }

  public getAuditHistory(): JobRecord[] {
    return this.auditHistory;
  }

  public getActiveLocksCount(): number {
    return this.activeLocks.size;
  }

  public isServiceLocked(host_id: string, service_id: string): { isLocked: boolean; activeJobId?: string } {
    const key = `${host_id}:${service_id}`;
    const activeJobId = this.activeLocks.get(key);
    return { isLocked: Boolean(activeJobId), activeJobId };
  }

  public getJob(job_id: string): JobRecord | undefined {
    return this.jobs.get(job_id);
  }

  public subscribeJobLogs(job_id: string, onLine: LogSubscriber, onComplete?: JobCompleteSubscriber): () => void {
    if (!this.subscribers.has(job_id)) {
      this.subscribers.set(job_id, new Set());
    }
    this.subscribers.get(job_id)!.add(onLine);

    if (onComplete) {
      if (!this.completeSubscribers.has(job_id)) {
        this.completeSubscribers.set(job_id, new Set());
      }
      this.completeSubscribers.get(job_id)!.add(onComplete);
    }

    return () => {
      this.subscribers.get(job_id)?.delete(onLine);
      if (onComplete) {
        this.completeSubscribers.get(job_id)?.delete(onComplete);
      }
    };
  }

  public abortJob(job_id: string): boolean {
    const job = this.jobs.get(job_id);
    if (!job || job.status !== 'RUNNING') return false;

    this.abortSignals.set(job_id, true);
    this.emitLine(job, {
      text: '[!] Operator initiated immediate ABORT signal. Cancelling remote channel...',
      type: 'warn',
    });
    return true;
  }

  public async startSwitchJob(payload: SwitchRequestPayload): Promise<JobRecord> {
    const { host_id, service_id, profile_name, simulate_failure } = payload;
    const lockKey = `${host_id}:${service_id}`;

    // 1. MUTEX LOCK CHECK: Strict 409 Conflict rejection
    if (this.activeLocks.has(lockKey)) {
      const existingJobId = this.activeLocks.get(lockKey);
      const err = new Error(`409 Conflict: Service '${service_id}' on host '${host_id}' is already locked by active job '${existingJobId}'`);
      (err as any).status = 409;
      throw err;
    }

    const host = this.hosts.find((h) => h.id === host_id);
    if (!host) throw new Error(`Host '${host_id}' not found`);

    const service = this.services.find((s) => s.id === service_id);
    if (!service) throw new Error(`Service '${service_id}' not found`);

    const profile = service.profiles.find((p) => p.name === profile_name);
    if (!profile) throw new Error(`Profile '${profile_name}' not configured for service '${service_id}'`);

    const jobId = `job-${Math.random().toString(36).substring(2, 10)}`;

    // Acquire lock and mark service state
    this.activeLocks.set(lockKey, jobId);
    service.is_locked = true;
    service.active_job_id = jobId;
    service.status = 'TRANSITIONING';

    const jobRecord: JobRecord = {
      job_id: jobId,
      host_id: host.id,
      host_name: host.name,
      os_type: host.os_type,
      service_id: service.id,
      service_name: service.name,
      target_profile: profile_name,
      previous_profile: service.current_profile,
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      verification_passed: false,
      is_simulation: true,
      logs: [],
    };

    this.jobs.set(jobId, jobRecord);

    // Asynchronous background execution simulating live SSE streaming
    this.runAsyncExecution(jobRecord, host, service, profile, Boolean(simulate_failure));

    return jobRecord;
  }

  private async runAsyncExecution(
    job: JobRecord,
    host: TargetHost,
    service: ManagedService,
    profile: ConfigProfile,
    simulateFailure: boolean
  ) {
    const startTime = performance.now();
    const isWindows = host.os_type === 'windows';
    const proto = isWindows ? 'WinRM (WS-Management 5985)' : 'SSH (OpenSSH Port 22)';

    this.emitLine(job, {
      text: `============================================================`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `SWITCHR ORCHESTRATOR - PROFILE TRANSITION INITIATED`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `Job ID: ${job.job_id} | Mode: DRY_RUN Simulation`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `Target Host: ${host.name} [${host.os_type.toUpperCase()}] (${host.hostname}:${host.port})`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `Service: ${service.name} (${service.id})`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `Transition: '${job.previous_profile}' -> '${job.target_profile}'`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `Script Path: ${profile.script_path}`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `Timeout Budget: ${profile.timeout_seconds}s | Probe: ${service.verification_service_name}`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `============================================================`,
      type: 'info',
    });

    await this.delay(350);
    if (this.checkAborted(job, host, service)) return;

    this.emitLine(job, {
      text: `[*] Connecting via ${proto} using credential '${host.auth.username}'...`,
      type: 'info',
    });
    await this.delay(450);
    if (this.checkAborted(job, host, service)) return;

    this.emitLine(job, {
      text: `[✓] Agentless session established with ${host.hostname}.`,
      type: 'success',
    });

    const command = `${profile.script_path} ${profile.parameters.join(' ')}`;
    this.emitLine(job, {
      text: `[$] Dispatching remote command: ${command}`,
      type: 'info',
    });

    // Simulated script execution lines
    const executionLines = isWindows
      ? [
          '[stdout] C:\\Services> powershell -NonInteractive -ExecutionPolicy Bypass',
          '[stdout] [1/5] Verifying target directory structure and permissions...',
          '[stdout] [2/5] Creating registry snapshot: HKLM\\Software\\Switchr\\Backup',
          '[stdout] [3/5] Requesting service stop for ' + service.verification_service_name,
          '[stdout] [4/5] Writing profile parameters to service environment block...',
          '[stdout] [5/5] Launching service binary with new active configuration profile...',
        ]
      : [
          '[stdout] /opt/switchr> export SWITCHR_PROFILE="' + profile.name + '"',
          '[stdout] [1/5] Validating config file syntax and symlink bindings...',
          '[stdout] [2/5] Backing up runtime state to /var/backup/switchr.tar.gz',
          '[stdout] [3/5] Signaling daemon worker pool: Graceful reload / SIGTERM',
          '[stdout] [4/5] Port unbound. Applying requested connection limits...',
          '[stdout] [5/5] Starting daemon worker process via systemd...',
        ];

    for (let i = 0; i < executionLines.length; i++) {
      await this.delay(400 + Math.random() * 300);
      if (this.checkAborted(job, host, service)) return;

      // Simulated failure trigger if requested
      if (simulateFailure && i === 3) {
        this.emitLine(job, {
          text: `[stderr] Error: Script execution encountered fatal exit condition on line 42.`,
          type: 'error',
        });
        this.emitLine(job, {
          text: `[stderr] Exit code: 1 - Configuration profile parsing failed.`,
          type: 'error',
        });
        this.emitLine(job, {
          text: `[FATAL] Script exited with non-zero exit code 1.`,
          type: 'error',
        });
        this.emitLine(job, {
          text: `[!] Fail-Fast invariant triggered: halting execution. No blind rollback attempted.`,
          type: 'warn',
        });

        this.finishJob(job, host, service, 'FAILED', 1, false, startTime, 'Script exited with non-zero code 1');
        return;
      }

      this.emitLine(job, { text: executionLines[i], type: 'stdout' });
    }

    await this.delay(300);
    if (this.checkAborted(job, host, service)) return;

    this.emitLine(job, {
      text: `[*] Remote script completed with exit code 0.`,
      type: 'info',
    });

    // Post-Execution Verification Probe
    this.emitLine(job, {
      text: `============================================================`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `[*] Phase 2: Running automated post-execution verification probe...`,
      type: 'info',
    });
    await this.delay(500);
    if (this.checkAborted(job, host, service)) return;

    const probeCmd = isWindows
      ? `sc query "${service.verification_service_name}"`
      : `systemctl is-active "${service.verification_service_name}"`;

    this.emitLine(job, {
      text: `[$] Probe Command: ${probeCmd}`,
      type: 'info',
    });
    await this.delay(400);

    const probeOutput = isWindows
      ? `SERVICE_NAME: ${service.verification_service_name} | STATE: 4 RUNNING | WIN32_EXIT_CODE: 0`
      : `active (running) - Switchr Ingress Worker Pool [PID 38412]`;

    this.emitLine(job, {
      text: `[stdout] ${probeOutput}`,
      type: 'stdout',
    });

    this.emitLine(job, {
      text: `[✓] PROBE VERIFIED: Service '${service.verification_service_name}' confirmed healthy.`,
      type: 'success',
    });
    this.emitLine(job, {
      text: `[✓] Successfully transitioned service to profile '${job.target_profile}'.`,
      type: 'success',
    });

    service.current_profile = job.target_profile;
    this.finishJob(job, host, service, 'SUCCESS', 0, true, startTime);
  }

  private checkAborted(job: JobRecord, host: TargetHost, service: ManagedService): boolean {
    if (this.abortSignals.get(job.job_id)) {
      this.emitLine(job, {
        text: `[!] Job was aborted by operator. Terminating remote connection.`,
        type: 'error',
      });
      this.finishJob(job, host, service, 'ABORTED', -1, false, performance.now(), 'Aborted by operator');
      return true;
    }
    return false;
  }

  private finishJob(
    job: JobRecord,
    host: TargetHost,
    service: ManagedService,
    status: JobStatus,
    exitCode: number,
    verificationPassed: boolean,
    startTime: number,
    errorSummary?: string
  ) {
    const elapsed = (performance.now() - startTime) / 1000;
    job.status = status;
    job.exit_code = exitCode;
    job.verification_passed = verificationPassed;
    job.completed_at = new Date().toISOString();
    job.duration_seconds = parseFloat(elapsed.toFixed(2));
    job.error_summary = errorSummary;

    // Release lock and restore service status
    const lockKey = `${host.id}:${service.id}`;
    this.activeLocks.delete(lockKey);
    service.is_locked = false;
    service.active_job_id = undefined;
    service.status = status === 'SUCCESS' ? 'RUNNING' : status === 'FAILED' ? 'ERROR' : 'STOPPED';

    this.emitLine(job, {
      text: `[*] Released execution lock for (${host.id}, ${service.id}).`,
      type: 'info',
    });
    this.emitLine(job, {
      text: `[*] Total Job Duration: ${job.duration_seconds}s | Status: ${job.status}`,
      type: status === 'SUCCESS' ? 'success' : 'error',
    });

    // Prepend to audit log history
    this.auditHistory = [job, ...this.auditHistory];
    this.saveAudit();

    // Trigger complete listeners
    const completelist = this.completeSubscribers.get(job.job_id);
    if (completelist) {
      completelist.forEach((fn) => fn(job));
    }
  }

  private emitLine(job: JobRecord, lineData: { text: string; type: LogLine['type'] }) {
    const now = new Date();
    const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    const logLine: LogLine = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: timeStr,
      text: lineData.text,
      type: lineData.type,
    };
    job.logs.push(logLine);

    const subs = this.subscribers.get(job.job_id);
    if (subs) {
      subs.forEach((cb) => cb(logLine));
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const orchestratorService = new MockOrchestrator();
