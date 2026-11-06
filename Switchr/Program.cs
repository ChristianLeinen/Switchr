using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using Switchr.Models;
using Switchr.Services;
using Switchr.Services.Executors;

var builder = WebApplication.CreateBuilder(args);

// Enable running as a Windows Service when configured
builder.Host.UseWindowsService();

// Load config.yaml
var configPath = Path.Combine(AppContext.BaseDirectory, "config.yaml");
if (!File.Exists(configPath))
{
    // Fallback to local directory
    configPath = "config.yaml";
}

if (!File.Exists(configPath))
{
    throw new FileNotFoundException($"Cannot locate Switchr configuration file: {configPath}");
}

var yamlContent = File.ReadAllText(configPath);
var deserializer = new DeserializerBuilder()
    .WithNamingConvention(UnderscoredNamingConvention.Instance)
    .IgnoreUnmatchedProperties()
    .Build();

var switchrConfig = deserializer.Deserialize<SwitchrConfig>(yamlContent) ?? new SwitchrConfig();
builder.Services.AddSingleton(switchrConfig);

// Register Executors and Job Manager
builder.Services.AddScoped<MockExecutor>();
builder.Services.AddScoped<SshExecutor>();
builder.Services.AddScoped<WinRmExecutor>();
builder.Services.AddSingleton<JobManager>();

var app = builder.Build();

// Initialize active profiles from configured remote file paths
var jobManager = app.Services.GetRequiredService<JobManager>();
await jobManager.InitializeActiveProfilesAsync();

// Enable serving static frontend files from wwwroot
app.UseDefaultFiles(new DefaultFilesOptions
{
    DefaultFileNames = new List<string> { "index.html" }
});
app.UseStaticFiles();

// REST API Endpoints
app.MapGet("/api/health", (SwitchrConfig config) =>
{
    var response = new HealthResponse(
        Status: "healthy",
        App: config.App.Name,
        Version: config.App.Version,
        DryRun: config.App.DryRun
    );
    return Results.Ok(response);
});

app.MapGet("/api/inventory", (SwitchrConfig config, JobManager jobManager) =>
{
    var hostsDto = new List<HostStateViewDto>();

    foreach (var host in config.Hosts)
    {
        var servicesForHost = config.GetServicesForHost(host.Id);
        var servicesDto = new List<ServiceStateViewDto>();

        foreach (var svc in servicesForHost)
        {
            var isLocked = jobManager.IsServiceLocked(host.Id, svc.Id);
            var activeJobId = jobManager.GetActiveJobId(host.Id, svc.Id);
            var status = isLocked ? "TRANSITIONING" : "RUNNING";

            var profileDtos = svc.Profiles.Select(p => new ProfileDto(
                Name: p.Name,
                Description: p.Description,
                ScriptPath: p.ScriptPath,
                Parameters: p.Parameters,
                TimeoutSeconds: p.TimeoutSeconds,
                Scripts: p.GetEffectiveScripts().Select(s => new ScriptStepDto(
                    Name: s.Name,
                    ScriptPath: s.ScriptPath,
                    Parameters: s.Parameters,
                    TimeoutSeconds: s.TimeoutSeconds
                )).ToList()
            )).ToList();

            servicesDto.Add(new ServiceStateViewDto(
                Id: svc.Id,
                HostId: host.Id,
                Name: svc.Name,
                ServiceType: svc.ServiceType,
                VerificationServiceName: svc.VerificationServiceName,
                ActiveProfilePath: svc.ActiveProfilePath,
                CurrentProfile: svc.CurrentProfile,
                Description: svc.Description,
                Status: status,
                IsLocked: isLocked,
                ActiveJobId: activeJobId,
                Profiles: profileDtos
            ));
        }

        hostsDto.Add(new HostStateViewDto(
            Id: host.Id,
            Name: host.Name,
            OsType: host.OsType,
            Hostname: host.Hostname,
            Port: host.Port,
            UseSsl: host.UseSsl,
            Description: host.Description,
            Services: servicesDto
        ));
    }

    var response = new InventoryResponseDto(
        AppVersion: config.App.Version,
        DryRun: config.App.DryRun,
        Hosts: hostsDto,
        ActiveLocksCount: jobManager.GetActiveLocksCount()
    );

    return Results.Ok(response);
});

