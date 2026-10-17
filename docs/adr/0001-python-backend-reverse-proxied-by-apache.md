# Python Backend Reverse-Proxied by Apache

Status: superseded by ADR-0006

To support custom web frontend workflows designed in AI Studio while operating within a Windows Apache HTTP Server environment, we chose a lightweight Python (FastAPI/Flask) backend reverse-proxied by Apache (`mod_proxy`). Apache handles public HTTP/HTTPS termination, static asset delivery, and network routing, while the Python service provides robust cross-platform remoting libraries (`paramiko` and `pywinrm`) that are otherwise fragile or unavailable in native Apache modules or PHP on Windows.
