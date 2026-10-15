"""
switchr FastAPI Application
Provides REST and SSE endpoints for inventory status, configuration switching,
job aborting, audit logs, and static web dashboard hosting.
"""

from __future__ import annotations
import os
from contextlib import asynccontextmanager
from typing import Optional
import yaml
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from models import (
    AbortJobResponse,
    ConfigFile,
    HostStateView,
    InventoryResponse,
    JobStatus,
    ServiceStateView,
    ServiceStatus,
    SwitchJobRequest,
    SwitchJobResponse,
)
from job_manager import ConcurrencyLockError, JobManager

# Load declarative config.yaml
CONFIG_PATH = os.environ.get("SWITCHR_CONFIG", "config.yaml")

def load_config(path: str = CONFIG_PATH) -> ConfigFile:
    if not os.path.exists(path):
        raise FileNotFoundError(f"Configuration file not found at {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return ConfigFile(**data)

app_config = load_config()
job_manager = JobManager(app_config)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[*] switchr v{app_config.app.version} initialized.")
    print(f"[*] Dry-run mode: {app_config.app.dry_run}")
    print(f"[*] Target hosts: {len(app_config.hosts)} | Services: {len(app_config.services)}")
    yield
    print("[*] switchr shutdown complete.")

app = FastAPI(
    title="switchr Orchestrator",
    version=app_config.app.version,
    description="Remote Service Configuration Orchestrator for Windows and Unix hosts",
    lifespan=lifespan,
)

# Enable CORS for local development & Apache reverse proxying
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# API Endpoints
# ==============================================================================

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": app_config.app.name,
        "version": app_config.app.version,
        "dry_run": app_config.app.dry_run,
    }

@app.get("/api/inventory", response_model=InventoryResponse)
async def get_inventory():
    """Returns all target hosts, managed services, active profiles, and current lock states."""
    active_locks = job_manager.get_active_locks()
    host_views = []

    for host in app_config.hosts:
        services_for_host = [s for s in app_config.services if s.host_id == host.id]
        service_views = []

        for svc in services_for_host:
            is_locked, active_job_id = job_manager.is_service_locked(host.id, svc.id)
            current_status = ServiceStatus.TRANSITIONING if is_locked else ServiceStatus.RUNNING

            service_views.append(
                ServiceStateView(
                    id=svc.id,
                    host_id=svc.host_id,
                    name=svc.name,
                    service_type=svc.service_type,
                    verification_service_name=svc.verification_service_name,
                    current_profile=svc.current_profile,
                    description=svc.description or "",
                    status=current_status,
                    is_locked=is_locked,
                    active_job_id=active_job_id,
                    profiles=svc.profiles,
                )
            )

        host_views.append(
            HostStateView(
                id=host.id,
                name=host.name,
                os_type=host.os_type,
                hostname=host.hostname,
                port=host.port,
                description=host.description or "",
                services=service_views,
            )
        )

    return InventoryResponse(
        app_version=app_config.app.version,
        dry_run=app_config.app.dry_run,
        hosts=host_views,
        active_locks_count=len(active_locks),
    )

@app.post("/api/jobs/switch", response_model=SwitchJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def switch_profile(payload: SwitchJobRequest):
    """
    Enforces in-memory execution lock per (host_id, service_id).
    Returns HTTP 409 Conflict if service is already running a transition.
    Dispatches transition job in background and returns job_id.
    """
    try:
        job = await job_manager.start_switch_job(
            host_id=payload.host_id,
            service_id=payload.service_id,
            profile_name=payload.profile_name,
            dry_run_override=payload.dry_run,
        )
        return SwitchJobResponse(
            job_id=job.job_id,
            host_id=job.host.id,
            service_id=job.service.id,
            target_profile=job.target_profile,
            status=job.status,
            message="Profile switch job successfully queued and dispatched.",
        )
    except ConcurrencyLockError as cle:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(cle),
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

@app.post("/api/jobs/{job_id}/abort", response_model=AbortJobResponse)
async def abort_job(job_id: str):
    """Cancels an active execution job and terminates remote process/channel."""
    try:
        job = job_manager.abort_job(job_id)
        return AbortJobResponse(
            job_id=job.job_id,
            status=job.status,
            message=f"Job {job_id} abort signal sent.",
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )

@app.get("/api/jobs/{job_id}/stream")
async def stream_job_logs(job_id: str):
    """
    Server-Sent Events (SSE) endpoint streaming real-time line-by-line logs.
    Set up for unbuffered proxying through Apache mod_proxy_http.
    """
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return StreamingResponse(
        job_manager.subscribe_sse_stream(job_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", # Prevents buffering in Nginx/Apache
        },
    )

@app.get("/api/jobs/history")
async def get_history():
    """Returns past execution audit log summaries."""
    return {"history": job_manager.get_audit_history()}

@app.get("/api/config/raw")
async def get_raw_config():
    """Returns the current raw YAML configuration."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    return Response(content=content, media_type="text/yaml")


# Mount static files if static directory exists
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    async def serve_index():
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "switchr API ready. Static index.html not found."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