app.MapPost("/api/jobs/switch", async (SwitchJobRequest request, JobManager jobManager) =>
{
    if (string.IsNullOrWhiteSpace(request.HostId) ||
        string.IsNullOrWhiteSpace(request.ServiceId) ||
        string.IsNullOrWhiteSpace(request.ProfileName))
    {
        return Results.BadRequest(new ErrorResponse("host_id, service_id, and profile_name are required", "Missing required parameters"));
    }

    try
    {
        var jobId = await jobManager.StartSwitchJobAsync(request);
        return Results.Accepted($"/api/jobs/{jobId}/stream", new SwitchJobResponse(
            JobId: jobId,
            HostId: request.HostId,
            ServiceId: request.ServiceId,
            TargetProfile: request.ProfileName,
            Status: "RUNNING",
            Message: "Profile switch job successfully queued and dispatched."
        ));
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new ErrorResponse(ex.Message, "Entity not found"));
    }
    catch (InvalidOperationException ex)
    {
        // 409 Conflict when execution lock is active
        return Results.Conflict(new ConflictErrorResponse(
            Detail: ex.Message,
            Error: "Service is currently locked."
        ));
    }
    catch (Exception ex)
    {
        return Results.Problem(ex.Message);
    }
});

app.MapPost("/api/jobs/{id}/abort", (string id, JobManager jobManager) =>
{
    var aborted = jobManager.AbortJob(id);
    return aborted
        ? Results.Ok(new { job_id = id, status = "ABORTED", message = $"Job {id} abort signal sent." })
        : Results.BadRequest(new ErrorResponse($"Job {id} cannot be aborted (not found or already completed).", "Invalid state"));
});

app.MapGet("/api/jobs/{id}/stream", async (string id, JobManager jobManager, HttpContext context) =>
{
    var job = jobManager.GetJob(id);
    if (job == null)
    {
        context.Response.StatusCode = 404;
        context.Response.ContentType = "text/plain";
        await context.Response.WriteAsync("Job not found.");
        return;
    }

    context.Response.Headers.Append("Content-Type", "text/event-stream");
    context.Response.Headers.Append("Cache-Control", "no-cache, no-transform");
    context.Response.Headers.Append("X-Accel-Buffering", "no");

    await context.Response.WriteAsync($": connected to switchr job {id}\n\n");
    await context.Response.Body.FlushAsync();

    // Flush past captured lines first
    foreach (var pastLine in job.CapturedLogs.ToList())
    {
        await context.Response.WriteAsync($"data: {pastLine.Text}\n\n");
        await context.Response.Body.FlushAsync();
    }

    if (job.Status != "RUNNING" && job.Status != "QUEUED")
    {
        await context.Response.WriteAsync($"event: done\ndata: {job.Status}\n\n");
        await context.Response.Body.FlushAsync();
        return;
    }

    // Stream live lines with heartbeat
    using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    var heartbeatTask = Task.Run(async () =>
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        while (!heartbeatCts.Token.IsCancellationRequested && await timer.WaitForNextTickAsync(heartbeatCts.Token))
        {
            try
            {
                await context.Response.WriteAsync(": heartbeat\n\n", heartbeatCts.Token);
                await context.Response.Body.FlushAsync(heartbeatCts.Token);
            }
            catch
            {
                break;
            }
        }
    }, heartbeatCts.Token);

    try
    {
        await foreach (var line in job.StreamChannel.Reader.ReadAllAsync(context.RequestAborted))
        {
            await context.Response.WriteAsync($"data: {line}\n\n");
            await context.Response.Body.FlushAsync();
        }
    }
    catch (OperationCanceledException)
    {
        // Client disconnected from stream
    }
    finally
    {
        heartbeatCts.Cancel();
        try { await heartbeatTask; } catch { }
    }

    // Emit final event with the actual outcome status (SUCCESS, FAILED, or ABORTED)
    var finalStatus = string.IsNullOrWhiteSpace(job.Status) || job.Status == "RUNNING" ? "SUCCESS" : job.Status;
    await context.Response.WriteAsync($"event: done\ndata: {finalStatus}\n\n");
    await context.Response.Body.FlushAsync();
});

app.MapGet("/api/jobs/history", async (JobManager jobManager) =>
{
    var history = await jobManager.GetHistoryAsync();
    return Results.Ok(new AuditHistoryResponse(history));
});

app.MapDelete("/api/jobs/history", (JobManager jobManager) =>
{
    jobManager.ClearAuditHistory();
    return Results.Ok(new ClearHistoryResponse(
        Success: true,
        Message: "Audit history cleared successfully."
    ));
});

app.Run();
