# switchr: Remote Service Configuration Orchestrator

A production-grade, agentless service configuration orchestrator enabling operators to safely switch configuration profiles across remote Windows (*.bat) and Unix (*.sh) servers through a streamlined web interface with real-time SSE log streaming, strict concurrency locks, and automated post-execution verification probes.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified in Phase 1 and guide this plan:
> - **Preview & Deployment Model**: Interactive, high-fidelity simulator in the web preview providing full real-time terminal streaming, lock conflict simulation, and configuration inspection, paired with complete production Python backend files (`main.py`, `models.py`, `executors.py`, `job_manager.py`, `config.yaml`, `apache_vhost.conf`, and `requirements.txt`) ready for export and Windows/Apache deployment.
> - **Configuration Management**: View and switch profiles directly, featuring an in-app `config.yaml` inspector, schema validator, and live inventory sync.
> - **Visual Direction**: Modern dark DevOps console with high-contrast semantic status indicators, zero-pill typography, tabular monospace telemetry, and an integrated real-time execution drawer.

---

### 1. Overview & Core Concept

**switchr** solves the operational friction and security hazards of having non-technical operators manually RDP into Windows machines or SSH/WinSCP into Linux servers to swap configuration scripts and restart background daemons.

#### Target Audience & Operator Persona
- **Operations & Support Engineers**: Need to toggle production or staging profiles (e.g., switching payment gateways, shifting traffic profiles, or cycling maintenance modes) safely without terminal access or host credentials.
- **System Administrators & DevOps Leads**: Require declarative YAML configuration, agentless execution (SSH via `paramiko`, WinRM via `pywinrm`), strict concurrency mutual exclusion, audit trails, and automated verification before declaring a transition successful.

#### Core Value Proposition
- **Agentless Execution**: Zero software agents to install or maintain on target hosts.
- **Fail-Safe Orchestration**: Granular `(host_id, service_id)` mutex locking preventing concurrent switches, with immediate non-zero fail-fast semantics and automated post-execution probes (`sc query` on Windows, `systemctl is-active` on Unix).
- **Live Observability**: Real-time line-by-line log output streamed via Server-Sent Events (SSE) into an embedded ANSI terminal console with instant abort capabilities.

---

### 2. User Experience & Visual Design

Following the universal frontend design constitution and enterprise SaaS dashboard guidelines:

#### Key User Flows
1. **Inventory Exploration**: Operator opens the dashboard; target hosts appear grouped or filtered by OS (Windows / Unix) with live service state (Running, Stopped, Transitioning, Locked) and currently active profile.
2. **Profile Switch Initiation**: Operator selects a new profile from a clean dropdown and clicks "Switch Configuration". A modal confirms the transition command, target host, expected script, and lock requirements.
3. **Real-Time Monitoring**: On confirmation, an execution drawer slides in displaying a live dark terminal with auto-scrolling stdout/stderr output, elapsed timer, and an active "Abort Job" button.
4. **Post-Probe & Audit Log**: After the transition script exits (code 0), an automatic verification probe runs. Once confirmed healthy, the UI updates the active profile, releases the lock, and logs a full timestamped audit entry.
5. **Conflict & Safety Handling**: If an operator attempts to switch a service while another switch is active, the system rejects with a clear HTTP 409 Conflict toast and status indication.
6. **Config & Code Inspection**: Operators can switch tabs to view the active `config.yaml`, validate syntax, and preview/copy the production Python backend and Apache vhost configuration files.

#### Visual Identity & Theme
- **Canvas & Atmosphere**: Dark slate canvas (`#0A0F1D` / `#0D1527`) with subtle border lines (`rgba(255, 255, 255, 0.08)`), single-elevation flat panels, and zero drop-shadow clutter.
- **Color Distribution (60-30-10)**:
  - 60% Neutral canvas: Deep slate background.
  - 30% Structural surfaces: Slate card containers, table row highlights, and console backgrounds (`#070B14`).
  - 10% High-intent semantic accents:
    - **Active / Running**: Crisp emerald (`#10B981`)
    - **Locked / In Progress**: Focused amber (`#F59E0B`)
    - **Failed / Stopped**: Clean crimson (`#EF4444`)
    - **Interactive Accents**: Sky blue (`#0284C7`) for primary triggers and focus outlines.
- **Typography & Hierarchy**:
  - Display & Headings: `Plus Jakarta Sans` for crisp, structured headers and navigation.
  - Body & UI Controls: `DM Sans` or `Plus Jakarta Sans` at 13px–15px with natural title-case labels.
  - Telemetry & Terminal: Monospace `JetBrains Mono` with tabular numerals (`tabular-nums`) for timestamps, exit codes, ports, and stream logs.
- **Zero-Pill Discipline**: Metadata (OS, port, hostname, last switched time) displayed as clean unboxed text separated by typographic middots (`·`). Semantic statuses pair explicit text labels with subtle indicator marks—never candy capsule pills.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Hybrid Interactive Simulator & Production Python Export
- **Chosen Approach**: Build an interactive React SPA with full simulated execution (realistic script steps, delays, stderr/stdout streaming, abort mechanics, and verification probe) while simultaneously bundling and exporting the exact modular Python FastAPI backend and Apache VirtualHost files requested.
- **Why**: Allows instant, full-featured evaluation directly inside the AI Studio web container while giving the user production-ready Python files to deploy directly on Windows Server with Apache 2.4.
- **Alternatives Considered**: Attempting to run a headless Python process in the container without UI would prevent visual review; a static-only page would lack live interactivity.

