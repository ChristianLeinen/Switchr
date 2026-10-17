# C# .NET Backend Reverse-Proxied by Apache

Status: accepted
Supersedes: ADR-0001

We decided to replace the Python backend with a self-contained C# (.NET 8) executable running behind Apache HTTP Server. This provides a single-file executable with zero Python or virtual environment deployment dependencies on the Windows server, native Windows Service integration via `Microsoft.Extensions.Hosting.WindowsServices`, in-process PowerShell Remoting via `System.Management.Automation` for Windows targets, and pure managed SSH via `SSH.NET` for Unix targets, while preserving the exact same REST API and Server-Sent Events contracts with Apache and the web frontend.
