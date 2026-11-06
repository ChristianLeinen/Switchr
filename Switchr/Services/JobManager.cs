using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using Switchr.Models;
using Switchr.Services.Executors;

namespace Switchr.Services;

public record SwitchJobContext(
    string JobId,
    string HostId,
    string HostName,
    string OsType,
    string ServiceId,
    string ServiceName,
    string TargetProfile,
    string? PreviousProfile,
    DateTime StartTime,
    CancellationTokenSource Cts,
    Channel<string> StreamChannel
)
{
    public DateTime? EndTime { get; set; }
    public string Status { get; set; } = "RUNNING"; // "QUEUED", "RUNNING", "SUCCESS", "FAILED", "ABORTED", "TIMED_OUT"
    public int? ExitCode { get; set; }
    public string? ErrorMessage { get; set; }
    public bool VerificationPassed { get; set; }
    public bool IsSimulation { get; set; } = true;
    public List<LogLineDto> CapturedLogs { get; } = new();
}

public class JobManager
{
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _serviceLocks = new();
    private readonly ConcurrentDictionary<string, SwitchJobContext> _activeJobs = new();
    private readonly IServiceProvider _serviceProvider;
    private readonly SwitchrConfig _config;
    private readonly ILogger<JobManager> _logger;

    public JobManager(
        IServiceProvider serviceProvider,
        SwitchrConfig config,
        ILogger<JobManager> logger
    )
    {
        _serviceProvider = serviceProvider;
        _config = config;
        _logger = logger;

        if (!Directory.Exists(_config.App.LogDir))
        {
            Directory.CreateDirectory(_config.App.LogDir);
        }
    }

    public async Task InitializeActiveProfilesAsync(CancellationToken cancellationToken = default)
    {
        using var scope = _serviceProvider.CreateScope();

        foreach (var svc in _config.Services)
        {
            if (string.IsNullOrWhiteSpace(svc.ActiveProfilePath))
            {
                svc.CurrentProfile = null;
                continue;
            }

            var host = _config.GetHost(svc.HostId);
            if (host == null)
            {
                _logger.LogWarning("Host '{HostId}' not found for service '{ServiceId}'.", svc.HostId, svc.Id);
                svc.CurrentProfile = null;
                continue;
            }

            try
            {
                ICommandExecutor executor = _config.App.DryRun
                    ? scope.ServiceProvider.GetRequiredService<MockExecutor>()
                    : host.OsType.Equals("windows", StringComparison.OrdinalIgnoreCase)
                        ? scope.ServiceProvider.GetRequiredService<WinRmExecutor>()
                        : scope.ServiceProvider.GetRequiredService<SshExecutor>();

                var profileText = await executor.ReadRemoteTextFileAsync(host, svc.ActiveProfilePath, cancellationToken);
                if (!string.IsNullOrWhiteSpace(profileText))
                {
                    svc.CurrentProfile = profileText.Trim();
                    _logger.LogInformation("Initialized active profile for service '{ServiceId}' to '{Profile}'.", svc.Id, svc.CurrentProfile);
                }
                else
                {
                    svc.CurrentProfile = null;
                    _logger.LogInformation("Active profile file '{Path}' for service '{ServiceId}' returned empty or was not found.", svc.ActiveProfilePath, svc.Id);
                }
            }
            catch (Exception ex)
            {
                svc.CurrentProfile = null;
                _logger.LogWarning(ex, "Failed to read active profile file for service '{ServiceId}' at '{Path}'.", svc.Id, svc.ActiveProfilePath);
            }
        }
    }

    public bool IsServiceLocked(string hostId, string serviceId)
    {
        var key = $"{hostId}:{serviceId}";
        return _serviceLocks.TryGetValue(key, out var sem) && sem.CurrentCount == 0;
    }

    public int GetActiveLocksCount()
    {
        return _serviceLocks.Values.Count(sem => sem.CurrentCount == 0);
    }

