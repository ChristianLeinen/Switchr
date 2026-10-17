# Fail-Fast Execution Without Automated Rollback

We decided that if a transition script fails or exits with a non-zero code, the orchestrator will immediately halt execution, retain the full error log, and escalate to the operator without attempting automated rollback. Service state transitions (service stop, file overwrite, service start) are partially destructive; blind automated rollback scripts risk compounding silent corruption or worsening an outage when underlying host conditions are unknown.
