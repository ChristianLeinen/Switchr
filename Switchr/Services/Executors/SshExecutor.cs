using System.Runtime.CompilerServices;
using Renci.SshNet;
using Switchr.Models;

namespace Switchr.Services.Executors;

public class SshExecutor : ICommandExecutor
{
    private readonly ILogger<SshExecutor> _logger;

    public SshExecutor(ILogger<SshExecutor> logger)
    {
        _logger = logger;
    }

    public static Renci.SshNet.ConnectionInfo CreateConnectionInfo(HostConfig host, TimeSpan timeout)
    {
        var authMethods = new List<AuthenticationMethod>();
        var keyPath = host.EffectiveKeyPath;
        var password = host.EffectivePassword;

        if (!string.IsNullOrWhiteSpace(keyPath) && File.Exists(keyPath))
        {
            authMethods.Add(new PrivateKeyAuthenticationMethod(host.EffectiveUsername, new PrivateKeyFile(keyPath)));
        }
        if (!string.IsNullOrWhiteSpace(password))
        {
            authMethods.Add(new PasswordAuthenticationMethod(host.EffectiveUsername, password));
        }

        return new Renci.SshNet.ConnectionInfo(host.Hostname, host.Port, host.EffectiveUsername, authMethods.ToArray())
        {
            Timeout = timeout
        };
    }

    public async Task<ICommandSession> OpenSessionAsync(HostConfig host, CancellationToken cancellationToken = default)
    {
        var connectionInfo = CreateConnectionInfo(host, TimeSpan.FromSeconds(15));
        var client = new SshClient(connectionInfo);
        try
        {
            await Task.Run(() => client.Connect(), cancellationToken);
            return new SshCommandSession(host, client, _logger);
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        HostConfig host,
        string scriptPath,
        string? arguments,
        [EnumeratorCancellation] CancellationToken cancellationToken
    )
    {
        yield return $"[INFO] Connecting to Unix host {host.Hostname}:{host.Port} via SSH...";

        ICommandSession session;
        try
        {
            session = await OpenSessionAsync(host, cancellationToken);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"SSH Connection failed: {ex.Message}", ex);
        }

        yield return $"[INFO] Connected and authenticated as '{host.EffectiveUsername}'.";

        await using (session)
        {
            await foreach (var line in session.ExecuteCommandStreamAsync(scriptPath, arguments, cancellationToken))
            {
                yield return line;
            }
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
        try
        {
            await using var session = await OpenSessionAsync(host, cancellationToken);
            return await session.ReadRemoteTextFileAsync(filePath, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read remote text file '{FilePath}' on {Host}", filePath, host.Hostname);
            return null;
        }
    }

    private sealed class SshCommandSession : ICommandSession
    {
        private readonly HostConfig _host;
        private readonly SshClient _client;
        private readonly ILogger<SshExecutor> _logger;
        private bool _disposed;

        public SshCommandSession(HostConfig host, SshClient client, ILogger<SshExecutor> logger)
        {
            _host = host;
            _client = client;
            _logger = logger;
        }

        public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
            string scriptPath,
            string? arguments,
            [EnumeratorCancellation] CancellationToken cancellationToken
        )
        {
            var commandText = string.IsNullOrWhiteSpace(arguments)
                ? $"bash \"{scriptPath}\""
                : $"bash \"{scriptPath}\" {arguments}";

            yield return $"[EXEC] Running: {commandText}";

            using var cmd = _client.CreateCommand(commandText);
            var asyncResult = cmd.BeginExecute();

            using var stdoutReader = new StreamReader(cmd.OutputStream);
            using var stderrReader = new StreamReader(cmd.ExtendedOutputStream);

            while (!asyncResult.IsCompleted || !stdoutReader.EndOfStream || !stderrReader.EndOfStream)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lineRead = false;
                if (!stdoutReader.EndOfStream)
                {
                    var outLine = await stdoutReader.ReadLineAsync(cancellationToken);
                    if (outLine != null)
                    {
                        yield return $"[STDOUT] {outLine}";
                        lineRead = true;
                    }
                }

                if (!stderrReader.EndOfStream)
                {
                    var errLine = await stderrReader.ReadLineAsync(cancellationToken);
                    if (errLine != null)
                    {
                        yield return $"[STDERR] {errLine}";
                        lineRead = true;
                    }
                }

                if (!lineRead && !asyncResult.IsCompleted)
                {
                    await Task.Delay(100, cancellationToken);
                }
            }

            cmd.EndExecute(asyncResult);

            yield return $"[INFO] Remote command finished with exit code: {cmd.ExitStatus}";
            if (cmd.ExitStatus != 0)
            {
                throw new InvalidOperationException($"Transition script failed with exit code {cmd.ExitStatus}");
            }
        }

        public async Task<bool> VerifyServiceRunningAsync(
            string verificationName,
            CancellationToken cancellationToken
        )
        {
            var checkCmd = $"systemctl is-active \"{verificationName}\" 2>/dev/null || ps -C \"{verificationName}\" -o pid=";
            using var cmd = _client.CreateCommand(checkCmd);
            var result = await Task.Run(() => cmd.Execute(), cancellationToken);

            var output = result.Trim().ToLowerInvariant();
            return output.Contains("active") || !string.IsNullOrWhiteSpace(output);
        }

        public async Task<string?> ReadRemoteTextFileAsync(
            string filePath,
            CancellationToken cancellationToken = default
        )
        {
            try
            {
                var escapedPath = filePath.Replace("'", "'\\''");
                var readCmd = $"test -f '{escapedPath}' && cat '{escapedPath}'";
                using var cmd = _client.CreateCommand(readCmd);
                var result = await Task.Run(() => cmd.Execute(), cancellationToken);

                var text = result?.Trim();
                return string.IsNullOrWhiteSpace(text) ? null : text;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read remote text file '{FilePath}' on {Host}", filePath, _host.Hostname);
                return null;
            }
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                _client.Dispose();
            }
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
