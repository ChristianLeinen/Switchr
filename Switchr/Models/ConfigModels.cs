using System.Text.Json.Serialization;
using YamlDotNet.Serialization;

namespace Switchr.Models;

public record AppSettings
{
    [YamlMember(Alias = "name")]
    [JsonPropertyName("name")]
    public string Name { get; init; } = "Switchr";

    [YamlMember(Alias = "version")]
    [JsonPropertyName("version")]
    public string Version { get; init; } = "1.0.0";

    [YamlMember(Alias = "dry_run")]
    [JsonPropertyName("dry_run")]
    public bool DryRun { get; init; } = true;

    [YamlMember(Alias = "default_job_timeout")]
    [JsonPropertyName("default_job_timeout")]
    public int DefaultJobTimeout { get; init; } = 300;

    [YamlMember(Alias = "log_dir")]
    [JsonPropertyName("log_dir")]
    public string LogDir { get; init; } = "./logs";
}

public record AuthConfig
{
    [YamlMember(Alias = "type")]
    [JsonPropertyName("type")]
    public string Type { get; init; } = "password"; // "password" or "key"

    [YamlMember(Alias = "username")]
    [JsonPropertyName("username")]
    public string Username { get; init; } = string.Empty;

    [YamlMember(Alias = "password")]
    [JsonPropertyName("password")]
    public string? Password { get; init; }

    [YamlMember(Alias = "password_env")]
    [JsonPropertyName("password_env")]
    public string? PasswordEnv { get; init; }

    [YamlMember(Alias = "key_path")]
    [JsonPropertyName("key_path")]
    public string? KeyPath { get; init; }

    [YamlMember(Alias = "passphrase_env")]
    [JsonPropertyName("passphrase_env")]
    public string? PassphraseEnv { get; init; }
}

public record ScriptStepConfig
{
    [YamlMember(Alias = "name")]
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [YamlMember(Alias = "script_path")]
    [JsonPropertyName("script_path")]
    public string ScriptPath { get; init; } = string.Empty;

    [YamlMember(Alias = "parameters")]
    [JsonPropertyName("parameters")]
    public List<string> Parameters { get; init; } = new();

    [YamlMember(Alias = "timeout_seconds")]
    [JsonPropertyName("timeout_seconds")]
    public int TimeoutSeconds { get; init; } = 300;

    [JsonIgnore]
    public string ArgumentsString => Parameters is { Count: > 0 }
        ? string.Join(" ", Parameters.Select(p => p.Contains(' ') ? $"\"{p}\"" : p))
        : string.Empty;
}

public record ProfileConfig
{
    [YamlMember(Alias = "name")]
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [YamlMember(Alias = "description")]
    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    // Legacy single-script configuration fields
    [YamlMember(Alias = "script_path")]
    [JsonPropertyName("script_path")]
    public string ScriptPath { get; init; } = string.Empty;

    [YamlMember(Alias = "parameters")]
    [JsonPropertyName("parameters")]
    public List<string> Parameters { get; init; } = new();

    [YamlMember(Alias = "timeout_seconds")]
    [JsonPropertyName("timeout_seconds")]
    public int TimeoutSeconds { get; init; } = 300;

    // Multi-script sequential configuration
    [YamlMember(Alias = "scripts")]
    [JsonPropertyName("scripts")]
    public List<ScriptStepConfig> Scripts { get; init; } = new();

    [JsonIgnore]
    public string ArgumentsString => Parameters is { Count: > 0 }
        ? string.Join(" ", Parameters.Select(p => p.Contains(' ') ? $"\"{p}\"" : p))
        : string.Empty;

    public IReadOnlyList<ScriptStepConfig> GetEffectiveScripts()
    {
        if (Scripts != null && Scripts.Count > 0)
        {
            return Scripts;
        }

        if (!string.IsNullOrWhiteSpace(ScriptPath))
        {
            return new List<ScriptStepConfig>
            {
                new()
                {
                    Name = "Execute profile script",
                    ScriptPath = ScriptPath,
                    Parameters = Parameters ?? new List<string>(),
                    TimeoutSeconds = TimeoutSeconds > 0 ? TimeoutSeconds : 300
                }
            };
        }

        return Array.Empty<ScriptStepConfig>();
    }
}

