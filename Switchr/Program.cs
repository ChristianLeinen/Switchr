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
    try
    {
        var jobId = await jobManager.StartSwitchJobAsync(request);
        return Results.Ok(new
        {
            job_id = jobId,
            jobId,
            host_id = request.HostId,
            service_id = request.ServiceId,
            target_profile = request.ProfileName,
            status = "RUNNING",
            message = "Switch job queued and started."
        });
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (InvalidOperationException ex)
    {
        // 409 Conflict when execution lock is active
        return Results.Conflict(new { error = ex.Message });
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
        ? Results.Ok(new { job_id = id, jobId = id, status = "ABORTED", message = $"Job {id} abort signal issued." })
        : Results.BadRequest(new { error = $"Job {id} cannot be aborted (not found or already finished)." });
});

app.MapGet("/api/jobs/{id}/stream", async (string id, JobManager jobManager, HttpContext context) =>
{
    var job = jobManager.GetJob(id);
    if (job == null)
    {
        context.Response.StatusCode = 404;
        await context.Response.WriteAsync("Job not found.");
        return;
    }

    context.Response.Headers.Append("Content-Type", "text/event-stream");
    context.Response.Headers.Append("Cache-Control", "no-cache");
    context.Response.Headers.Append("X-Accel-Buffering", "no");

    // Flush past captured lines first
    foreach (var pastLine in job.CapturedLogs.ToList())
    {
        await context.Response.WriteAsync($"data: {pastLine}\n\n");
        await context.Response.Body.FlushAsync();
    }

    // Stream live lines
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

    await context.Response.WriteAsync("event: done\ndata: [STREAM_COMPLETED]\n\n");
    await context.Response.Body.FlushAsync();
});

app.MapGet("/api/jobs/history", async (JobManager jobManager) =>
{
    var history = await jobManager.GetHistoryAsync();
    return Results.Ok(history);
});

app.Run();
