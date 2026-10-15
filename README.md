# switchr — Remote Service Configuration Orchestrator

A Windows-hosted service configuration orchestrator designed to allow non-technical operators to safely switch configuration profiles of services running across remote Windows (`*.bat`) and Unix (`*.sh`) servers via a clean web UI, without requiring remote desktop (RDP) or WinSCP/SSH access.

---

## Architecture Overview

```
                      [Operator Browser]
                              │
                              ▼
            [Apache HTTP Server 2.4 (Gateway)]
             • Serves /static/ (HTML/JS/CSS)
             • Reverse Proxies /api to FastAPI
             • SSE flushpackets=on (Unbuffered)
                              │
                              ▼
                [FastAPI Backend (Uvicorn)]
                127.0.0.1:8000 (Python 3.10+)
                 ├── (host, service) Mutex Lock
                 ├── Job Manager & Audit Logs
                 └── Live SSE Event Broadcaster
                   │                       │
      (WinRM WS-Man 5985)          (SSH Port 22)
                   ▼                       ▼
          [Windows Target]           [Unix Target]
           • *.bat scripts           • *.sh scripts
           • Probe: sc query         • Probe: systemctl
```

---

## Required Files Created

1. **`config.yaml`**: Declarative configuration specifying target hosts, credentials/key paths, managed services, configuration profiles, timeout budgets, and post-execution verification probe service names.
2. **`models.py`**: Pydantic v2 schemas validating `config.yaml`, request bodies, and audit log responses.
3. **`executors.py`**:
   - `BaseExecutor`: Abstract interface yielding live output lines.
   - `SSHExecutor`: Paramiko-based Unix execution streaming stdout/stderr.
   - `WinRMExecutor`: PyWinRM-based Windows execution via PowerShell.
   - `MockExecutor`: Dry-run executor with realistic delays and script steps.
4. **`job_manager.py`**: In-memory mutex locking per `(host_id, service_id)`, 409 Conflict rejection, asynchronous thread worker, SSE subscriber queue broadcasting, fail-fast verification probe, and disk audit logging.
5. **`main.py`**: FastAPI application with `/api/inventory`, `/api/jobs/switch`, `/api/jobs/{id}/abort`, `/api/jobs/{id}/stream`, `/api/jobs/history`, and static asset hosting.
6. **`static/index.html`**: Standalone single-page operator dashboard (Tailwind CSS, Vanilla JS) with fleet inventory, profile dropdowns, confirmation modal, live SSE terminal drawer, and abort controls.
7. **`apache_vhost.conf`**: Apache 2.4 VirtualHost configuration with `mod_proxy_http` reverse proxy and `flushpackets=on` unbuffered SSE streaming.
8. **`requirements.txt`**: Pinned Python dependencies.

---

## Deployment on Windows Server 2022 with Apache 2.4

### 1. Prerequisites
- **Windows Server 2019/2022** or Windows 10/11 Pro
- **Apache HTTP Server 2.4** (e.g. `C:\Apache24` from Apache Lounge)
- **Python 3.10+** (64-bit, installed and added to System PATH)

### 2. Configure Apache 2.4
1. Edit `C:\Apache24\conf\httpd.conf` and ensure the following modules are loaded:
   ```apache
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   LoadModule headers_module modules/mod_headers.so
   LoadModule rewrite_module modules/mod_rewrite.so
   ```
2. Enable Virtual Hosts in `httpd.conf`:
   ```apache
   Include conf/extra/switchr_vhost.conf
   ```
3. Copy `apache_vhost.conf` to `C:\Apache24\conf\extra\switchr_vhost.conf`.
4. Copy the `static/` directory to `C:\Apache24\htdocs\switchr\static`.

### 3. Setup Python Backend as a Windows Service
1. Open an elevated PowerShell prompt:
   ```powershell
   mkdir C:\Services\switchr
   cd C:\Services\switchr
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Configure environment variables for credentials in `config.yaml` or Windows System Environment Variables:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('WIN_CORE_PASSWORD', 'YourSecurePassword!', 'Machine')
   ```
3. Test FastAPI locally:
   ```powershell
   uvicorn main:app --host 127.0.0.1 --port 8000
   ```
4. Install FastAPI as a persistent background Windows Service using NSSM:
   ```powershell
   # Download NSSM (Non-Sucking Service Manager) to C:\tools\nssm.exe
   nssm install SwitchrService "C:\Services\switchr\venv\Scripts\python.exe" "-m uvicorn main:app --host 127.0.0.1 --port 8000"
   nssm set SwitchrService AppDirectory "C:\Services\switchr"
   nssm set SwitchrService Start SERVICE_AUTO_START
   nssm start SwitchrService
   ```

### 4. Verify End-to-End Orchestration
- Access dashboard at `http://localhost` or `http://switchr.internal.corp`.
- Select a service profile and click **Switch Configuration**.
- Observe live console output streaming line-by-line via Server-Sent Events.
- Verify that simultaneous switches on the same service return **HTTP 409 Conflict**.
