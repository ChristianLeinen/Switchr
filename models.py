"""
switchr Data Models & Schemas
Pydantic v2 models for validating config.yaml and defining strict API schemas.
"""

from __future__ import annotations
from enum import Enum
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class OSType(str, Enum):
    WINDOWS = "windows"
    UNIX = "unix"


class ServiceStatus(str, Enum):
    RUNNING = "RUNNING"
    STOPPED = "STOPPED"
    TRANSITIONING = "TRANSITIONING"
    ERROR = "ERROR"
    UNKNOWN = "UNKNOWN"


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    ABORTED = "ABORTED"
    TIMED_OUT = "TIMED_OUT"


class AuthConfig(BaseModel):
    type: Literal["password", "key"]
    username: str
    password_env: Optional[str] = None
    key_path: Optional[str] = None
    passphrase_env: Optional[str] = None


class HostConfig(BaseModel):
    id: str = Field(..., description="Unique slug for target host")
    name: str
    os_type: OSType
    hostname: str
    port: int
    use_ssl: bool = False
    auth: AuthConfig
    description: Optional[str] = ""

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        if not (1 <= v <= 65535):
            raise ValueError("Port must be between 1 and 65535")
        return v


class ProfileConfig(BaseModel):
    name: str = Field(..., description="Profile identifier, e.g. production-high-throughput")
    description: Optional[str] = ""
    script_path: str = Field(..., description="Path to .bat or .sh script on target host")
    parameters: List[str] = Field(default_factory=list, description="CLI parameters passed to script")
    timeout_seconds: int = Field(default=300, ge=5, le=3600)


class ServiceConfig(BaseModel):
    id: str = Field(..., description="Unique slug for service")
    host_id: str = Field(..., description="Foreign key to TargetHost.id")
    name: str
    service_type: Literal["windows_service", "systemd", "generic_process"] = "windows_service"
    verification_service_name: str = Field(..., description="Name for sc query or systemctl is-active")
    current_profile: str
    description: Optional[str] = ""
    profiles: List[ProfileConfig] = Field(default_factory=list)

    @field_validator("profiles")
    @classmethod
    def validate_profiles_exist(cls, v: List[ProfileConfig]) -> List[ProfileConfig]:
        if not v:
            raise ValueError("Service must have at least one configuration profile defined")
        names = [p.name for p in v]
        if len(names) != len(set(names)):
            raise ValueError("Profile names within a service must be unique")
        return v


class AppSettings(BaseModel):
    name: str = "switchr"
    version: str = "1.0.0"
    dry_run: bool = True
    default_job_timeout: int = 300
    log_dir: str = "./logs"


class ConfigFile(BaseModel):
    app: AppSettings = Field(default_factory=AppSettings)
    hosts: List[HostConfig]
    services: List[ServiceConfig]


# ==============================================================================
# API Request & Response Schemas
# ==============================================================================

class SwitchJobRequest(BaseModel):
    host_id: str
    service_id: str
    profile_name: str
    dry_run: Optional[bool] = None # Allows per-job simulation override if permitted


class SwitchJobResponse(BaseModel):
    job_id: str
    host_id: str
    service_id: str
    target_profile: str
    status: JobStatus
    message: str


class AbortJobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str


class ServiceStateView(BaseModel):
    id: str
    host_id: str
    name: str
    service_type: str
    verification_service_name: str
    current_profile: str
    description: str
    status: ServiceStatus
    is_locked: bool
    active_job_id: Optional[str] = None
    profiles: List[ProfileConfig]


class HostStateView(BaseModel):
    id: str
    name: str
    os_type: OSType
    hostname: str
    port: int
    description: str
    services: List[ServiceStateView]


class InventoryResponse(BaseModel):
    app_version: str
    dry_run: bool
    hosts: List[HostStateView]
    active_locks_count: int


class AuditLogRecord(BaseModel):
    job_id: str
    host_id: str
    host_name: str
    service_id: str
    service_name: str
    target_profile: str
    previous_profile: Optional[str] = None
    status: JobStatus
    exit_code: Optional[int] = None
    started_at: str
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    is_simulation: bool = False
    verification_passed: bool = False
    error_summary: Optional[str] = None
    log_file_path: Optional[str] = None
