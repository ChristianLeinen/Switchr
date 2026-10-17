# Agentless Remote Execution via SSH and WinRM

We decided to execute remote scripts agentlessly using SSH for Unix targets and WinRM for Windows targets, rather than deploying custom agents or daemons to each server. This eliminates the deployment and ongoing maintenance overhead of custom binaries across the heterogeneous fleet and directly utilizes standard operating system remoting protocols and credentials.
