export type OSType = 'windows' | 'unix';

export type ServiceStatus = 'RUNNING' | 'STOPPED' | 'TRANSITIONING' | 'ERROR';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED' | 'TIMED_OUT';

export interface HostAuth {
  type: 'password' | 'key';
  username: string;
  password_env?: string;
  key_path?: string;
}

export interface TargetHost {
  id: string;
  name: string;
  os_type: OSType;
  hostname: string;
  port: number;
  use_ssl?: boolean;
  auth: HostAuth;
  description: string;
}

export interface ConfigProfile {
  name: string;
  description: string;
  script_path: string;
  parameters: string[];
  timeout_seconds: number;
}

export interface ManagedService {
  id: string;
  host_id: string;
  name: string;
  service_type: 'windows_service' | 'systemd' | 'generic_process';
  verification_service_name: string;
  current_profile: string;
  description: string;
  status: ServiceStatus;
  is_locked: boolean;
  active_job_id?: string;
  profiles: ConfigProfile[];
}

export interface LogLine {
  id: string;
  timestamp: string;
  text: string;
  type: 'stdout' | 'stderr' | 'info' | 'success' | 'warn' | 'error';
}

export interface JobRecord {
  job_id: string;
  host_id: string;
  host_name: string;
  os_type: OSType;
  service_id: string;
  service_name: string;
  target_profile: string;
  previous_profile: string;
  status: JobStatus;
  exit_code?: number;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  verification_passed: boolean;
  is_simulation: boolean;
  error_summary?: string;
  logs: LogLine[];
}

export interface SwitchRequestPayload {
  host_id: string;
  service_id: string;
  profile_name: string;
  simulate_failure?: boolean;
}