public record ServiceConfig
{
    [YamlMember(Alias = "id")]
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [YamlMember(Alias = "host_id")]
    [JsonPropertyName("host_id")]
    public string HostId { get; init; } = string.Empty;

    [YamlMember(Alias = "name")]
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [YamlMember(Alias = "service_type")]
    [JsonPropertyName("service_type")]
    public string ServiceType { get; init; } = "windows_service";

    [YamlMember(Alias = "verification_service_name")]
    [JsonPropertyName("verification_service_name")]
    public string VerificationServiceName { get; init; } = string.Empty;

    [YamlMember(Alias = "current_profile")]
    [JsonPropertyName("current_profile")]
    public string CurrentProfile { get; set; } = string.Empty;

    [YamlMember(Alias = "description")]
    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [YamlMember(Alias = "profiles")]
    [JsonPropertyName("profiles")]
    public List<ProfileConfig> Profiles { get; init; } = new();
}

public record HostConfig
{
    [YamlMember(Alias = "id")]
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [YamlMember(Alias = "name")]
    [JsonPropertyName("name")]
    public string Name { get; init; } = string.Empty;

    [YamlMember(Alias = "os_type")]
    [JsonPropertyName("os_type")]
    public string OsType { get; init; } = "windows"; // "windows" or "unix"

    [YamlMember(Alias = "hostname")]
    [JsonPropertyName("hostname")]
    public string Hostname { get; init; } = string.Empty;

    [YamlMember(Alias = "port")]
    [JsonPropertyName("port")]
    public int Port { get; init; } = 5985;

    [YamlMember(Alias = "use_ssl")]
    [JsonPropertyName("use_ssl")]
    public bool UseSsl { get; init; } = false;

    [YamlMember(Alias = "auth")]
    [JsonPropertyName("auth")]
    public AuthConfig Auth { get; init; } = new();

    [YamlMember(Alias = "description")]
    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    // Helper properties for executors
    [JsonIgnore]
    public string EffectiveUsername => Auth?.Username ?? string.Empty;

    [JsonIgnore]
    public string? EffectivePassword
    {
        get
        {
            if (!string.IsNullOrEmpty(Auth?.PasswordEnv))
            {
                var envVal = Environment.GetEnvironmentVariable(Auth.PasswordEnv);
                if (!string.IsNullOrEmpty(envVal)) return envVal;
            }
            return Auth?.Password;
        }
    }

    [JsonIgnore]
    public string? EffectiveKeyPath
    {
        get
        {
            if (string.IsNullOrEmpty(Auth?.KeyPath)) return null;
            var path = Auth.KeyPath;
            if (path.StartsWith("~"))
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                path = Path.Combine(home, path.TrimStart('~', '/', '\\'));
            }
            return path;
        }
    }
}

public record SwitchrConfig
{
    [YamlMember(Alias = "app")]
    [JsonPropertyName("app")]
    public AppSettings App { get; init; } = new();

    [YamlMember(Alias = "hosts")]
    [JsonPropertyName("hosts")]
    public List<HostConfig> Hosts { get; init; } = new();

    [YamlMember(Alias = "services")]
    [JsonPropertyName("services")]
    public List<ServiceConfig> Services { get; init; } = new();

    public HostConfig? GetHost(string hostId) =>
        Hosts.FirstOrDefault(h => string.Equals(h.Id, hostId, StringComparison.OrdinalIgnoreCase));

    public ServiceConfig? GetService(string serviceId) =>
        Services.FirstOrDefault(s => string.Equals(s.Id, serviceId, StringComparison.OrdinalIgnoreCase));

    public IEnumerable<ServiceConfig> GetServicesForHost(string hostId) =>
        Services.Where(s => string.Equals(s.HostId, hostId, StringComparison.OrdinalIgnoreCase));
}

// ==============================================================================
// API Request & Response DTOs
// ==============================================================================

public record SwitchJobRequest
{
    public SwitchJobRequest() { }

