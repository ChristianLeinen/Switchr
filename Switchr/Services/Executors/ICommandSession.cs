namespace Switchr.Services.Executors;

public interface ICommandSession : IAsyncDisposable, IDisposable
{
    IAsyncEnumerable<string> ExecuteCommandStreamAsync(
        string scriptPath,
        string? arguments,
        CancellationToken cancellationToken
    );

    Task<bool> VerifyServiceRunningAsync(
        string verificationName,
        CancellationToken cancellationToken
    );

    Task<string?> ReadRemoteTextFileAsync(
        string filePath,
        CancellationToken cancellationToken = default
    );
}
