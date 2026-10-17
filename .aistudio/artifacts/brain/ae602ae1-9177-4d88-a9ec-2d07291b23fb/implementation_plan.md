# Switchr: Node.js/TypeScript Backend Migration & Python Removal

Remove all Python-specific files and replace the backend implementation with a clean, high-performance Node.js / Express TypeScript backend (`server.ts`) preserving identical REST endpoints, Server-Sent Events (SSE) streaming, in-memory concurrency locks, and `config.yaml` declarative configuration. Streamline the frontend interface by removing the export tab to focus purely on fleet operations.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed by the user:
> - **Backend Migration**: Remove `main.py`, `models.py`, `executors.py`, `job_manager.py`, and `requirements.txt`. Implement an Express TypeScript backend (`server.ts`) hosting the exact same API contract (`/api/inventory`, `/api/jobs/switch`, `/api/jobs/:id/stream`, `/api/jobs/:id/abort`, `/api/jobs/history`, `/api/config/raw`).
> - **Dashboard UI Streamlining**: Hide the Python export tab from the navigation and view hierarchy. Focus the operator dashboard strictly on Fleet & Services, Audit History, and Configuration YAML.
> - **Configuration & API Stability**: Keep `config.yaml` as the single source of truth for hosts, services, and profiles.

---

### 1. Overview & Core Concept

**Switchr** will operate as a unified full-stack Node.js / TypeScript application:
- **Express Backend (`server.ts`)**: Loads declarative `config.yaml`, enforces in-memory mutex locking per `(host_id, service_id)` returning HTTP 409 Conflict when a service transition is in flight, manages asynchronous jobs, persists audit logs, streams live logs over SSE (`text/event-stream`), and mounts Vite middleware for seamless preview.
- **Frontend SPA**: Clean 3-tab operator console (Fleet & Services, Audit History, Configuration YAML) interacting with live `/api` endpoints and real-time SSE streaming.

---

### 2. User Experience & Visual Design

- **Navigation Cleanup**: The top navigation bar contract is streamlined to three focused operational views:
  1. **Fleet & Services**: Host cards, service statuses (RUNNING, TRANSITIONING, ERROR), active profiles, switch controls, and 409 lock tester.
  2. **Audit History**: High-density forensic records of executions, exit codes, durations, and expandable log drawer.
  3. **Configuration YAML**: Syntax-highlighted view and schema validation of `config.yaml`.
- **Top Bar Contract**:
  - Brand Zone: `Switchr` with orchestrator insignia and version tag.
  - Nav Zone: Fleet & Services | Audit History | Configuration YAML.
  - Action Zone: Active lock indicator + "Test 409 Lock" trigger.
- **Live Terminal Console**: Drawer seamlessly connects to the Express SSE endpoint `GET /api/jobs/:id/stream` with real-time log scrolling, abort controls, and duration timer.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Full-Stack Express with Vite Middleware
- *Chosen Approach*: Implement `server.ts` with Express and integrate Vite's dev server middleware (`vite.middlewares`), updating `package.json` dev script to `tsx server.ts`.
- *Why*: Provides real HTTP server execution within AI Studio on port 3000, serving identical REST and SSE endpoints without proxy lag, while supporting instant HMR/reloading for frontend components.
- *Alternatives Considered*: Pure mock in-memory React client would not demonstrate the real backend server requested by the user.

#### Decision 2: Zero Dependency Bloat
- *Chosen Approach*: Use `yaml` npm package for declarative parsing of `config.yaml` and native Node.js EventEmitter / streams for SSE.
- *Why*: Lightweight, highly performant, and avoids heavy dependencies while maintaining type safety with TypeScript interfaces.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Operator Web Browser                            │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌───────────────┐  │
│  │ Fleet & Services View │ │ Audit History View   │ │ Live Terminal │  │
│  │ (Hosts & Profiles)    │ │ (Log Inspection)     │ │ (SSE Stream)  │  │
│  └───────────┬───────────┘ └──────────┬───────────┘ └───────▲───────┘  │
└──────────────┼────────────────────────┼─────────────────────┼──────────┘
               │                        │                     │
               ▼                        ▼                     │
┌─────────────────────────────────────────────────────────────┴──────────┐
│                   Express TypeScript Server (server.ts)                │
│   • Serves /api/* REST & SSE Endpoints                                 │
│   • Mounts Vite dev middleware for React SPA assets                    │
│   • In-Memory Mutex Lock per (host_id, service_id)                     │
│   • SSE Broadcaster: GET /api/jobs/:id/stream                          │
│   • Audit Persistence: logs/audit_history.json                         │
│   • Config Loader: parses config.yaml via 'yaml'                       │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────┐
   │    Unix Host (SSH)      │   │   Windows Host (WinRM)  │
   │    Agentless Execution  │   │   Agentless Execution   │
   └─────────────────────────┘   └─────────────────────────┘
```

#### Endpoints Contract
- `GET /api/health`: Health status, app version, dry_run mode.
- `GET /api/inventory`: Targets, services, active profiles, lock states.
- `POST /api/jobs/switch`: Body `{ host_id, service_id, profile_name, simulate_failure }`. Returns 202 Accepted with `job_id`, or 409 Conflict if locked.
- `POST /api/jobs/:id/abort`: Cancels active job.
- `GET /api/jobs/:id/stream`: Unbuffered SSE stream (`text/event-stream`).
- `GET /api/jobs/history`: Historical audit records.
- `GET /api/config/raw`: Raw `config.yaml` text.

#### Files to Delete
- `/main.py`
- `/models.py`
- `/executors.py`
- `/job_manager.py`
- `/requirements.txt`

#### Files to Update / Create
- `/server.ts`: Express TypeScript full-stack server.
- `/package.json`: Add `"yaml"` dependency; configure `"dev": "tsx server.ts"`.
- `/src/components/Header.tsx`: Remove "Python & Apache Export" navigation link.
- `/src/App.tsx`: Remove `deploy` tab route, integrate with backend API.
- `/src/components/DeploymentExportView.tsx`: Safely remove component.
- `/README.md` & `/apache_vhost.conf`: Update backend notes for Node.js / Express.
