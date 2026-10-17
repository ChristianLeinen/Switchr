using System.Runtime.CompilerServices;
using Switchr.Models;

namespace Switchr.Services.Executors;

public interface ICommandExecutor
{
    IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        HostConfig host,
        string scriptPath,
        string? arguments,
        CancellationToken cancellationToken
    );

    Task<bool> VerifyServiceRunningAsync(
        HostConfig host,
        string verificationName,
        CancellationToken cancellationToken
    );
}
