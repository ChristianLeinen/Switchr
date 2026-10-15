"""
switchr Job Manager
Handles in-memory execution locks, asynchronous job dispatch, SSE broadcasting,
probe verification, and audit trail persistence.
"""

from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import json
import os
import threading
import time
import uuid
from typing import AsyncGenerator, Dict, List, Optional, Set, Tuple

from models import (
    AuditLogRecord,
    ConfigFile,
    HostConfig,
    JobStatus,
    ServiceConfig,
    ServiceStatus,
)
from executors import (
    BaseExecutor,
    ExecutionAbortedError,
    ExecutionTimeoutError,
    get_executor,
)


class ConcurrencyLockError(Exception):
    """Raised when an operation is requested on an already-locked service."""
    pass


class ActiveJob:
    def __init__(
        self,
        job_id: str,
        host: HostConfig,
        service: ServiceConfig,
        target_profile: str,
        is_dry_run: bool,
    ):
        self.job_id = job_id
        self.host = host
        self.service = service
        self.target_profile = target_profile
        self.previous_profile = service.current_profile
        self.is_dry_run = is_dry_run

        self.status = JobStatus.QUEUED
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.completed_at: Optional[str] = None
        self.duration_seconds: Optional[float] = None
        self.exit_code: Optional[int] = None
        self.verification_passed: bool = False
        self.error_summary: Optional[str] = None

        self.logs: List[str] = []
        self.executor: Optional[BaseExecutor] = None
        self.subscribers: Set[asyncio.Queue] = set()
        self.is_finished = False

    def emit_log(self, line: str) -> None:
        """Appends log line and notifies all active SSE subscriber queues."""
        timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]
        formatted = f"[{timestamp}] {line}"
        self.logs.append(formatted)

        # Broadcast to SSE queues
        dead_queues = set()
        for q in self.subscribers:
            try:
                q.put_nowait(formatted)
            except asyncio.QueueFull:
                pass
            except Exception:
                dead_queues.add(q)
        self.subscribers.difference_update(dead_queues)


