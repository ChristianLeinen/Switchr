# Switchr — Remote Service Configuration Orchestrator

A Windows-hosted service configuration orchestrator designed to allow non-technical operators to safely switch configuration profiles of services running across remote Windows (`*.bat`) and Unix (`*.sh`) servers via a clean web UI, without requiring remote desktop (RDP) or WinSCP/SSH access.

---

## Architecture Overview

```
                      [Operator Browser]
                              │
                              ▼
            [Apache HTTP Server 2.4 (Gateway)]
             • Serves static UI (/index.html, JS, CSS)
             • Reverse Proxies /api to Express Backend
             • SSE flushpackets=on (Unbuffered)
                              │
                              ▼
            [Express TypeScript Server (Node.js)]
            127.0.0.1:3000 (server.ts)
             ├── In-Memory Mutex Lock (host_id, service_id)
             ├── Job Manager & Disk Audit Logs
             └── Live SSE Stream Broadcaster (/api/jobs/:id/stream)
                   │                       │
      (WinRM WS-Man 5985)          (SSH Port 22)
                   ▼                       ▼
          [Windows Target]           [Unix Target]
           • *.bat scripts           • *.sh scripts
           • Probe: sc query         • Probe: systemctl
```

---

## Project Structure

1. **`config.yaml`**: Declarative inventory specifying target hosts, credentials/key paths, managed services, configuration profiles, timeout budgets, and post-execution verification probe service names.
2. **`server.ts`**: Full-stack Express TypeScript backend providing:
   - `GET /api/health`: Health status, app version, dry-run mode.
   - `GET /api/inventory`: Targets, services, active profiles, lock states.
   - `POST /api/jobs/switch`: Enforces `(host_id, service_id)` mutex lock; returns HTTP 409 Conflict if locked.
   - `POST /api/jobs/:id/abort`: Aborts running job and terminates remote channel.
   - `GET /api/jobs/:id/stream`: Server-Sent Events (SSE) streaming real-time stdout/stderr lines.
   - `GET /api/jobs/history`: Historical audit records.
   - `GET /api/config/raw`: Raw `config.yaml` content.
   - Integrated Vite middleware serving the React SPA dashboard on port 3000.
3. **`static/index.html`**: Standalone single-page operator dashboard (Tailwind CSS, Vanilla JS) with fleet inventory, profile dropdowns, confirmation modal, live SSE terminal drawer, and abort controls.
4. **`apache_vhost.conf`**: Apache 2.4 VirtualHost configuration with `mod_proxy_http` reverse proxy and `flushpackets=on` unbuffered SSE streaming.
5. **`package.json`**: Node.js dependencies (`express`, `tsx`, `yaml`, `react`, `vite`, `tailwindcss`).

---

## Deployment on Windows Server 2022 with Apache 2.4

### 1. Prerequisites
- **Windows Server 2019/2022** or Windows 10/11 Pro
- **Apache HTTP Server 2.4** (e.g. `C:\Apache24` from Apache Lounge)
- **Node.js 20+ LTS** (installed and added to System PATH)

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
4. Copy the static build or `static/` directory to `C:\Apache24\htdocs\switchr\static`.

### 3. Setup Node.js Backend as a Windows Service
1. Open an elevated PowerShell prompt:
   ```powershell
   cd C:\Services\switchr
   npm install
   npm run build
   ```
2. Configure environment variables for credentials in `config.yaml` or Windows System Environment Variables:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('WIN_CORE_PASSWORD', 'YourSecurePassword!', 'Machine')
   ```
3. Test server locally:
   ```powershell
   npm run dev
   ```
4. Install as a persistent background Windows Service using NSSM:
   ```powershell
   nssm install SwitchrBackend "C:\Program Files\nodejs\node.exe" "C:\Services\switchr\node_modules\tsx\dist\cli.mjs server.ts"
   nssm set SwitchrBackend AppDirectory "C:\Services\switchr"
   nssm set SwitchrBackend Start SERVICE_AUTO_START
   nssm start SwitchrBackend
   ```

### 4. Verify End-to-End Orchestration
- Access dashboard at `http://localhost:3000` or `http://switchr.internal.corp`.
- Select a service profile and click **Switch Profile**.
- Observe live console output streaming line-by-line via Server-Sent Events.
- Verify that simultaneous switches on the same service return **HTTP 409 Conflict**.
