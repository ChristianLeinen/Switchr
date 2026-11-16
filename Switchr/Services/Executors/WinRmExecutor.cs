using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Runtime.CompilerServices;
using System.Security;
using System.Threading.Channels;
using Switchr.Models;

namespace Switchr.Services.Executors;

public class WinRmExecutor : ICommandExecutor
{
    private readonly ILogger<WinRmExecutor> _logger;

    public WinRmExecutor(ILogger<WinRmExecutor> logger)
    {
        _logger = logger;
    }

    public static WSManConnectionInfo CreateConnectionInfo(HostConfig host, int openTimeoutMs = 15000, int operationTimeoutMs = 300000)
    {
        var scheme = host.UseSsl || host.Port == 5986 ? "https" : "http";
        var targetUri = new Uri($"{scheme}://{host.Hostname}:{host.Port}/wsman");

        var password = host.EffectivePassword ?? string.Empty;
        var securePassword = new SecureString();
        foreach (var c in password)
        {
            securePassword.AppendChar(c);
        }
        securePassword.MakeReadOnly();

        var cred = new PSCredential(host.EffectiveUsername, securePassword);
        return new WSManConnectionInfo(targetUri, "http://schemas.microsoft.com/powershell/Microsoft.PowerShell", cred)
        {
            AuthenticationMechanism = AuthenticationMechanism.Default,
            OpenTimeout = openTimeoutMs,
            OperationTimeout = operationTimeoutMs
        };
    }

    public async Task<ICommandSession> OpenSessionAsync(HostConfig host, CancellationToken cancellationToken = default)
    {
        var connectionInfo = CreateConnectionInfo(host);
        var runspace = RunspaceFactory.CreateRunspace(connectionInfo);
        try
        {
            await Task.Run(() => runspace.Open(), cancellationToken);
            return new WinRmCommandSession(host, runspace, _logger);
        }
        catch
        {
            runspace.Dispose();
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
        yield return $"[INFO] Connecting to Windows host {host.Hostname}:{host.Port} via WinRM...";

        var session = await OpenSessionAsync(host, cancellationToken);
        yield return $"[INFO] WinRM session established as '{host.EffectiveUsername}'.";

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

    private sealed class WinRmCommandSession : ICommandSession
    {
        private readonly HostConfig _host;
        private readonly Runspace _runspace;
        private readonly ILogger<WinRmExecutor> _logger;
        private bool _disposed;

        public WinRmCommandSession(HostConfig host, Runspace runspace, ILogger<WinRmExecutor> logger)
        {
            _host = host;
            _runspace = runspace;
            _logger = logger;
        }

        public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
            string scriptPath,
            string? arguments,
            [EnumeratorCancellation] CancellationToken cancellationToken
        )
        {
            var channel = Channel.CreateUnbounded<string>();

            _ = Task.Run(async () =>
            {
                PowerShell? ps = null;

                try
                {
                    ps = PowerShell.Create();
                    ps.Runspace = _runspace;

                    var cmdScript = string.IsNullOrWhiteSpace(arguments)
                        ? $"& cmd.exe /c \"\"{scriptPath}\"\""
                        : $"& cmd.exe /c \"\"{scriptPath}\" {arguments}\"";

                    await channel.Writer.WriteAsync($"[EXEC] Running remote batch script: {cmdScript}", cancellationToken);

                    ps.AddScript(cmdScript);

                    var outputCollection = new PSDataCollection<PSObject>();
                    outputCollection.DataAdded += async (s, e) =>
                    {
                        var item = outputCollection[e.Index];
                        if (item != null)
                        {
                            await channel.Writer.WriteAsync($"[STDOUT] {item.BaseObject}", cancellationToken);
                        }
                    };

                    ps.Streams.Error.DataAdded += async (s, e) =>
                    {
                        var err = ps.Streams.Error[e.Index];
                        if (err != null)
                        {
                            await channel.Writer.WriteAsync($"[STDERR] {err}", cancellationToken);
                        }
                    };

                    var asyncResult = ps.BeginInvoke(new PSDataCollection<PSObject>(), outputCollection);

                    while (!asyncResult.IsCompleted)
                    {
                        if (cancellationToken.IsCancellationRequested)
                        {
                            ps.Stop();
                            cancellationToken.ThrowIfCancellationRequested();
                        }
                        await Task.Delay(100, cancellationToken);
                    }

                    ps.EndInvoke(asyncResult);

                    if (ps.HadErrors)
                    {
                        await channel.Writer.WriteAsync("[WARN] PowerShell reported non-terminating errors during execution.", cancellationToken);
                    }
                    else
                    {
                        await channel.Writer.WriteAsync("[INFO] WinRM execution completed successfully.", cancellationToken);
                    }
                }
                catch (Exception ex)
                {
                    channel.Writer.TryWrite($"[ERROR] WinRM Execution Error: {ex.Message}");
                    channel.Writer.TryComplete(ex);
                    return;
                }
                finally
                {
                    ps?.Dispose();
                    channel.Writer.TryComplete();
                }
            }, cancellationToken);

            await foreach (var line in channel.Reader.ReadAllAsync(cancellationToken))
            {
                yield return line;
            }
        }

        public async Task<bool> VerifyServiceRunningAsync(
            string verificationName,
            CancellationToken cancellationToken
        )
        {
            return await Task.Run(() =>
            {
                try
                {
                    using var ps = PowerShell.Create();
                    ps.Runspace = _runspace;
                    ps.AddScript($"(Get-Service -Name \"{verificationName}\" -ErrorAction SilentlyContinue).Status");

                    var results = ps.Invoke();
                    if (results.Count > 0)
                    {
                        var status = results[0]?.ToString() ?? "";
                        return status.Equals("Running", StringComparison.OrdinalIgnoreCase);
                    }

                    return false;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to verify service status on {Host}", _host.Hostname);
                    return false;
                }
            }, cancellationToken);
        }

        public async Task<string?> ReadRemoteTextFileAsync(
            string filePath,
            CancellationToken cancellationToken = default
        )
        {
            return await Task.Run(() =>
            {
                try
                {
                    using var ps = PowerShell.Create();
                    ps.Runspace = _runspace;

                    // Safely escape the file path for PowerShell literal string
                    var escapedPath = filePath.Replace("'", "''");
                    ps.AddScript($"if (Test-Path -LiteralPath '{escapedPath}') {{ Get-Content -LiteralPath '{escapedPath}' -Raw }}");

                    var results = ps.Invoke();
                    if (results.Count > 0 && results[0]?.BaseObject != null)
                    {
                        var text = results[0].BaseObject.ToString()?.Trim();
                        return string.IsNullOrWhiteSpace(text) ? null : text;
                    }

                    return null;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to read remote text file '{FilePath}' on {Host}", filePath, _host.Hostname);
                    return null;
                }
            }, cancellationToken);
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                _runspace.Dispose();
            }
        }

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
