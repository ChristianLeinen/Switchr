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

    public Task<ICommandSession> OpenSessionAsync(HostConfig host, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[MOCK] Opening mock session for {Host}", host.Hostname);
        return Task.FromResult<ICommandSession>(new MockCommandSession(host, _logger));
    }

    public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        HostConfig host,
        string scriptPath,
        string? arguments,
        [EnumeratorCancellation] CancellationToken cancellationToken
    )
    {
        await using var session = await OpenSessionAsync(host, cancellationToken);
        await foreach (var line in session.ExecuteCommandStreamAsync(scriptPath, arguments, cancellationToken))
        {
            yield return line;
        }
    }

    public async Task<bool> VerifyServiceRunningAsync(
        HostConfig host,
        string verificationName,
        CancellationToken cancellationToken
    )
    {
        await using var session = await OpenSessionAsync(host, cancellationToken);
        return await session.VerifyServiceRunningAsync(verificationName, cancellationToken);
    }

    public async Task<string?> ReadRemoteTextFileAsync(
        HostConfig host,
        string filePath,
        CancellationToken cancellationToken = default
    )
    {
        await using var session = await OpenSessionAsync(host, cancellationToken);
        return await session.ReadRemoteTextFileAsync(filePath, cancellationToken);
    }

    private sealed class MockCommandSession : ICommandSession
    {
        private readonly HostConfig _host;
        private readonly ILogger<MockExecutor> _logger;
        private bool _connected;

        public MockCommandSession(HostConfig host, ILogger<MockExecutor> logger)
        {
            _host = host;
            _logger = logger;
        }

        public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
            string scriptPath,
            string? arguments,
            [EnumeratorCancellation] CancellationToken cancellationToken
        )
        {
            _logger.LogInformation("[MOCK] Starting execution on {Host}: {Script} {Args}", _host.Hostname, scriptPath, arguments);

            if (!_connected)
            {
                yield return $"[INFO] [DRY RUN] Connecting to {_host.Hostname}:{_host.Port} ({_host.OsType.ToUpper()})...";
                await Task.Delay(400, cancellationToken);

                yield return $"[INFO] [DRY RUN] Authenticated as '{_host.EffectiveUsername}'.";
                await Task.Delay(300, cancellationToken);

                _connected = true;
            }

            yield return $"[EXEC] Invoking script: {scriptPath} {(string.IsNullOrWhiteSpace(arguments) ? "" : arguments)}";
            await Task.Delay(400, cancellationToken);

            yield return $"[OUT] Running script payload for: {Path.GetFileName(scriptPath)}";
            await Task.Delay(400, cancellationToken);

            yield return "[OUT] Completed execution successfully with status OK.";
            await Task.Delay(200, cancellationToken);

            yield return "[INFO] Script execution finished with exit code: 0";
        }

        public async Task<bool> VerifyServiceRunningAsync(
            string verificationName,
            CancellationToken cancellationToken
        )
        {
            _logger.LogInformation("[MOCK] Verifying service '{VerificationName}' on {Host}", verificationName, _host.Hostname);
            await Task.Delay(500, cancellationToken);
            return true; // Always healthy in mock mode
        }

        public async Task<string?> ReadRemoteTextFileAsync(
            string filePath,
            CancellationToken cancellationToken = default
        )
        {
            _logger.LogInformation("[MOCK] Reading remote text file '{FilePath}' on {Host}", filePath, _host.Hostname);
            await Task.Delay(100, cancellationToken);

            if (File.Exists(filePath))
            {
                try
                {
                    var content = await File.ReadAllTextAsync(filePath, cancellationToken);
                    return content.Trim();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[MOCK] Failed to read mock file {FilePath}", filePath);
                }
            }

            return null;
        }

        public void Dispose() { }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
