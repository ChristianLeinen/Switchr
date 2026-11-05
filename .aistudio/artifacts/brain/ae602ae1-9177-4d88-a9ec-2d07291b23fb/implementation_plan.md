# Implementation Plan: OpenAPI 3.0 API Specification (`docs/openapi.yaml`)

Create an exhaustive, production-grade **OpenAPI 3.0 YAML specification** at `docs/openapi.yaml` documenting every REST endpoint, Server-Sent Events (SSE) streaming channel, HTTP status code, and JSON payload required by the Switchr frontend.

---

## User Specifications & Requirements
1. **Format**: **OpenAPI / Swagger 3.0 YAML** (`docs/openapi.yaml`).
2. **Scope**: **HTTP JSON request/response schema specifications only** (pure contract specifications with clear descriptions, field types, nullability, examples, and status codes).
3. **Backend Target**: Cleanly implementable in ASP.NET Core (.NET 8/9 Minimal APIs or Controllers).

---

## Endpoints to Document in `docs/openapi.yaml`

### 1. `GET /api/health`
- **Purpose**: System readiness and version check.
- **Response `200 OK`**:
  - `status`: string (`"healthy"`)
  - `app`: string (`"Switchr"`)
  - `version`: string (`"1.0.0"`)
  - `dry_run`: boolean

### 2. `GET /api/inventory`
- **Purpose**: Complete fleet inventory of managed hosts, services, active profiles, runtime locks, and pipeline configurations.
- **Response `200 OK`**:
  - `app_version`: string
  - `dry_run`: boolean
  - `active_locks_count`: integer
  - `hosts`: Array of `HostDto`:
    - `id`, `name`, `os_type` (`"windows"` | `"unix"`), `hostname`, `port`, `description`
    - `auth`: `HostAuthDto` (`type`, `username`, optional `password_env`, `key_path`)
    - `services`: Array of `ServiceDto`:
      - `id`, `host_id`, `name`, `service_type` (`"windows_service"` | `"systemd"` | `"generic_process"`)
      - `verification_service_name`: string
      - `active_profile_path`: string or null
      - `current_profile`: string or null
      - `description`: string
      - `status`: string (`"RUNNING"` | `"STOPPED"` | `"TRANSITIONING"` | `"ERROR"`)
      - `is_locked`: boolean
      - `active_job_id`: string or null
      - `profiles`: Array of `ConfigProfileDto`:
        - `name`, `description`
        - `scripts`: Array of `ScriptStepDto` (`name`, `script_path`, `parameters`, `timeout_seconds`)
        - Legacy fallback fields (`script_path`, `parameters`, `timeout_seconds`)

### 3. `POST /api/jobs/switch`
- **Purpose**: Initiate a profile switch job on a service with concurrency locking.
- **Request Body (`application/json`)**:
  - `host_id`: string (required)
  - `service_id`: string (required)
  - `profile_name`: string (required)
  - `simulate_failure`: boolean (optional)
- **Responses**:
  - `200 OK` / `202 Accepted`: Job queued and started (`job_id`, `host_id`, `service_id`, `target_profile`, `status: "RUNNING"`, `message`)
  - `400 Bad Request`: Missing parameters, host/service/profile not found
  - `409 Conflict`: Mutual exclusion lock violation (`detail`: explaining active job ID)

### 4. `POST /api/jobs/{id}/abort`
- **Purpose**: Send an abort signal to a running execution job.
- **Path Parameter**: `id` (Job ID)
- **Responses**:
  - `200 OK`: `job_id`, `status: "ABORTED"`, `message`
  - `404 Not Found`: Job does not exist or not active

### 5. `GET /api/jobs/{id}/stream`
- **Purpose**: Real-time Server-Sent Events (SSE) log output and terminal feed.
- **Content-Type**: `text/event-stream`
- **Stream protocol**:
  - Initial buffered lines: `data: <raw text>\n\n`
  - Live lines as executed: `data: <raw text>\n\n`
  - Heartbeat: `: heartbeat\n\n`
  - Completion event: `event: done\ndata: <SUCCESS | FAILED | ABORTED>\n\n`
- **Responses**:
  - `200 OK`: Event stream opened
  - `404 Not Found`: Job ID not found

### 6. `GET /api/jobs/history`
- **Purpose**: Retrieve forensic execution records.
- **Response `200 OK`**:
  - `history`: Array of `JobRecordDto`:
    - `job_id`, `host_id`, `host_name`, `os_type`, `service_id`, `service_name`
    - `target_profile`, `previous_profile`
    - `status` (`"QUEUED"`, `"RUNNING"`, `"SUCCESS"`, `"FAILED"`, `"ABORTED"`, `"TIMED_OUT"`)
    - `exit_code`: integer or null
    - `started_at`: ISO 8601 string
    - `completed_at`: ISO 8601 string or null
    - `duration_seconds`: number or null
    - `verification_passed`: boolean
    - `logs`: Array of `LogLineDto` (`id`, `timestamp`, `text`, `type`)

### 7. `DELETE /api/jobs/history`
- **Purpose**: Clear forensic execution history and reset audit log records.
- **Response `200 OK`**:
  - `success`: boolean
  - `message`: string

---

## Verification Plan
1. **YAML Syntax & Schema Validation**:
   - Check YAML formatting, indentation, and OpenAPI 3.0.3 specification compliance.
2. **Contract Completeness**:
   - Verify every frontend model in `src/types.ts` is 100% matched by an OpenAPI schema definition.
   - Verify all endpoint routes and query/path/body parameters match `server.ts` and `src/App.tsx`.
