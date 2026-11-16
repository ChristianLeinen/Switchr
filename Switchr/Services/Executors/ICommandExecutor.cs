using System.Runtime.CompilerServices;
using Switchr.Models;

namespace Switchr.Services.Executors;

public interface ICommandExecutor
{
    Task<ICommandSession> OpenSessionAsync(
        HostConfig host,
        CancellationToken cancellationToken = default
    );

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

    Task<string?> ReadRemoteTextFileAsync(
        HostConfig host,
        string filePath,
        CancellationToken cancellationToken = default
    );
}