#### Decision 2: SSE (Server-Sent Events) over WebSockets
- **Chosen Approach**: Unidirectional HTTP streaming via SSE (`text/event-stream`) for terminal output.
- **Why**: Works seamlessly behind Apache `mod_proxy_http` without complex WebSocket upgrade configurations or proxy buffering issues (configured with `flushpackets=on`), naturally reconnects, and has lower overhead for log streams.
- **Alternatives Considered**: WebSockets require bidirectional socket maintenance and additional Apache proxy modules.

#### Decision 3: Per-Service Mutual Exclusion Lock
- **Chosen Approach**: In-memory key `(host_id, service_id)` held during job lifecycle. Concurrent switch requests immediately return HTTP 409 Conflict.
- **Why**: Guarantees that two operators cannot trigger conflicting script switches or restart sequences on the same remote service simultaneously.
- **Alternatives Considered**: Global queue would unnecessarily block independent services on other hosts.

#### Decision 4: Mandatory Post-Execution Probe & Fail-Fast
- **Chosen Approach**: Script exit code 0 triggers an immediate OS-level status check (`sc query` or `systemctl is-active`). Non-zero exit code immediately aborts without automated rollback.
- **Why**: Automated rollbacks in remote systems often compound failures. Surfacing the exact terminal output and failing fast keeps humans in control and preserves forensic logs.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Operator Web Browser                            │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌───────────────┐  │
│  │ Dashboard & Inventory │ │ Switch Action Modal  │ │ Live Terminal │  │
│  │ (Hosts & Profiles)    │ │ (Profile Selection)  │ │ (SSE Stream)  │  │
│  └───────────┬───────────┘ └──────────┬───────────┘ └───────▲───────┘  │
└──────────────┼────────────────────────┼─────────────────────┼──────────┘
               │                        │                     │
               ▼                        ▼                     │
┌─────────────────────────────────────────────────────────────┴──────────┐
│                   Apache HTTP Server 2.4 (Gateway)                     │
│   • Serves static UI assets (/index.html, JS, CSS)                     │
│   • Reverse Proxies /api/ requests with mod_proxy_http                 │
│   • ProxyPass /api/jobs/{id}/stream flushpackets=on (Unbuffered SSE)   │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python 3.10+)                     │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐  │
│  │   API Routes (main.py)  │◄────────┤   Job Manager & Locks        │  │
│  │   • GET /api/inventory  │         │   • (host_id, service_id) lock   │  │
│  │   • POST /api/jobs/switch         │   • SSE event broadcaster        │  │
│  │   • POST /api/jobs/abort│         │   • Audit log persistence        │  │
│  │   • GET /api/jobs/stream│         └──────────────┬───────────────┘  │
│  │   • GET /api/history    │                        │                  │
│  └───────────┬─────────────┘                        │                  │
│              ▼                                      ▼                  │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐  │
│  │  Pydantic Models &      │         │   Remote Executors           │  │
│  │  config.yaml Parser     │         │   • SSHExecutor (paramiko)   │  │
│  │                         │         │   • WinRMExecutor (pywinrm)  │  │
│  │                         │         │   • MockExecutor (DRY_RUN)   │  │
│  └─────────────────────────┘         └──────────────┬───────────────┘  │
└─────────────────────────────────────────────────────┼──────────────────┘
                                                      │
                         ┌────────────────────────────┴─────────────┐
                         ▼                                          ▼
            ┌─────────────────────────┐                ┌─────────────────────────┐
            │   Remote Unix Target    │                │  Remote Windows Target  │
            │   (SSH Port 22)         │                │  (WinRM Port 5985/5986) │
            │   • Run *.sh scripts    │                │  • Run *.bat/PowerShell │
            │   • Probe: systemctl ps │                │  • Probe: sc query      │
            └─────────────────────────┘                └─────────────────────────┘
```

#### Core Data Entities
1. **TargetHost**: `id`, `name`, `os_type` (`windows` | `unix`), `hostname`, `port`, `auth_type` (`password` | `key`), `description`.
2. **ManagedService**: `id`, `host_id`, `name`, `verification_service_name`, `current_profile`, `status` (`RUNNING`, `STOPPED`, `LOCKED`, `ERROR`).
3. **ConfigProfile**: `name`, `description`, `script_path`, `parameters`, `timeout_seconds`.
4. **JobRecord**: `id`, `host_id`, `service_id`, `target_profile`, `status` (`PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `ABORTED`), `started_at`, `completed_at`, `logs: string[]`, `exit_code`.

#### Production Python File Deliverables
- `config.yaml`: Structured inventory with realistic Windows and Linux hosts, profiles, and verification commands.
- `models.py`: Pydantic models for configuration validation, switch requests, and audit serialization.
- `executors.py`: Clean OOP hierarchy with `BaseExecutor`, `SSHExecutor`, `WinRMExecutor`, and `MockExecutor`.
- `job_manager.py`: Async task runner with threading locks, timeout/cancellation handling, SSE queues, and log file writing.
- `main.py`: FastAPI endpoints, CORS, lifespan handlers, static mounting, and SSE streaming.
- `apache_vhost.conf`: Complete Apache 2.4 VirtualHost block with reverse proxy, MIME headers, and SSE unbuffered streaming configuration.
- `requirements.txt`: Pinned Python dependencies.
