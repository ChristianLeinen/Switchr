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

    public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        HostConfig host,
        string scriptPath,
        string? arguments,
        [EnumeratorCancellation] CancellationToken cancellationToken
    )
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

        var connectionInfo = new Renci.SshNet.ConnectionInfo(host.Hostname, host.Port, host.EffectiveUsername, authMethods.ToArray())
        {
            Timeout = TimeSpan.FromSeconds(15)
        };

        yield return $"[INFO] Connecting to Unix host {host.Hostname}:{host.Port} via SSH...";

        using var client = new SshClient(connectionInfo);
        string? connectionError = null;
        try
        {
            await Task.Run(() => client.Connect(), cancellationToken);
        }
        catch (Exception ex)
        {
            connectionError = ex.Message;
        }

        if (connectionError != null)
        {
            yield return $"[ERROR] Failed to connect to SSH host: {connectionError}";
            throw new InvalidOperationException($"SSH Connection failed: {connectionError}");
        }

        yield return $"[INFO] Connected and authenticated as '{host.EffectiveUsername}'.";

        var commandText = string.IsNullOrWhiteSpace(arguments)
            ? $"bash \"{scriptPath}\""
            : $"bash \"{scriptPath}\" {arguments}";

        yield return $"[EXEC] Running: {commandText}";

        using var cmd = client.CreateCommand(commandText);
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
        HostConfig host,
        string verificationName,
        CancellationToken cancellationToken
    )
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

        var connectionInfo = new Renci.SshNet.ConnectionInfo(host.Hostname, host.Port, host.EffectiveUsername, authMethods.ToArray())
        {
            Timeout = TimeSpan.FromSeconds(10)
        };

        using var client = new SshClient(connectionInfo);
        await Task.Run(() => client.Connect(), cancellationToken);

        // Check systemctl status or process existence
        var checkCmd = $"systemctl is-active \"{verificationName}\" 2>/dev/null || ps -C \"{verificationName}\" -o pid=";
        using var cmd = client.CreateCommand(checkCmd);
        var result = await Task.Run(() => cmd.Execute(), cancellationToken);

        var output = result.Trim().ToLowerInvariant();
        return output.Contains("active") || !string.IsNullOrWhiteSpace(output);
    }
}
