using System.Collections.Concurrent;
using System.Text.Json;
using System.Threading.Channels;
using Switchr.Models;
using Switchr.Services.Executors;

namespace Switchr.Services;

public record SwitchJobContext(
    string JobId,
    string HostId,
    string ServiceId,
    string ProfileName,
    DateTime StartTime,
    CancellationTokenSource Cts,
    Channel<string> StreamChannel
)
{
    public DateTime? EndTime { get; set; }
    public string Status { get; set; } = "Running";
    public int? ExitCode { get; set; }
    public string? ErrorMessage { get; set; }
    public List<string> CapturedLogs { get; } = new();
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
                                 j.Status == "Running")?.JobId;
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
            throw new InvalidOperationException($"Managed Service '{request.ServiceId}' on '{request.HostId}' is currently locked by another active switch job.");
        }

        var jobId = Guid.NewGuid().ToString("N")[..8];
        var timeoutSec = profileConfig.TimeoutSeconds > 0 ? profileConfig.TimeoutSeconds : _config.App.DefaultJobTimeout;
        var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
        var channel = Channel.CreateUnbounded<string>();

        var context = new SwitchJobContext(
            jobId,
            request.HostId,
            request.ServiceId,
            request.ProfileName,
            DateTime.UtcNow,
            cts,
            channel
        );

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
        await EmitLogAsync(context, $"[SWITCHR] Starting Switch Job {context.JobId} for {context.HostId}/{context.ServiceId} -> '{context.ProfileName}'");

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
                await EmitLogAsync(context, "[INFO] Simulated failure mode requested.");
                await Task.Delay(500, context.Cts.Token);
                await EmitLogAsync(context, "[ERROR] Simulated execution failure encountered during configuration application.");
                throw new InvalidOperationException("Simulated script execution failure.");
            }

            await foreach (var line in executor.ExecuteCommandStreamAsync(
                hostConfig,
                profileConfig.ScriptPath,
                profileConfig.ArgumentsString,
                context.Cts.Token
            ))
            {
                await EmitLogAsync(context, line);
            }

            // Post-execution verification probe
            await EmitLogAsync(context, $"[PROBE] Verifying managed service status for '{serviceConfig.VerificationServiceName}'...");
            var isRunning = await executor.VerifyServiceRunningAsync(
                hostConfig,
                serviceConfig.VerificationServiceName,
                context.Cts.Token
            );

            if (isRunning)
            {
                context.Status = "Succeeded";
                context.ExitCode = 0;
                serviceConfig.CurrentProfile = profileConfig.Name;
                await EmitLogAsync(context, $"[SUCCESS] Service is confirmed RUNNING. Configuration switch to '{context.ProfileName}' complete.");
            }
            else
            {
                context.Status = "Failed";
                context.ExitCode = 1;
                context.ErrorMessage = "Post-transition verification probe reported service NOT running.";
                await EmitLogAsync(context, $"[ERROR] Post-execution probe failed: Service is not running.");
            }
        }
        catch (OperationCanceledException)
        {
            context.Status = "Aborted";
            context.ErrorMessage = "Job was aborted by operator or timed out.";
            await EmitLogAsync(context, "[ABORT] Switch job was terminated.");
        }
        catch (Exception ex)
        {
            context.Status = "Failed";
            context.ErrorMessage = ex.Message;
            await EmitLogAsync(context, $"[ERROR] Fatal execution error: {ex.Message}");
        }
        finally
        {
            context.EndTime = DateTime.UtcNow;
            context.StreamChannel.Writer.TryComplete();
        }
    }

    public bool AbortJob(string jobId)
    {
        if (_activeJobs.TryGetValue(jobId, out var context) && context.Status == "Running")
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

    public async Task<List<SwitchJobStatusResponse>> GetHistoryAsync()
    {
        var list = new List<SwitchJobStatusResponse>();
        var logDir = _config.App.LogDir;
        if (!Directory.Exists(logDir)) return list;

        foreach (var file in Directory.GetFiles(logDir, "job-*.json").OrderByDescending(f => f))
        {
            try
            {
                var json = await File.ReadAllTextAsync(file);
                var dto = JsonSerializer.Deserialize<SwitchJobStatusResponse>(json);
                if (dto != null) list.Add(dto);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read audit log {File}", file);
            }
        }

        return list;
    }

    private async Task EmitLogAsync(SwitchJobContext context, string line)
    {
        var timestamped = $"[{DateTime.UtcNow:HH:mm:ss}] {line}";
        context.CapturedLogs.Add(timestamped);
        await context.StreamChannel.Writer.WriteAsync(timestamped);
    }

    private async Task PersistAuditLogAsync(SwitchJobContext context)
    {
        try
        {
            var logDir = _config.App.LogDir;
            var jsonPath = Path.Combine(logDir, $"job-{context.StartTime:yyyyMMdd_HHmmss}_{context.JobId}.json");
            var txtPath = Path.Combine(logDir, $"job-{context.StartTime:yyyyMMdd_HHmmss}_{context.JobId}.log");

            var dto = new SwitchJobStatusResponse(
                context.JobId,
                context.HostId,
                context.ServiceId,
                context.ProfileName,
                context.Status,
                context.StartTime,
                context.EndTime,
                context.ExitCode,
                context.ErrorMessage
            );

            await File.WriteAllTextAsync(jsonPath, JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true }));
            await File.WriteAllLinesAsync(txtPath, context.CapturedLogs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist audit log for job {JobId}", context.JobId);
        }
    }
}
