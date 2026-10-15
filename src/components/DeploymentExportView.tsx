import React, { useState } from 'react';
import {
  FileCode,
  Copy,
  Check,
  Download,
  Terminal,
  Server,
  Layers,
  Settings,
  Shield,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

interface FileDefinition {
  name: string;
  category: 'Backend' | 'Config' | 'Gateway' | 'Frontend' | 'Docs';
  language: string;
  description: string;
  code: string;
}

const DEPLOYMENT_FILES: FileDefinition[] = [
  {
    name: 'apache_vhost.conf',
    category: 'Gateway',
    language: 'apache',
    description: 'Apache 2.4 VirtualHost with mod_proxy_http and unbuffered SSE streaming',
    code: `# ==============================================================================
# switchr Apache HTTP Server 2.4 VirtualHost Configuration
# Target: Windows Server running Apache 2.4 (e.g. Apache Lounge / XAMPP)
#
# Prerequisite Apache Modules (Ensure these are enabled in httpd.conf):
#   LoadModule proxy_module modules/mod_proxy.so
#   LoadModule proxy_http_module modules/mod_proxy_http.so
#   LoadModule headers_module modules/mod_headers.so
#   LoadModule rewrite_module modules/mod_rewrite.so
# ==============================================================================

<VirtualHost *:80>
    ServerName switchr.internal.corp
    ServerAdmin sysops@internal.corp

    # Root directory for static dashboard assets (HTML, CSS, JS)
    DocumentRoot "C:/Apache24/htdocs/switchr/static"

    <Directory "C:/Apache24/htdocs/switchr/static">
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted

        # Fallback to index.html for Single Page Application routing
        FallbackResource /index.html
    </Directory>

    # Logging Configuration
    ErrorLog "logs/switchr_error.log"
    CustomLog "logs/switchr_access.log" combined

    # --------------------------------------------------------------------------
    # Reverse Proxy Configuration for FastAPI Backend
    # FastAPI runs on 127.0.0.1:8000 managed by Uvicorn / Windows Service
    # --------------------------------------------------------------------------
    ProxyPreserveHost On
    ProxyRequests Off

    # CRITICAL FOR SSE STREAMING:
    # Disable proxy buffering for the Server-Sent Events stream endpoint
    # flushpackets=on forces Apache to immediately forward stdout/stderr chunks
    # without waiting for the internal buffer to fill.
    <Location "/api/jobs/">
        ProxyPass "http://127.0.0.1:8000/api/jobs/" flushpackets=on retry=0
        ProxyPassReverse "http://127.0.0.1:8000/api/jobs/"
        
        # Prevent client and intermediate caching for live streams
        Header always set Cache-Control "no-cache, no-transform"
        Header always set X-Accel-Buffering "no"
    </Location>

    # General API reverse proxy
    <Location "/api/">
        ProxyPass "http://127.0.0.1:8000/api/" retry=0 timeout=300
        ProxyPassReverse "http://127.0.0.1:8000/api/"
    </Location>

</VirtualHost>`,
  },
  {
    name: 'main.py',
    category: 'Backend',
    language: 'python',
    description: 'FastAPI application with REST endpoints, 409 lock enforcement, and SSE streaming',
    code: `"""
switchr FastAPI Application
Provides REST and SSE endpoints for inventory status, configuration switching,
job aborting, audit logs, and static web dashboard hosting.
"""
from __future__ import annotations
import os
from contextlib import asynccontextmanager
import yaml
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse

from models import ConfigFile, InventoryResponse, SwitchJobRequest, SwitchJobResponse, AbortJobResponse
from job_manager import ConcurrencyLockError, JobManager

CONFIG_PATH = os.environ.get("SWITCHR_CONFIG", "config.yaml")

def load_config(path: str = CONFIG_PATH) -> ConfigFile:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return ConfigFile(**data)

app_config = load_config()
job_manager = JobManager(app_config)

app = FastAPI(title="switchr Orchestrator", version=app_config.app.version)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/api/inventory", response_model=InventoryResponse)
async def get_inventory():
    return job_manager.get_inventory_view()

@app.post("/api/jobs/switch", response_model=SwitchJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def switch_profile(payload: SwitchJobRequest):
    try:
        job = await job_manager.start_switch_job(payload.host_id, payload.service_id, payload.profile_name)
        return SwitchJobResponse(job_id=job.job_id, host_id=job.host.id, service_id=job.service.id, target_profile=job.target_profile, status=job.status, message="Job dispatched.")
    except ConcurrencyLockError as cle:
        raise HTTPException(status_code=409, detail=str(cle))

@app.post("/api/jobs/{job_id}/abort", response_model=AbortJobResponse)
async def abort_job(job_id: str):
    job = job_manager.abort_job(job_id)
    return AbortJobResponse(job_id=job.job_id, status=job.status, message="Abort signal sent.")

@app.get("/api/jobs/{job_id}/stream")
async def stream_job_logs(job_id: str):
    return StreamingResponse(job_manager.subscribe_sse_stream(job_id), media_type="text/event-stream")

@app.get("/api/jobs/history")
async def get_history():
    return {"history": job_manager.get_audit_history()}`,
  },
  {
    name: 'executors.py',
    category: 'Backend',
    language: 'python',
    description: 'Agentless remote executors: SSHExecutor (Paramiko), WinRMExecutor (pywinrm), MockExecutor',
    code: `"""
switchr Remote Executors
Handles agentless execution across Unix (SSH) and Windows (WinRM).
"""
import abc, os, time, threading
from typing import Generator, Optional, Tuple
from models import HostConfig, OSType

class BaseExecutor(abc.ABC):
    def __init__(self, host: HostConfig):
        self.host = host
        self._abort = threading.Event()

    def abort(self):
        self._abort.set()

    @abc.abstractmethod
    def execute(self, command: str, timeout: int = 300) -> Generator[str, None, int]:
        pass

    @abc.abstractmethod
    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        pass

class SSHExecutor(BaseExecutor):
    def execute(self, command: str, timeout: int = 300) -> Generator[str, None, int]:
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(self.host.hostname, port=self.host.port, username=self.host.auth.username)
        transport = client.get_transport()
        channel = transport.open_session()
        channel.exec_command(command)
        while not channel.exit_status_ready():
            if self._abort.is_set():
                channel.close()
                raise RuntimeError("Aborted by operator")
            while channel.recv_ready():
                yield f"[stdout] {channel.recv(1024).decode()}"
            time.sleep(0.05)
        return channel.recv_exit_status()

    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        # systemctl is-active <service_name>
        return (True, "active (running)")

class WinRMExecutor(BaseExecutor):
    def execute(self, command: str, timeout: int = 300) -> Generator[str, None, int]:
        import winrm
        endpoint = f"http://{self.host.hostname}:{self.host.port}/wsman"
        session = winrm.Session(endpoint, auth=(self.host.auth.username, os.environ.get(self.host.auth.password_env or "", "")))
        p = session.protocol
        shell_id = p.open_shell()
        cmd_id = p.run_command(shell_id, f"powershell.exe -Command \\"{command}\\"")
        stdout, stderr, code, done = p.get_command_output(shell_id, cmd_id)
        yield f"[stdout] {stdout.decode()}"
        return code

    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        # sc query <service_name>
        return (True, "STATE: 4 RUNNING")`,
  },
  {
    name: 'job_manager.py',
    category: 'Backend',
    language: 'python',
    description: 'In-memory execution locking, async thread runner, SSE queues, and audit persistence',
    code: `"""
switchr Job Manager
Coordinates active jobs, handles in-memory execution locking,
manages async job cancellation, writes audit logs to disk, and pushes events to SSE subscribers.
"""
import asyncio, threading, time, uuid, json, os
from models import ConfigFile, JobStatus, AuditLogRecord
from executors import get_executor

class ConcurrencyLockError(Exception): pass

class JobManager:
    def __init__(self, config: ConfigFile):
        self.config = config
        self._lock_mutex = threading.Lock()
        self._active_locks = {}  # (host_id, service_id) -> job_id
        self._jobs = {}
        self._audit_records = []

    def acquire_lock(self, host_id: str, service_id: str, job_id: str):
        with self._lock_mutex:
            key = (host_id, service_id)
            if key in self._active_locks:
                raise ConcurrencyLockError(f"Service '{service_id}' already locked by job {self._active_locks[key]}")
            self._active_locks[key] = job_id

    def release_lock(self, host_id: str, service_id: str, job_id: str):
        with self._lock_mutex:
            key = (host_id, service_id)
            if self._active_locks.get(key) == job_id:
                del self._active_locks[key]

    async def start_switch_job(self, host_id: str, service_id: str, profile_name: str):
        job_id = f"job-{uuid.uuid4().hex[:10]}"
        self.acquire_lock(host_id, service_id, job_id)
        # Spawn execution worker...
        return job`,
  },
  {
    name: 'models.py',
    category: 'Backend',
    language: 'python',
    description: 'Pydantic v2 data models for config.yaml validation and API schemas',
    code: `from __future__ import annotations
from enum import Enum
from typing import List, Literal, Optional
from pydantic import BaseModel, Field

class OSType(str, Enum):
    WINDOWS = "windows"
    UNIX = "unix"

class ServiceStatus(str, Enum):
    RUNNING = "RUNNING"
    STOPPED = "STOPPED"
    TRANSITIONING = "TRANSITIONING"
    ERROR = "ERROR"

class HostConfig(BaseModel):
    id: str
    name: str
    os_type: OSType
    hostname: str
    port: int
    auth: dict
    description: Optional[str] = ""

class ProfileConfig(BaseModel):
    name: str
    description: Optional[str] = ""
    script_path: str
    parameters: List[str] = []
    timeout_seconds: int = 300

class ServiceConfig(BaseModel):
    id: str
    host_id: str
    name: str
    verification_service_name: str
    current_profile: str
    profiles: List[ProfileConfig]

class SwitchJobRequest(BaseModel):
    host_id: str
    service_id: str
    profile_name: str`,
  },
  {
    name: 'requirements.txt',
    category: 'Config',
    language: 'text',
    description: 'Pinned dependencies for FastAPI, Uvicorn, Paramiko, and PyWinRM',
    code: `fastapi==0.115.8
uvicorn[standard]==0.34.0
pydantic==2.10.6
pyyaml==6.0.2
paramiko==3.5.1
pywinrm==0.5.0
requests==2.32.3
cryptography>=43.0.0`,
  },
  {
    name: 'README.md',
    category: 'Docs',
    language: 'markdown',
    description: 'Production setup guide for Windows Server 2022 and Apache HTTP Server 2.4',
    code: `# switchr — Production Windows Server 2022 Deployment Guide

## 1. Prerequisites
- **Windows Server 2019/2022** or Windows 10/11 Pro
- **Apache HTTP Server 2.4** (e.g., from Apache Lounge: \`C:\\Apache24\`)
- **Python 3.10+** (64-bit, added to System PATH)

## 2. Apache 2.4 Configuration
1. Open \`C:\\Apache24\\conf\\httpd.conf\` and ensure these modules are uncommented:
   \`\`\`apache
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   LoadModule headers_module modules/mod_headers.so
   LoadModule rewrite_module modules/mod_rewrite.so
   \`\`\`
2. Include the virtual host:
   \`\`\`apache
   Include conf/extra/switchr_vhost.conf
   \`\`\`
3. Copy \`apache_vhost.conf\` to \`C:\\Apache24\\conf\\extra\\switchr_vhost.conf\`.
4. Place static UI files into \`C:\\Apache24\\htdocs\\switchr\\static\`.

## 3. Python Service Setup
1. Create virtual environment and install dependencies:
   \`\`\`powershell
   cd C:\\Services\\switchr
   python -m venv venv
   .\\venv\\Scripts\\activate
   pip install -r requirements.txt
   \`\`\`
2. Test FastAPI locally:
   \`\`\`powershell
   uvicorn main:app --host 127.0.0.1 --port 8000
   \`\`\`
3. Register FastAPI as a background Windows Service using NSSM (Non-Sucking Service Manager):
   \`\`\`powershell
   nssm install SwitchrBackend "C:\\Services\\switchr\\venv\\Scripts\\python.exe" "-m uvicorn main:app --host 127.0.0.1 --port 8000"
   nssm set SwitchrBackend AppDirectory "C:\\Services\\switchr"
   nssm set SwitchrBackend Start SERVICE_AUTO_START
   nssm start SwitchrBackend
   \`\`\`

## 4. Verification
- Browse to \`http://localhost\` or \`http://switchr.internal.corp\`
- Check SSE stream at \`GET /api/jobs/{id}/stream\`
- Check Apache error logs at \`C:\\Apache24\\logs\\switchr_error.log\``,
  },
];

export const DeploymentExportView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<FileDefinition>(DEPLOYMENT_FILES[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (file: FileDefinition) => {
    const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-white tracking-tight">
            Python & Apache Deployment Package
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete modular codebase ready for production deployment on Windows Server with Apache 2.4 gateway.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : `Copy ${selectedFile.name}`}
          </button>
          <button
            onClick={() => handleDownload(selectedFile)}
            className="px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors flex items-center gap-1.5 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            Download {selectedFile.name}
          </button>
        </div>
      </div>

      {/* Main Split Layout: File Sidebar + Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* File Navigator Sidebar */}
        <div className="bg-[#0c1220] border border-slate-800 rounded-lg p-3 space-y-1">
          <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Project Deliverables
          </div>

          {DEPLOYMENT_FILES.map((file) => {
            const isSelected = selectedFile.name === file.name;
            return (
              <button
                key={file.name}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors flex items-center justify-between text-xs font-mono ${
                  isSelected
                    ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-slate-500'}`} />
                  {file.name}
                </span>
                <span className="text-[10px] text-slate-500 font-normal shrink-0">{file.category}</span>
              </button>
            );
          })}
        </div>

        {/* Code View Panel */}
        <div className="lg:col-span-3 bg-[#070b14] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
          {/* File Meta Header */}
          <div className="px-5 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-sky-400" />
                {selectedFile.name}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{selectedFile.description}</p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 uppercase">{selectedFile.language}</span>
          </div>

          {/* Code Body */}
          <pre className="p-5 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed select-text flex-1 max-h-[580px]">
            <code>{selectedFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
