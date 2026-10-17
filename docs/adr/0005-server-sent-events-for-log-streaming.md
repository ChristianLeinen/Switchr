# Server-Sent Events (SSE) for Log Streaming

We decided to use Server-Sent Events (SSE) over standard HTTP rather than WebSockets to stream transition script console output (`stdout`/`stderr`) to the web frontend. Because Apache HTTP Server functions as the front-door reverse proxy, SSE works reliably out of the box through standard `mod_proxy_http` without requiring WebSocket tunnel negotiation (`mod_proxy_wstunnel`), simplifies connection lifetime handling, and includes automatic browser reconnection.
