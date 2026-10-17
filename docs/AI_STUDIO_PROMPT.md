# Starter Prompt for Google AI Studio: Remote Service Configuration Orchestrator

Copy and paste the prompt below directly into **Google AI Studio** (using Gemini 1.5 Pro or Gemini 2.0 Flash / Pro) as a System Instruction or User Prompt to generate the complete application.

```markdown
You are an expert full-stack Python and DevOps engineer. Build a complete, production-ready, Windows-hosted **Service Configuration Orchestrator**. 

### 1. Context & Architecture
- **Purpose**: Allow non-technical operators to switch configuration profiles of services running across remote Windows (*.bat) and Unix (*.sh) servers via a clean web UI, without requiring remote desktop (RDP) or WinSCP/SSH access.
- **Web Server Gateway**: Runs on a Windows machine hosting **Apache HTTP Server 2.4**. Apache terminates client requests, serves static UI assets, and reverse-proxies `/api` requests to a local Python backend via `mod_proxy_http`.
- **Backend Runtime**: Python 3.10+ using **FastAPI** and **Uvicorn** running locally on `http://127.0.0.1:8000`.
- **Remote Execution (Agentless)**:
  - Unix target hosts: SSH using `paramiko`.
  - Windows target hosts: WinRM (WS-Management / PowerShell) using `pywinrm`.
- **Real-Time Streaming**: Console output (`stdout`/`stderr`) is streamed line-by-line to the browser using **Server-Sent Events (SSE)** over standard HTTP (`GET /api/jobs/{id}/stream`), avoiding WebSocket proxying overhead.
- **Dry-Run / Simulation Mode**: Include an environment variable or config flag (`DRY_RUN=True`) so the application can be run and tested without connecting to live remote machines (simulating script execution with realistic delays and terminal logs).

---

### 2. Domain Model & Operational Safety
Follow these strict domain invariants:
- **Target Host**: A remote Windows or Unix machine.
- **Managed Service**: A background service/daemon on a Target Host.
- **Configuration Profile**: A named operational profile (e.g. `Profile-A`, `Profile-B`).
- **Execution Lock**: Enforce an in-memory lock per `(host_id, service_id)`. If a switch job is running on a service, reject any concurrent switch requests on that service with HTTP 409 Conflict.
- **Timeout & Abort**: Each job has a configurable timeout (default 300s) and an endpoint `POST /api/jobs/{id}/abort` to cancel active jobs and terminate remote sessions.
- **Post-Execution Verification Probe**: After the transition script exits with code 0, automatically run a verification probe (`sc query <service_name>` on Windows, `systemctl is-active <service_name>` or `ps` on Unix) to confirm the service is actually `RUNNING`.
- **Fail-Fast**: If a script exits with non-zero or an error occurs, halt immediately, mark the job as `FAILED`, and surface full error streams. Do not attempt blind automated rollback.
- **Audit Logging**: Every completed or failed job writes a timestamped record and full stdout/stderr stream to a local `logs/` directory.

---

### 3. Required File Structure
Generate the following modular files:

1. `config.yaml`:
   Sample declarative configuration defining:
   - Target hosts (Windows and Unix, with hostnames, ports, auth credentials or private key paths).
   - Managed services on each host.
   - Available configuration profiles, script paths (dedicated `.bat`/`.sh` files or parameterized commands), and service verification names.
2. `models.py`:
   Pydantic v2 models for parsing and strictly validating `config.yaml`, plus API response schemas.
3. `executors.py`:
   - `BaseExecutor`: Abstract interface yielding output lines in real time: `execute(command, timeout) -> Generator[str, None, int]`.
   - `SSHExecutor`: Paramiko-based implementation capturing live stdout/stderr streams.
   - `WinRMExecutor`: PyWinRM-based implementation streaming execution output.
   - `MockExecutor`: Simulated executor for local testing and demonstration.
4. `job_manager.py`:
   Coordinates active jobs, handles in-memory execution locking, manages async job cancellation, writes audit logs to disk, and pushes events to SSE subscribers.
5. `main.py`:
   FastAPI application defining:
   - `GET /api/inventory`: Returns target hosts, services, active/last-known profiles, and lock states.
   - `POST /api/jobs/switch`: Body: `{host_id, service_id, profile_name}`. Validates lock, starts background job, returns `{job_id}`.
   - `POST /api/jobs/{id}/abort`: Aborts a running job.
   - `GET /api/jobs/{id}/stream`: SSE endpoint (`text/event-stream`) streaming real-time log events.
   - `GET /api/jobs/history`: Returns past execution audit logs.
   - Static file mounting for local development.
6. `static/index.html`:
   A modern, single-page dashboard (standalone HTML with embedded CSS and modern Vanilla JS/Vue 3 via CDN):
   - **Dashboard Grid**: Cards or table showing each Target Host (OS badge, host name), Managed Service, current status badge (RUNNING, STOPPED, LOCKED), and active Configuration Profile.
   - **Switch Action**: Dropdown to select a profile and a "Switch Configuration" button opening a confirmation modal.
   - **Live Terminal Console**: A dark-mode slide-out drawer or modal showing auto-scrolling terminal logs in real time as SSE events arrive.
   - **Abort Button**: Allows operators to abort a running job directly from the console.
7. `apache_vhost.conf`:
   An Apache 2.4 VirtualHost configuration snippet demonstrating how to:
   - Serve `/` from the `static/` folder.
   - Proxy `/api` to `http://127.0.0.1:8000/api` using `mod_proxy` and `mod_proxy_http` with buffering disabled for SSE (`ProxyPass` with `flushpackets=on`).
8. `requirements.txt`:
   Listing pinned versions for `fastapi`, `uvicorn`, `paramiko`, `pywinrm`, `pydantic`, `pyyaml`.

---

### 4. Implementation Guidelines
- Code must be robust, clean, well-commented, and ready to run.
- Include proper error handling for connection timeouts, authentication failures, and socket disconnects.
- Keep the frontend self-contained in `static/index.html` (using Tailwind CSS via CDN or clean modern custom CSS) so no Node.js/npm build steps are required.
```