class JobManager:
    def __init__(self, config: ConfigFile):
        self.config = config
        self.log_dir = os.path.abspath(config.app.log_dir)
        os.makedirs(self.log_dir, exist_ok=True)

        # Mutex Lock per (host_id, service_id)
        self._lock_mutex = threading.Lock()
        self._active_locks: Dict[Tuple[str, str], str] = {}  # (host_id, service_id) -> job_id
        self._jobs: Dict[str, ActiveJob] = {}
        self._audit_records: List[AuditLogRecord] = []
        self._load_existing_audit_logs()

    def _load_existing_audit_logs(self) -> None:
        audit_file = os.path.join(self.log_dir, "audit_history.json")
        if os.path.exists(audit_file):
            try:
                with open(audit_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._audit_records = [AuditLogRecord(**item) for item in data]
            except Exception:
                self._audit_records = []

    def _save_audit_record(self, job: ActiveJob) -> None:
        # Write individual full job log file
        log_filename = f"{job.job_id}_{job.host.id}_{job.service.id}.log"
        log_path = os.path.join(self.log_dir, log_filename)
        try:
            with open(log_path, "w", encoding="utf-8") as f:
                f.write(f"SWITCHR JOB EXECUTION AUDIT LOG\n")
                f.write(f"====================================================\n")
                f.write(f"Job ID: {job.job_id}\n")
                f.write(f"Host: {job.host.name} ({job.host.id} - {job.host.hostname}:{job.host.port})\n")
                f.write(f"Service: {job.service.name} ({job.service.id})\n")
                f.write(f"Target Profile: {job.target_profile}\n")
                f.write(f"Previous Profile: {job.previous_profile}\n")
                f.write(f"Status: {job.status.value}\n")
                f.write(f"Exit Code: {job.exit_code}\n")
                f.write(f"Started: {job.started_at}\n")
                f.write(f"Completed: {job.completed_at}\n")
                f.write(f"Duration: {job.duration_seconds:.2f}s\n" if job.duration_seconds else "Duration: N/A\n")
                f.write(f"Verification Passed: {job.verification_passed}\n")
                f.write(f"Simulation Mode: {job.is_dry_run}\n")
                f.write(f"====================================================\n\n")
                f.write("\n".join(job.logs))
        except Exception as e:
            print(f"[ERROR] Failed to write audit log to disk: {e}")

        # Record to history index
        record = AuditLogRecord(
            job_id=job.job_id,
            host_id=job.host.id,
            host_name=job.host.name,
            service_id=job.service.id,
            service_name=job.service.name,
            target_profile=job.target_profile,
            previous_profile=job.previous_profile,
            status=job.status,
            exit_code=job.exit_code,
            started_at=job.started_at,
            completed_at=job.completed_at,
            duration_seconds=job.duration_seconds,
            is_simulation=job.is_dry_run,
            verification_passed=job.verification_passed,
            error_summary=job.error_summary,
            log_file_path=log_filename,
        )
        self._audit_records.insert(0, record)

        # Persist audit_history.json
        audit_file = os.path.join(self.log_dir, "audit_history.json")
        try:
            with open(audit_file, "w", encoding="utf-8") as f:
                json.dump([r.model_dump() for r in self._audit_records[:200]], f, indent=2)
        except Exception as e:
            print(f"[ERROR] Failed to persist audit index: {e}")

    def is_service_locked(self, host_id: str, service_id: str) -> Tuple[bool, Optional[str]]:
        """Returns (is_locked, active_job_id)"""
        with self._lock_mutex:
            key = (host_id, service_id)
            if key in self._active_locks:
                return (True, self._active_locks[key])
            return (False, None)

    def get_active_locks(self) -> Dict[Tuple[str, str], str]:
        with self._lock_mutex:
            return dict(self._active_locks)

    def get_job(self, job_id: str) -> Optional[ActiveJob]:
        return self._jobs.get(job_id)

    def get_audit_history(self) -> List[AuditLogRecord]:
        return self._audit_records

    def acquire_lock(self, host_id: str, service_id: str, job_id: str) -> None:
        with self._lock_mutex:
            key = (host_id, service_id)
            if key in self._active_locks:
                existing_job = self._active_locks[key]
                raise ConcurrencyLockError(
                    f"Service '{service_id}' on host '{host_id}' is already locked by active job '{existing_job}'"
                )
            self._active_locks[key] = job_id

    def release_lock(self, host_id: str, service_id: str, job_id: str) -> None:
        with self._lock_mutex:
            key = (host_id, service_id)
            if self._active_locks.get(key) == job_id:
                del self._active_locks[key]

    async def start_switch_job(
        self,
        host_id: str,
        service_id: str,
        profile_name: str,
        dry_run_override: Optional[bool] = None,
    ) -> ActiveJob:
        # Validate host and service exist
        host = next((h for h in self.config.hosts if h.id == host_id), None)
        if not host:
            raise ValueError(f"Host '{host_id}' not found in configuration")

        service = next((s for s in self.config.services if s.id == service_id and s.host_id == host_id), None)
        if not service:
            raise ValueError(f"Service '{service_id}' not found on host '{host_id}'")

        profile = next((p for p in service.profiles if p.name == profile_name), None)
        if not profile:
            raise ValueError(f"Profile '{profile_name}' is not configured for service '{service_id}'")

        job_id = f"job-{uuid.uuid4().hex[:10]}"
        is_dry_run = self.config.app.dry_run if dry_run_override is None else dry_run_override

        # Acquire lock (raises ConcurrencyLockError if already running)
        self.acquire_lock(host_id, service_id, job_id)

        job = ActiveJob(
            job_id=job_id,
            host=host,
            service=service,
            target_profile=profile_name,
            is_dry_run=is_dry_run,
        )
        self._jobs[job_id] = job

        # Dispatch execution in background thread
        threading.Thread(
            target=self._run_job_worker,
            args=(job, profile),
            daemon=True,
            name=f"worker-{job_id}",
        ).start()

        return job

    def abort_job(self, job_id: str) -> ActiveJob:
        job = self.get_job(job_id)
        if not job:
            raise ValueError(f"Job '{job_id}' not found")

        if job.is_finished:
            return job

        job.status = JobStatus.ABORTED
        job.emit_log("[!] Operator initiated ABORT request.")
        if job.executor:
            job.executor.abort()

        return job

    def _run_job_worker(self, job: ActiveJob, profile) -> None:
        start_mono = time.monotonic()
        executor = get_executor(job.host, force_dry_run=job.is_dry_run)
        job.executor = executor
        job.status = JobStatus.RUNNING

        job.emit_log(f"============================================================")
        job.emit_log(f"SWITCHR ORCHESTRATOR - PROFILE TRANSITION INITIATED")
        job.emit_log(f"Job ID: {job.job_id}")
        job.emit_log(f"Host: {job.host.name} [{job.host.os_type.value.upper()}] ({job.host.hostname}:{job.host.port})")
        job.emit_log(f"Service: {job.service.name} (id: {job.service.id})")
        job.emit_log(f"Active Profile: {job.previous_profile} -> Target: {job.target_profile}")
        job.emit_log(f"Dry-Run Mode: {'ENABLED (Simulated Execution)' if job.is_dry_run else 'DISABLED (Live Host)'}")
        job.emit_log(f"Script Path: {profile.script_path}")
        job.emit_log(f"============================================================")

        # Assemble full command string
        params_str = " ".join([f'"{p}"' if " " in p else p for p in profile.parameters])
        if job.host.os_type.value == "windows":
            command = f'"{profile.script_path}" {params_str}'.strip()
        else:
            command = f"{profile.script_path} {params_str}".strip()

        try:
            # Stream command execution line-by-line
            gen = executor.execute(command, timeout=profile.timeout_seconds)
            exit_code = 0
            while True:
                try:
                    line = next(gen)
                    job.emit_log(line)
                except StopIteration as stop:
                    exit_code = stop.value if stop.value is not None else 0
                    break

            job.exit_code = exit_code

            # Fail-fast check on script exit code
            if exit_code != 0:
                job.status = JobStatus.FAILED
                job.error_summary = f"Script exited with non-zero exit code {exit_code}"
                job.emit_log(f"[FATAL] Profile transition script exited with code {exit_code}.")
                job.emit_log("[!] Fail-Fast invariant triggered: halting execution. No blind rollback attempted.")
                return

            # Post-Execution Verification Probe
            job.emit_log("============================================================")
            job.emit_log("[*] Phase 2: Running automated post-transition verification probe...")
            v_name = job.service.verification_service_name
            probe_ok, probe_summary = executor.probe_service_status(v_name)
            job.verification_passed = probe_ok
            job.emit_log(f"[*] Probe Target: '{v_name}'")
            job.emit_log(f"[*] Probe Output: {probe_summary}")

            if probe_ok:
                job.status = JobStatus.SUCCESS
                job.service.current_profile = job.target_profile
                job.emit_log(f"[✓] VERIFICATION SUCCESS: Service '{v_name}' is confirmed RUNNING.")
                job.emit_log(f"[✓] Configuration profile switched to '{job.target_profile}' successfully.")
            else:
                job.status = JobStatus.FAILED
                job.error_summary = f"Service probe failed: {probe_summary}"
                job.emit_log(f"[FATAL] VERIFICATION FAILED: Service did not report healthy state.")

        except ExecutionAbortedError:
            job.status = JobStatus.ABORTED
            job.error_summary = "Job aborted by operator"
            job.emit_log("[!] Job was successfully cancelled.")
        except ExecutionTimeoutError as exc:
            job.status = JobStatus.TIMED_OUT
            job.error_summary = str(exc)
            job.emit_log(f"[FATAL] {str(exc)}")
        except Exception as exc:
            job.status = JobStatus.FAILED
            job.error_summary = str(exc)
            job.emit_log(f"[ERROR] Unhandled execution exception: {str(exc)}")

        finally:
            job.completed_at = datetime.now(timezone.utc).isoformat()
            job.duration_seconds = time.monotonic() - start_mono
            job.is_finished = True
            job.emit_log(f"[*] Execution finished at {job.completed_at} (Duration: {job.duration_seconds:.2f}s)")
            job.emit_log(f"[*] Releasing lock for ({job.host.id}, {job.service.id})...")

            # Release lock
            self.release_lock(job.host.id, job.service.id, job.job_id)

            # Persist audit record
            self._save_audit_record(job)

            # Send terminal EOF event to SSE queues
            for q in list(job.subscribers):
                try:
                    q.put_nowait(f"__SWITCHR_JOB_DONE__:{job.status.value}")
                except Exception:
                    pass

    async def subscribe_sse_stream(self, job_id: str) -> AsyncGenerator[str, None]:
        job = self.get_job(job_id)
        if not job:
            yield f"data: [error] Job {job_id} not found\n\n"
            return

        queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        job.subscribers.add(queue)

        try:
            # Yield all historical lines buffered so far
            for line in job.logs:
                yield f"data: {line}\n\n"

            if job.is_finished:
                yield f"event: done\ndata: {job.status.value}\n\n"
                return

            # Stream live updates
            while True:
                try:
                    line = await asyncio.wait_for(queue.get(), timeout=20.0)
                    if line.startswith("__SWITCHR_JOB_DONE__:"):
                        final_status = line.split(":", 1)[1]
                        yield f"event: done\ndata: {final_status}\n\n"
                        break
                    yield f"data: {line}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat comment to keep HTTP connection alive through proxy
                    yield f": heartbeat\n\n"
                    if job.is_finished:
                        yield f"event: done\ndata: {job.status.value}\n\n"
                        break
        finally:
            job.subscribers.discard(queue)
