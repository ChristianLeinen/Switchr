"""
switchr Remote Executors
Handles agentless command execution across Unix (SSH via Paramiko) and
Windows (WinRM via pywinrm), plus MockExecutor for dry-run simulation.
"""

from __future__ import annotations
import abc
import os
import time
import threading
from typing import Generator, List, Optional, Tuple

from models import HostConfig, OSType


class ExecutionTimeoutError(Exception):
    """Raised when remote command execution exceeds configured timeout."""
    pass


class ExecutionAbortedError(Exception):
    """Raised when an active job is explicitly cancelled by the operator."""
    pass


class BaseExecutor(abc.ABC):
    """
    Abstract interface for remote command execution.
    Yields output lines in real-time and returns the process exit code.
    """
    def __init__(self, host: HostConfig):
        self.host = host
        self._abort_event = threading.Event()

    def abort(self) -> None:
        """Signal executor to terminate remote command immediately."""
        self._abort_event.set()

    @property
    def is_aborted(self) -> bool:
        return self._abort_event.is_set()

    @abc.abstractmethod
    def execute(
        self,
        command: str,
        timeout: int = 300,
        env_vars: Optional[dict] = None
    ) -> Generator[str, None, int]:
        """
        Execute command on target host.
        Yields:
            str: Line-by-line output (stdout/stderr prefixed or formatted)
        Returns:
            int: Exit code of command (0 = success)
        """
        pass

    @abc.abstractmethod
    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        """
        Runs post-transition verification probe.
        Returns:
            (is_running: bool, output_summary: str)
        """
        pass


class SSHExecutor(BaseExecutor):
    """
    Agentless Unix execution using Paramiko SSH client.
    Streams live stdout and stderr line-by-line.
    """
    def execute(
        self,
        command: str,
        timeout: int = 300,
        env_vars: Optional[dict] = None
    ) -> Generator[str, None, int]:
        import paramiko

        yield f"[*] Connecting to Unix host {self.host.hostname}:{self.host.port} via SSH..."
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            connect_kwargs = {
                "hostname": self.host.hostname,
                "port": self.host.port,
                "username": self.host.auth.username,
                "timeout": 15,
            }

            if self.host.auth.type == "key":
                key_path = os.path.expanduser(self.host.auth.key_path or "~/.ssh/id_rsa")
                connect_kwargs["key_filename"] = key_path
            else:
                pwd = os.environ.get(self.host.auth.password_env or "", "")
                connect_kwargs["password"] = pwd

            client.connect(**connect_kwargs)
            yield f"[✓] SSH session established with {self.host.name} ({self.host.hostname})"

            # Build command with environment if provided
            full_command = command
            if env_vars:
                exports = " ".join([f"{k}='{v}'" for k, v in env_vars.items()])
                full_command = f"{exports} {command}"

            yield f"[$] Executing: {full_command}"
            transport = client.get_transport()
            if not transport:
                raise RuntimeError("Failed to obtain SSH transport")

            channel = transport.open_session()
            channel.set_combine_stderr(False)
            channel.exec_command(full_command)

            start_time = time.time()
            stdout_stream = channel.makefile("r", -1)
            stderr_stream = channel.makefile_stderr("r", -1)

            # Stream output until process exits
            while not channel.exit_status_ready():
                if self.is_aborted:
                    channel.close()
                    yield "[!] EXECUTION ABORTED by operator. Sent SIGTERM/channel close."
                    raise ExecutionAbortedError("Job was cancelled by operator")

                if time.time() - start_time > timeout:
                    channel.close()
                    yield f"[!] EXECUTION TIMED OUT after {timeout} seconds."
                    raise ExecutionTimeoutError(f"Job exceeded {timeout}s timeout")

                # Read available lines
                while channel.recv_ready():
                    line = stdout_stream.readline()
                    if line:
                        yield f"[stdout] {line.rstrip()}"

                while channel.recv_stderr_ready():
                    err_line = stderr_stream.readline()
                    if err_line:
                        yield f"[stderr] {err_line.rstrip()}"

                time.sleep(0.05)

            # Flush remaining output
            for line in stdout_stream.readlines():
                yield f"[stdout] {line.rstrip()}"
            for err_line in stderr_stream.readlines():
                yield f"[stderr] {err_line.rstrip()}"

            exit_code = channel.recv_exit_status()
            yield f"[*] Process terminated with exit code: {exit_code}"
            return exit_code

        except Exception as exc:
            yield f"[error] SSH execution error: {str(exc)}"
            raise
        finally:
            client.close()

    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            connect_kwargs = {
                "hostname": self.host.hostname,
                "port": self.host.port,
                "username": self.host.auth.username,
                "timeout": 10,
            }
            if self.host.auth.type == "key":
                connect_kwargs["key_filename"] = os.path.expanduser(self.host.auth.key_path or "~/.ssh/id_rsa")
            else:
                connect_kwargs["password"] = os.environ.get(self.host.auth.password_env or "", "")
            client.connect(**connect_kwargs)

            # Check systemd is-active or fallback to ps
            probe_cmd = f"systemctl is-active {service_name} 2>/dev/null || ps aux | grep -v grep | grep -w '{service_name}'"
            stdin, stdout, stderr = client.exec_command(probe_cmd, timeout=10)
            out = stdout.read().decode().strip()
            exit_code = stdout.channel.recv_exit_status()
            client.close()

            is_active = (exit_code == 0) and ("active" in out.lower() or len(out) > 0)
            return (is_active, f"systemctl returned: {out or 'non-zero exit'}")
        except Exception as e:
            return (False, f"SSH Probe failed: {str(e)}")