    public SwitchJobRequest(string hostId, string serviceId, string profileName)
    {
        HostId = hostId;
        ServiceId = serviceId;
        ProfileName = profileName;
    }

    [JsonPropertyName("host_id")]
    public string? HostIdSnake { get; init; }

    [JsonPropertyName("hostId")]
    public string? HostIdCamel { get; init; }

    private string _hostId = string.Empty;
    [JsonIgnore]
    public string HostId
    {
        get => !string.IsNullOrEmpty(_hostId) ? _hostId : (HostIdSnake ?? HostIdCamel ?? string.Empty);
        init => _hostId = value;
    }

    [JsonPropertyName("service_id")]
    public string? ServiceIdSnake { get; init; }

    [JsonPropertyName("serviceId")]
    public string? ServiceIdCamel { get; init; }

    private string _serviceId = string.Empty;
    [JsonIgnore]
    public string ServiceId
    {
        get => !string.IsNullOrEmpty(_serviceId) ? _serviceId : (ServiceIdSnake ?? ServiceIdCamel ?? string.Empty);
        init => _serviceId = value;
    }

    [JsonPropertyName("profile_name")]
    public string? ProfileNameSnake { get; init; }

    [JsonPropertyName("profileName")]
    public string? ProfileNameCamel { get; init; }

    private string _profileName = string.Empty;
    [JsonIgnore]
    public string ProfileName
    {
        get => !string.IsNullOrEmpty(_profileName) ? _profileName : (ProfileNameSnake ?? ProfileNameCamel ?? string.Empty);
        init => _profileName = value;
    }

    [JsonPropertyName("simulate_failure")]
    public bool? SimulateFailure { get; init; }

    [JsonPropertyName("dry_run")]
    public bool? DryRun { get; init; }
}

public record ScriptStepDto(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("script_path")] string ScriptPath,
    [property: JsonPropertyName("parameters")] List<string> Parameters,
    [property: JsonPropertyName("timeout_seconds")] int TimeoutSeconds
);

public record ProfileDto(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("script_path")] string ScriptPath,
    [property: JsonPropertyName("parameters")] List<string> Parameters,
    [property: JsonPropertyName("timeout_seconds")] int TimeoutSeconds,
    [property: JsonPropertyName("scripts")] List<ScriptStepDto> Scripts
);

public record ServiceStateViewDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("host_id")] string HostId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("service_type")] string ServiceType,
    [property: JsonPropertyName("verification_service_name")] string VerificationServiceName,
    [property: JsonPropertyName("current_profile")] string CurrentProfile,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("status")] string Status, // "RUNNING" | "STOPPED" | "TRANSITIONING" | "ERROR"
    [property: JsonPropertyName("is_locked")] bool IsLocked,
    [property: JsonPropertyName("active_job_id")] string? ActiveJobId,
    [property: JsonPropertyName("profiles")] List<ProfileDto> Profiles
);

public record HostStateViewDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("os_type")] string OsType,
    [property: JsonPropertyName("hostname")] string Hostname,
    [property: JsonPropertyName("port")] int Port,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("services")] List<ServiceStateViewDto> Services
);

public record InventoryResponseDto(
    [property: JsonPropertyName("app_version")] string AppVersion,
    [property: JsonPropertyName("dry_run")] bool DryRun,
    [property: JsonPropertyName("hosts")] List<HostStateViewDto> Hosts,
    [property: JsonPropertyName("active_locks_count")] int ActiveLocksCount
);

public record SwitchJobStatusResponse(
    [property: JsonPropertyName("job_id")] string JobId,
    [property: JsonPropertyName("host_id")] string HostId,
    [property: JsonPropertyName("service_id")] string ServiceId,
    [property: JsonPropertyName("profile_name")] string ProfileName,
    [property: JsonPropertyName("status")] string Status, // "Running", "Succeeded", "Failed", "Aborted"
    [property: JsonPropertyName("start_time")] DateTime StartTime,
    [property: JsonPropertyName("end_time")] DateTime? EndTime,
    [property: JsonPropertyName("exit_code")] int? ExitCode,
    [property: JsonPropertyName("error_message")] string? ErrorMessage
);
