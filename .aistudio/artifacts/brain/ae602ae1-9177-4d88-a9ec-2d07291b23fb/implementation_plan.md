# Switchr: Multi-Script Execution Pipeline & Active Profile Path Support

Adapt the Switchr frontend and development server to support the updated C# backend architecture featuring sequential multi-script execution pipelines and dynamic remote file reading via `active_profile_path`.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and guide this update:
> - **Unassigned Active Profile**: When `current_profile` is null or empty (e.g. `active_profile_path` is not configured, file not found, or empty), display a clean `Active: None` indicator and prompt the operator with `-- Select profile to apply --`.
> - **Multi-Script Pipeline in Confirmation Modal**: Render a numbered, sequential execution pipeline showing step names (e.g. `1. Stop service`, `2. Copy configuration`, `3. Start service`), script paths, parameters, and per-step timeout budgets.
> - **Full Dev Server & Simulation Alignment**: Update `server.ts` and `mockOrchestrator.ts` to simulate serial step progression (`[STEP X/Y] Starting... -> Finished successfully...`), enforce fail-fast termination if any step fails, and read/write active profile states via `active_profile_path`.

---

### 1. Overview & Core Concept

The updated configuration model moves from a single script per profile to a **sequential multi-script pipeline** (`scripts: [...]`), where steps are executed strictly in order (e.g., stop service &rarr; deploy new config &rarr; start service). Execution halts immediately if any step fails. Furthermore, `current_profile` is no longer a static configuration field; it is dynamically resolved at runtime by reading a text file on the remote host specified by `active_profile_path`. If that file does not exist or is empty, `current_profile` remains `null`.

The frontend must cleanly reflect:
1. **Dynamic Active Profile**: Gracefully display `None` when a service has no active profile detected, and enable initial profile selection without defaulting to a nonexistent profile.
2. **Sequential Script Pipelines**: Visual pipeline display in the confirmation modal, service cards, and real-time terminal drawer, detailing step-by-step progress through the transition sequence.
3. **Serial Step Streaming**: Streamline log output with clear step boundaries (`[STEP 1/3] Starting: Stop service...`).

---

### 2. User Experience & Visual Design

Following the universal frontend design constitution and enterprise SaaS dashboard guidelines:

#### Fleet & Service View
- **Active Profile Badge**:
  - Populated state: `Active: <strong class="text-sky-300 font-normal">prod-high</strong>`
  - Unassigned state (`current_profile === null`): `Active: <strong class="text-slate-500 font-normal">None</strong>`
- **Profile Selector**:
  - If `current_profile` is null, the select dropdown defaults to `-- Select profile to apply --` (`value=""`), requiring explicit user intent before enabling the switch button.
- **Pipeline Indicator**:
  - Displays a subtle metadata counter: `3 script steps · 210s total timeout`.

#### Confirmation Modal
- **Sequential Pipeline View**:
  - Renders a clean numbered list of script steps:
    ```
    1. Stop service          C:\...\stop_service.bat             60s
    2. Copy configuration    C:\...\apply_config.bat --mode ...  90s
    3. Start service         C:\...\start_service.bat            60s
    ```
  - Displays total pipeline duration and failure warning.

#### Real-Time Terminal Console
- Streams serial step markers:
  - `[STEP 1/3] Starting: Stop service (C:\...\stop.bat)`
  - `[stdout] ...`
  - `[STEP 1/3] Finished successfully: Stop service`
  - `[STEP 2/3] Starting: Copy configuration...`
- Automated post-execution verification probe runs only after all pipeline steps complete with exit code 0.
- Confirms active profile update from `active_profile_path`.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Backward-Compatible Profile Resolution
- *Chosen Approach*: Support both new `scripts: ScriptStepConfig[]` and legacy single-script `script_path` / `parameters` / `timeout_seconds` across TypeScript types, `server.ts`, and `mockOrchestrator.ts`.
- *Why*: Allows zero-regression operation whether a profile defines multiple script steps or a single legacy script.