class WinRMExecutor(BaseExecutor):
    """
    Agentless Windows execution using WinRM (WS-Management / PowerShell).
    """
    def execute(
        self,
        command: str,
        timeout: int = 300,
        env_vars: Optional[dict] = None
    ) -> Generator[str, None, int]:
        import winrm

        scheme = "https" if self.host.use_ssl else "http"
        endpoint = f"{scheme}://{self.host.hostname}:{self.host.port}/wsman"
        yield f"[*] Connecting to Windows host {endpoint} via WinRM..."

        pwd = os.environ.get(self.host.auth.password_env or "", "")
        session = winrm.Session(
            endpoint,
            auth=(self.host.auth.username, pwd),
            transport="ntlm" if not self.host.use_ssl else "ssl",
            server_cert_validation="ignore"
        )

        yield f"[✓] WinRM authenticated session established with {self.host.name}"
        yield f"[$] Running PowerShell script command: {command}"

        start_time = time.time()
        # Open command shell over WinRM
        protocol = session.protocol
        shell_id = protocol.open_shell()

        try:
            command_id = protocol.run_command(shell_id, f"powershell.exe -NonInteractive -ExecutionPolicy Bypass -Command \"{command}\"")

            while True:
                if self.is_aborted:
                    protocol.cleanup_command(shell_id, command_id)
                    yield "[!] EXECUTION ABORTED by operator. Terminated remote WinRM shell."
                    raise ExecutionAbortedError("Job was cancelled by operator")

                if time.time() - start_time > timeout:
                    protocol.cleanup_command(shell_id, command_id)
                    yield f"[!] EXECUTION TIMED OUT after {timeout} seconds."
                    raise ExecutionTimeoutError(f"Job exceeded {timeout}s timeout")

                stdout_chunk, stderr_chunk, return_code, command_done = protocol.get_command_output(shell_id, command_id)

                if stdout_chunk:
                    for line in stdout_chunk.decode(errors="replace").splitlines():
                        if line.strip():
                            yield f"[stdout] {line}"

                if stderr_chunk:
                    for line in stderr_chunk.decode(errors="replace").splitlines():
                        if line.strip():
                            yield f"[stderr] {line}"

                if command_done:
                    yield f"[*] Windows command finished with exit code: {return_code}"
                    return return_code

                time.sleep(0.1)

        except Exception as exc:
            yield f"[error] WinRM execution error: {str(exc)}"
            raise
        finally:
            try:
                protocol.close_shell(shell_id)
            except Exception:
                pass

    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        import winrm
        scheme = "https" if self.host.use_ssl else "http"
        endpoint = f"{scheme}://{self.host.hostname}:{self.host.port}/wsman"
        pwd = os.environ.get(self.host.auth.password_env or "", "")
        try:
            session = winrm.Session(
                endpoint,
                auth=(self.host.auth.username, pwd),
                transport="ntlm" if not self.host.use_ssl else "ssl",
                server_cert_validation="ignore"
            )
            # Run sc query <service_name>
            r = session.run_cmd(f"sc query \"{service_name}\"")
            out = r.std_out.decode(errors="replace")
            is_running = "RUNNING" in out.upper()
            return (is_running, f"sc query: {'STATE: 4 RUNNING' if is_running else out[:100]}")
        except Exception as e:
            return (False, f"WinRM probe failed: {str(e)}")


