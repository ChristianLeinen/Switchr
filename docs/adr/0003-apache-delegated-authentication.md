# Delegated Authentication via Apache

We decided to delegate user authentication and access control to the Apache HTTP Server (e.g. via LDAP / Active Directory modules or intranet network perimeter controls) rather than building custom user tables and session management into the application. This keeps the backend orchestrator stateless, reduces maintenance, and avoids duplicating enterprise identity management.
