# Service Configuration Orchestrator

A centralized web application that orchestrates configuration changes and service restarts across remote Windows and Unix servers.

## Language

**Target Host**:
A remote Windows or Unix machine that hosts one or more managed services.
_Avoid_: Node, box, client, server

**Managed Service**:
A background daemon or Windows service whose runtime configuration is managed by this system.
_Avoid_: App, process, daemon

**Configuration Profile**:
A predefined, named set of configuration files representing a distinct operational mode for a managed service.
_Avoid_: Environment, preset, flavour

**Transition Script**:
An existing batch file (`.bat`) or shell script (`.sh`) residing on a target host that executes the shutdown, file copy, and startup steps.
_Avoid_: Command, runbook, task

**Switch Job**:
A single orchestrated execution run that invokes the transition scripts on a target host to apply a selected configuration profile.
_Avoid_: Deployment, change, operation

**Operator**:
A human user who triggers, monitors, and verifies switch jobs through the web interface without holding direct server credentials.
_Avoid_: Admin, user, engineer

**Executor**:
The subsystem responsible for establishing remote communication with a target host and running transition scripts over its native channel.
_Avoid_: Runner, agent, driver

**Execution Lock**:
An exclusive in-memory concurrency guard preventing overlapping switch jobs from running against the same managed service simultaneously.
_Avoid_: Mutex, semaphore, barrier

**Verification Probe**:
A non-destructive status query executed immediately after a transition script to confirm the managed service has achieved a healthy running state.
_Avoid_: Healthcheck, test, validation

**Audit Log**:
An immutable, persistent record of a completed or aborted switch job, capturing operator identity, timestamp, exit code, and stdout/stderr streams.
_Avoid_: Event, history, journal
