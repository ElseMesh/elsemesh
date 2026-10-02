# Online room deployment examples

These are templates. Replace `game.example.com` with your own HTTPS hostname
before installing them. They do not configure or update any running service.

Build the project with `npm ci` and `npm run build`. The room server serves only
`dist/`; keep private voice configuration, credentials and source files outside
that static directory. Copy `online.env.example` to
`~/.config/elsemesh/online.env`, set `ELSEMESH_PUBLIC_ORIGIN` to the exact public
HTTPS origin without a trailing slash, and install the user service only after
setting its working directory to the project directory.

The Node listener binds to loopback. Terminate TLS with a same-machine reverse
proxy which preserves the Host header and supports WebSocket upgrades. The
Apache examples use port 5200 and require the corresponding proxy, WebSocket,
SSL, headers and rewrite modules. Obtain a valid certificate before enabling
the HTTPS virtual host. Run the web server's configuration check before reloads.

The optional certificate renewal script must be edited to match the certificate
lineage and installed through the certificate manager's renewal-hook mechanism.
It reloads Apache only after a successful configuration check.

Create fresh invitations after an upgrade from the legacy room protocol.
Guest invitations allow anyone holding them to join; host links grant host
authority and must remain private. Room keys travel in URL fragments and the
first WebSocket message rather than HTTP query strings.

This is an experimental room server. Its bounds and regression tests do not
establish protection against all abuse, nor do they make client-reported
movement and proximity cheat-proof.