#### Decision 2: Guarding Switch Execution on Unselected Profile
- *Chosen Approach*: Disable the "Switch Profile" button when `selectedProfile === ""` (unassigned profile and no dropdown selection made yet).
- *Why*: Prevents accidental execution with undefined parameters when a service has no active profile.

#### Decision 3: Realistic Multi-Script Simulation in Development
- *Chosen Approach*: Implement serial step delay loops in `server.ts` and `mockOrchestrator.ts` with matching `[STEP X/Y]` log lines, simulating the C# `JobManager` behavior faithfully in local preview.
- *Why*: Guarantees that operators testing the web console observe the exact same streaming behavior and step timing as in production.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Operator Web Interface                          │
│  ┌───────────────────────┐ ┌──────────────────────┐ ┌───────────────┐  │
│  │ Fleet View            │ │ Confirmation Modal   │ │ Live Terminal │  │
│  │ Active: None / profA  │ │ Numbered Pipeline    │ │ Step 1/3 ->   │  │
│  │ Profile Selector      │ │ Steps 1..N           │ │ Step 3/3 ->   │  │
│  └───────────┬───────────┘ └──────────┬───────────┘ └───────▲───────┘  │
└──────────────┼────────────────────────┼─────────────────────┼──────────┘
               │                        │                     │
               ▼                        ▼                     │
┌─────────────────────────────────────────────────────────────┴──────────┐
│             C# Production Backend / Node.js Dev Server                 │
│                                                                        │
│   • Reads active profile from 'active_profile_path'                    │
│   • If file missing/empty -> current_profile = null                    │
│   • Executes scripts in serial sequence:                               │
│       Step 1: Execute -> wait exit code 0                              │
│       Step 2: Execute -> wait exit code 0                              │
│       Step N: Execute -> wait exit code 0                              │
│   • Verification probe: sc query / systemctl is-active                 │
│   • Refreshes active profile from file upon completion                 │
└────────────────────────────────────────────────────────────────────────┘
```

#### Updated Type Definitions (`src/types.ts`)
```typescript
export interface ScriptStepConfig {
  name: string;
  script_path: string;
  parameters: string[];
  timeout_seconds: number;
}

export interface ConfigProfile {
  name: string;
  description: string;
  // Legacy single-script fallback
  script_path?: string;
  parameters?: string[];
  timeout_seconds?: number;
  // Multi-script sequential pipeline
  scripts?: ScriptStepConfig[];
}

export interface ManagedService {
  id: string;
  host_id: string;
  name: string;
  service_type: 'windows_service' | 'systemd' | 'generic_process';
  verification_service_name: string;
  active_profile_path?: string | null;
  current_profile: string | null; // Nullable if not read or unconfigured
  description: string;
  status: ServiceStatus;
  is_locked: boolean;
  active_job_id?: string;
  profiles: ConfigProfile[];
}
```

#### Files to Modify
1. `src/types.ts`: Add `ScriptStepConfig`, make `current_profile` nullable (`string | null`), add `active_profile_path`, and support `scripts` in `ConfigProfile`.
2. `server.ts`: Update backend data models, implement serial step execution loop, load/write `active_profile_path`, and handle null `current_profile`.
3. `src/services/mockOrchestrator.ts`: Update mock inventory with new `active_profile_path` and `scripts: [...]` from `config.yaml`, update serial execution logic, and manage `current_profile` nullability.
4. `src/components/FleetView.tsx`: Render `Active: None` when `current_profile` is null, add default unselected option `-- Select profile to apply --`, and display step count.
5. `src/components/ConfirmModal.tsx`: Render the numbered multi-script execution pipeline with step names, paths, arguments, and timeouts.
6. `src/components/ConfigViewer.tsx`: Update YAML viewer and schema validator for `active_profile_path` and multi-script profiles.
7. `static/index.html`: Update standalone dashboard to match the multi-script pipeline and null profile handling.
