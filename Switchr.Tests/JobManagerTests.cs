using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Switchr.Models;
using Switchr.Services;
using Switchr.Services.Executors;
using Xunit;

namespace Switchr.Tests;

public class JobManagerTests
{
    private (JobManager manager, SwitchrConfig config) CreateTestJobManager()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddScoped<MockExecutor>();
        services.AddScoped<SshExecutor>();
        services.AddScoped<WinRmExecutor>();

        var config = new SwitchrConfig
        {
            App = new AppSettings
            {
                DryRun = true,
                DefaultJobTimeout = 30,
                LogDir = Path.Combine(Path.GetTempPath(), "switchr_test_logs_" + Guid.NewGuid().ToString("N"))
            },
            Hosts = new List<HostConfig>
            {
                new()
                {
                    Id = "host1",
                    Hostname = "127.0.0.1",
                    OsType = "windows",
                    Auth = new AuthConfig { Username = "admin" }
                }
            },
            Services = new List<ServiceConfig>
            {
                new()
                {
                    Id = "svc1",
                    HostId = "host1",
                    Name = "TestSvc",
                    VerificationServiceName = "TestSvc",
                    CurrentProfile = "profA",
                    Profiles = new List<ProfileConfig>
                    {
                        new()
                        {
                            Name = "profA",
                            ScriptPath = "C:\\test.bat",
                            Parameters = new List<string>()
                        }
                    }
                }
            }
        };

        var provider = services.BuildServiceProvider();
        var manager = new JobManager(provider, config, NullLogger<JobManager>.Instance);

        return (manager, config);
    }

    [Fact]
    public async Task StartSwitchJob_AcquiresLock_SecondJobThrowsConflict()
    {
        var (manager, _) = CreateTestJobManager();

        var request = new SwitchJobRequest("host1", "svc1", "profA");

        // Start first job
        var jobId1 = await manager.StartSwitchJobAsync(request);
        Assert.NotNull(jobId1);

        // Verify service is locked
        Assert.True(manager.IsServiceLocked("host1", "svc1"));

        // Second simultaneous request should throw InvalidOperationException (409 Conflict)
        await Assert.ThrowsAsync<InvalidOperationException>(() => manager.StartSwitchJobAsync(request));
    }

    [Fact]
    public async Task StartSwitchJob_ExecutesAndStreamsLogs()
    {
        var (manager, _) = CreateTestJobManager();

        var request = new SwitchJobRequest("host1", "svc1", "profA");
        var jobId = await manager.StartSwitchJobAsync(request);

        var job = manager.GetJob(jobId);
        Assert.NotNull(job);

        var lines = new List<string>();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        await foreach (var line in job.StreamChannel.Reader.ReadAllAsync(cts.Token))
        {
            lines.Add(line);
        }

        Assert.NotEmpty(lines);
        Assert.Contains(lines, l => l.Contains("[SWITCHR] Starting Switch Job"));
        Assert.Contains(lines, l => l.Contains("[SUCCESS]"));
        Assert.Equal("Succeeded", job.Status);
    }

    [Fact]
    public async Task AbortJob_SignalsCancellation()
    {
        var (manager, _) = CreateTestJobManager();

        var request = new SwitchJobRequest("host1", "svc1", "profA");
        var jobId = await manager.StartSwitchJobAsync(request);

        var aborted = manager.AbortJob(jobId);
        Assert.True(aborted);

        var job = manager.GetJob(jobId);
        Assert.NotNull(job);
        Assert.True(job.Cts.IsCancellationRequested);
    }
}