class MockExecutor(BaseExecutor):
    """
    Realistic dry-run executor simulating network roundtrips, script stages,
    stdout/stderr logs, timeout checks, and service verification probes.
    """
    def execute(
        self,
        command: str,
        timeout: int = 300,
        env_vars: Optional[dict] = None
    ) -> Generator[str, None, int]:
        os_label = "Windows Server" if self.host.os_type == OSType.WINDOWS else "Linux / POSIX"
        proto = "WinRM (WS-Man 5985)" if self.host.os_type == OSType.WINDOWS else "SSH (Port 22)"

        yield f"[*] [DRY-RUN SIMULATION] Initializing connection to {self.host.name} ({self.host.hostname})"
        yield f"[*] Protocol: {proto} | Host OS: {os_label}"
        time.sleep(0.3)

        if self.is_aborted:
            yield "[!] EXECUTION ABORTED before script dispatch."
            raise ExecutionAbortedError("Job aborted")

        yield f"[✓] Authentication successful for user '{self.host.auth.username}'"
        yield f"[$] Spawning child process: {command}"
        time.sleep(0.4)

        # Realistic simulation steps
        steps = [
            (0.4, "[stdout] Validating target service state and file integrity..."),
            (0.5, "[stdout] Backing up existing configuration: /backup/current.cfg -> /backup/prev.bak"),
            (0.4, "[stdout] Applying requested profile configuration parameters..."),
            (0.6, "[stdout] Stopping active service daemon gracefully (SIGTERM)..."),
            (0.5, "[stdout] Waiting for socket port release and background threads to drain..."),
            (0.4, "[stdout] Port 8443 released. Loading new profile environment variables."),
            (0.6, "[stdout] Launching daemon executable with new runtime configuration..."),
            (0.4, "[stdout] Service initialized. PID 48212 assigned."),
        ]

        for delay, line in steps:
            if self.is_aborted:
                yield "[!] EXECUTION ABORTED by operator. Sent termination signal."
                raise ExecutionAbortedError("Job cancelled by operator")
            time.sleep(delay)
            yield line

        time.sleep(0.2)
        yield "[*] Remote script completed successfully with exit code 0."
        return 0

    def probe_service_status(self, service_name: str) -> Tuple[bool, str]:
        time.sleep(0.4)
        if self.host.os_type == OSType.WINDOWS:
            return (True, f"sc query '{service_name}' -> STATE: 4 RUNNING (PID: 48212)")
        else:
            return (True, f"systemctl is-active '{service_name}' -> active (running)")


def get_executor(host: HostConfig, force_dry_run: bool = False) -> BaseExecutor:
    """Factory creating appropriate executor based on host OS and dry-run flag."""
    if force_dry_run:
        return MockExecutor(host)
    if host.os_type == OSType.WINDOWS:
        return WinRMExecutor(host)
    return SSHExecutor(host)