    public string? GetActiveJobId(string hostId, string serviceId)
    {
        return _activeJobs.Values
            .FirstOrDefault(j => string.Equals(j.HostId, hostId, StringComparison.OrdinalIgnoreCase) &&
                                 string.Equals(j.ServiceId, serviceId, StringComparison.OrdinalIgnoreCase) &&
                                 j.Status == "RUNNING")?.JobId;
    }

    public async Task<string> StartSwitchJobAsync(SwitchJobRequest request)
    {
        var hostConfig = _config.GetHost(request.HostId);
        if (hostConfig == null)
        {
            throw new KeyNotFoundException($"Target Host '{request.HostId}' not found in configuration.");
        }

        var serviceConfig = _config.GetService(request.ServiceId);
        if (serviceConfig == null || !string.Equals(serviceConfig.HostId, request.HostId, StringComparison.OrdinalIgnoreCase))
        {
            throw new KeyNotFoundException($"Managed Service '{request.ServiceId}' not found on host '{request.HostId}'.");
        }

        var profileConfig = serviceConfig.Profiles.FirstOrDefault(p =>
            string.Equals(p.Name, request.ProfileName, StringComparison.OrdinalIgnoreCase));
        if (profileConfig == null)
        {
            throw new KeyNotFoundException($"Configuration Profile '{request.ProfileName}' not found for service '{request.ServiceId}'.");
        }

        var lockKey = $"{request.HostId}:{request.ServiceId}";
        var sem = _serviceLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        // Attempt non-blocking lock acquisition
        if (!await sem.WaitAsync(0))
        {
            var existingJobId = GetActiveJobId(request.HostId, request.ServiceId);
            throw new InvalidOperationException($"Service '{request.ServiceId}' on host '{request.HostId}' is already locked by active job '{existingJobId}'");
        }

        var jobId = $"job-{Guid.NewGuid().ToString("N")[..8]}";
        var effectiveScripts = profileConfig.GetEffectiveScripts();
        var totalTimeoutSec = effectiveScripts.Count > 0
            ? effectiveScripts.Sum(s => s.TimeoutSeconds > 0 ? s.TimeoutSeconds : _config.App.DefaultJobTimeout)
            : (profileConfig.TimeoutSeconds > 0 ? profileConfig.TimeoutSeconds : _config.App.DefaultJobTimeout);

        var cts = new CancellationTokenSource(TimeSpan.FromSeconds(totalTimeoutSec));
        var channel = Channel.CreateUnbounded<string>();
        var isDryRun = request.DryRun ?? _config.App.DryRun;

        var context = new SwitchJobContext(
            jobId,
            request.HostId,
            hostConfig.Name,
            hostConfig.OsType,
            request.ServiceId,
            serviceConfig.Name,
            request.ProfileName,
            serviceConfig.CurrentProfile,
            DateTime.UtcNow,
            cts,
            channel
        )
        {
            IsSimulation = isDryRun
        };

        _activeJobs[jobId] = context;

        // Run background task
        _ = Task.Run(async () =>
        {
            try
            {
                await ExecuteJobAsync(context, hostConfig, serviceConfig, profileConfig, request);
            }
            finally
            {
                sem.Release();
                await PersistAuditLogAsync(context);
            }
        });

        return jobId;
    }

