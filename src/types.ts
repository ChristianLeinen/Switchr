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

export interface ScriptStepConfig {
  name: string;
  script_path: string;
  parameters: string[];
  timeout_seconds: number;
}

export interface ConfigProfile {
  name: string;
  description: string;
  // Legacy single-script fields
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
  current_profile: string | null; // Null if file not found, empty, or uninitialized
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
  previous_profile: string | null;
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

/**
 * Helper returning the list of executable script steps for a profile,
 * supporting both multi-script `scripts: [...]` and legacy single-script fallback.
 */
export function getEffectiveScripts(profile: ConfigProfile): ScriptStepConfig[] {
  if (profile.scripts && profile.scripts.length > 0) {
    return profile.scripts;
  }
  if (profile.script_path) {
    return [
      {
        name: 'Execute profile script',
        script_path: profile.script_path,
        parameters: profile.parameters || [],
        timeout_seconds: profile.timeout_seconds || 300,
      },
    ];
  }
  return [];
}
