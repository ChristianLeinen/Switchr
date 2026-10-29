using System.Runtime.CompilerServices;
using Switchr.Models;

namespace Switchr.Services.Executors;

public class MockExecutor : ICommandExecutor
{
    private readonly ILogger<MockExecutor> _logger;

    public MockExecutor(ILogger<MockExecutor> logger)
    {
        _logger = logger;
    }

    public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        HostConfig host,
        string scriptPath,
        string? arguments,
        [EnumeratorCancellation] CancellationToken cancellationToken
    )
    {
        _logger.LogInformation("[MOCK] Starting execution on {Host}: {Script} {Args}", host.Hostname, scriptPath, arguments);

        yield return $"[INFO] [DRY RUN] Connecting to {host.Hostname}:{host.Port} ({host.OsType.ToUpper()})...";
        await Task.Delay(400, cancellationToken);

        yield return $"[INFO] [DRY RUN] Authenticated as '{host.EffectiveUsername}'.";
        await Task.Delay(300, cancellationToken);

        yield return $"[EXEC] Invoking script: {scriptPath} {(string.IsNullOrWhiteSpace(arguments) ? "" : arguments)}";
        await Task.Delay(400, cancellationToken);

        yield return $"[OUT] Running script payload for: {Path.GetFileName(scriptPath)}";
        await Task.Delay(400, cancellationToken);

        yield return "[OUT] Completed execution successfully with status OK.";
        await Task.Delay(200, cancellationToken);

        yield return "[INFO] Script execution finished with exit code: 0";
    }

    public async Task<bool> VerifyServiceRunningAsync(
        HostConfig host,
        string verificationName,
        CancellationToken cancellationToken
    )
    {
        _logger.LogInformation("[MOCK] Verifying service '{VerificationName}' on {Host}", verificationName, host.Hostname);
        await Task.Delay(500, cancellationToken);
        return true; // Always healthy in mock mode
    }
}