    private async Task ExecuteJobAsync(
        SwitchJobContext context,
        HostConfig hostConfig,
        ServiceConfig serviceConfig,
        ProfileConfig profileConfig,
        SwitchJobRequest request
    )
    {
        await EmitLogAsync(context, $"[SWITCHR] Starting Switch Job {context.JobId} for {context.HostId}/{context.ServiceId} -> '{context.TargetProfile}'", "info");

        using var scope = _serviceProvider.CreateScope();
        var isDryRun = request.DryRun ?? _config.App.DryRun;
        ICommandExecutor executor = isDryRun
            ? scope.ServiceProvider.GetRequiredService<MockExecutor>()
            : hostConfig.OsType.Equals("windows", StringComparison.OrdinalIgnoreCase)
                ? scope.ServiceProvider.GetRequiredService<WinRmExecutor>()
                : scope.ServiceProvider.GetRequiredService<SshExecutor>();

        try
        {
            if (request.SimulateFailure == true)
            {
                await EmitLogAsync(context, "[INFO] Simulated failure mode requested.", "info");
                await Task.Delay(500, context.Cts.Token);
                await EmitLogAsync(context, "[ERROR] Simulated execution failure encountered during configuration application.", "error");
                throw new InvalidOperationException("Simulated script execution failure.");
            }

            var scripts = profileConfig.GetEffectiveScripts();
            if (scripts.Count == 0)
            {
                throw new InvalidOperationException($"No scripts configured for profile '{profileConfig.Name}'.");
            }

            for (int i = 0; i < scripts.Count; i++)
            {
                var step = scripts[i];
                var stepNumber = i + 1;
                var totalSteps = scripts.Count;
                var stepName = string.IsNullOrWhiteSpace(step.Name) ? $"Script #{stepNumber}" : step.Name;

                await EmitLogAsync(context, $"[STEP {stepNumber}/{totalSteps}] Starting: {stepName} ({step.ScriptPath})", "info");

                await foreach (var line in executor.ExecuteCommandStreamAsync(
                    hostConfig,
                    step.ScriptPath,
                    step.ArgumentsString,
                    context.Cts.Token
                ))
                {
                    var logType = line.Contains("[stderr]", StringComparison.OrdinalIgnoreCase) ? "stderr" : "stdout";
                    await EmitLogAsync(context, line, logType);
                }

                await EmitLogAsync(context, $"[STEP {stepNumber}/{totalSteps}] Finished successfully: {stepName}", "info");
            }

            // Post-execution verification probe
            await EmitLogAsync(context, $"[PROBE] Verifying managed service status for '{serviceConfig.VerificationServiceName}'...", "info");
            var isRunning = await executor.VerifyServiceRunningAsync(
                hostConfig,
                serviceConfig.VerificationServiceName,
                context.Cts.Token
            );

            if (isRunning)
            {
                context.Status = "SUCCESS";
                context.ExitCode = 0;
                context.VerificationPassed = true;

                // Refresh active profile from active_profile_path if configured, otherwise fallback to switched profile
                if (!string.IsNullOrWhiteSpace(serviceConfig.ActiveProfilePath))
                {
                    try
                    {
                        var readProfile = await executor.ReadRemoteTextFileAsync(
                            hostConfig,
                            serviceConfig.ActiveProfilePath,
                            context.Cts.Token
                        );

                        if (!string.IsNullOrWhiteSpace(readProfile))
                        {
                            serviceConfig.CurrentProfile = readProfile.Trim();
                            await EmitLogAsync(context, $"[PROBE] Confirmed active profile '{serviceConfig.CurrentProfile}' from remote file '{serviceConfig.ActiveProfilePath}'.", "success");
                        }
                        else
                        {
                            serviceConfig.CurrentProfile = null;
                            await EmitLogAsync(context, $"[WARN] Remote active profile file '{serviceConfig.ActiveProfilePath}' was empty or not found.", "warn");
                        }
                    }
                    catch (Exception ex)
                    {
                        serviceConfig.CurrentProfile = null;
                        await EmitLogAsync(context, $"[WARN] Failed to read remote active profile file: {ex.Message}", "warn");
                    }
                }
                else
                {
                    serviceConfig.CurrentProfile = profileConfig.Name;
                }

                await EmitLogAsync(context, $"[SUCCESS] Service is confirmed RUNNING. Configuration switch to '{context.TargetProfile}' complete.", "success");
            }
            else
            {
                context.Status = "FAILED";
                context.ExitCode = 1;
                context.VerificationPassed = false;
                context.ErrorMessage = "Post-transition verification probe reported service NOT running.";
                await EmitLogAsync(context, $"[ERROR] Post-execution probe failed: Service is not running.", "error");
            }
        }
        catch (OperationCanceledException)
        {
            context.Status = "ABORTED";
            context.ExitCode = -1;
            context.VerificationPassed = false;
            context.ErrorMessage = "Job was aborted by operator or timed out.";
            await EmitLogAsync(context, "[ABORT] Switch job was terminated.", "warn");
        }
        catch (Exception ex)
        {
            context.Status = "FAILED";
            context.ExitCode = 1;
            context.VerificationPassed = false;
            context.ErrorMessage = ex.Message;
            await EmitLogAsync(context, $"[ERROR] Fatal execution error: {ex.Message}", "error");
        }
        finally
        {
            context.EndTime = DateTime.UtcNow;
            context.StreamChannel.Writer.TryComplete();
        }
    }

