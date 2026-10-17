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

    public async IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        HostConfig host,
        string scriptPath,
        string? arguments,
        [EnumeratorCancellation] CancellationToken cancellationToken
    )
    {
        yield return $"[INFO] Connecting to Windows host {host.Hostname}:{host.Port} via WinRM...";

        var channel = Channel.CreateUnbounded<string>();

        _ = Task.Run(async () =>
        {
            Runspace? runspace = null;
            PowerShell? ps = null;

            try
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
                var connectionInfo = new WSManConnectionInfo(targetUri, "http://schemas.microsoft.com/powershell/Microsoft.PowerShell", cred)
                {
                    AuthenticationMechanism = AuthenticationMechanism.Default,
                    OpenTimeout = 15000,
                    OperationTimeout = 300000
                };

                runspace = RunspaceFactory.CreateRunspace(connectionInfo);
                await Task.Run(() => runspace.Open(), cancellationToken);

                await channel.Writer.WriteAsync($"[INFO] WinRM session established as '{host.EffectiveUsername}'.", cancellationToken);

                ps = PowerShell.Create();
                ps.Runspace = runspace;

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
                runspace?.Dispose();
                channel.Writer.TryComplete();
            }
        }, cancellationToken);

        await foreach (var line in channel.Reader.ReadAllAsync(cancellationToken))
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
        return await Task.Run(() =>
        {
            try
            {
                var scheme = host.UseSsl || host.Port == 5986 ? "https" : "http";
                var targetUri = new Uri($"{scheme}://{host.Hostname}:{host.Port}/wsman");

                var password = host.EffectivePassword ?? string.Empty;
                var securePassword = new SecureString();
                foreach (var c in password) securePassword.AppendChar(c);
                securePassword.MakeReadOnly();

                var cred = new PSCredential(host.EffectiveUsername, securePassword);
                var connectionInfo = new WSManConnectionInfo(targetUri, "http://schemas.microsoft.com/powershell/Microsoft.PowerShell", cred)
                {
                    OpenTimeout = 10000,
                    OperationTimeout = 15000
                };

                using var runspace = RunspaceFactory.CreateRunspace(connectionInfo);
                runspace.Open();

                using var ps = PowerShell.Create();
                ps.Runspace = runspace;
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
                _logger.LogError(ex, "Failed to verify service status on {Host}", host.Hostname);
                return false;
            }
        }, cancellationToken);
    }
}