    public bool AbortJob(string jobId)
    {
        if (_activeJobs.TryGetValue(jobId, out var context) && context.Status == "RUNNING")
        {
            context.Cts.Cancel();
            return true;
        }
        return false;
    }

    public SwitchJobContext? GetJob(string jobId)
    {
        _activeJobs.TryGetValue(jobId, out var context);
        return context;
    }

    public async Task<List<JobRecordDto>> GetHistoryAsync()
    {
        var list = new List<JobRecordDto>();
        var logDir = _config.App.LogDir;
        if (!Directory.Exists(logDir)) return list;

        foreach (var file in Directory.GetFiles(logDir, "job-*.json").OrderByDescending(f => f))
        {
            try
            {
                var json = await File.ReadAllTextAsync(file);
                var dto = JsonSerializer.Deserialize<JobRecordDto>(json);
                if (dto != null) list.Add(dto);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read audit log {File}", file);
            }
        }

        return list;
    }

    public void ClearAuditHistory()
    {
        var logDir = _config.App.LogDir;
        if (Directory.Exists(logDir))
        {
            foreach (var file in Directory.GetFiles(logDir, "job-*.*"))
            {
                try
                {
                    File.Delete(file);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete log file {File}", file);
                }
            }
        }
    }

    private async Task EmitLogAsync(SwitchJobContext context, string line, string type = "stdout")
    {
        var now = DateTime.UtcNow;
        var timeStr = $"{now:HH:mm:ss}.{now.Millisecond:D3}";
        var logLine = new LogLineDto(
            Guid.NewGuid().ToString("N")[..8],
            timeStr,
            line,
            type
        );
        context.CapturedLogs.Add(logLine);
        await context.StreamChannel.Writer.WriteAsync(line);
    }

    private async Task PersistAuditLogAsync(SwitchJobContext context)
    {
        try
        {
            var logDir = _config.App.LogDir;
            var jsonPath = Path.Combine(logDir, $"job-{context.StartTime:yyyyMMdd_HHmmss}_{context.JobId}.json");
            var txtPath = Path.Combine(logDir, $"job-{context.StartTime:yyyyMMdd_HHmmss}_{context.JobId}.log");

            var durationSeconds = context.EndTime.HasValue
                ? Math.Round((context.EndTime.Value - context.StartTime).TotalSeconds, 2)
                : (double?)null;

            var dto = new JobRecordDto(
                context.JobId,
                context.HostId,
                context.HostName,
                context.OsType,
                context.ServiceId,
                context.ServiceName,
                context.TargetProfile,
                context.PreviousProfile,
                context.Status,
                context.ExitCode,
                context.StartTime,
                context.EndTime,
                durationSeconds,
                context.VerificationPassed,
                context.IsSimulation,
                context.ErrorMessage,
                context.CapturedLogs
            );

            await File.WriteAllTextAsync(jsonPath, JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true }));
            await File.WriteAllLinesAsync(txtPath, context.CapturedLogs.Select(l => $"[{l.Timestamp}] {l.Text}"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist audit log for job {JobId}", context.JobId);
        }
    }
}
