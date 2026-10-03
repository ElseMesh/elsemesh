# ZeroTier test LAN for ElseMesh

## Network status

The current public test LAN is ZeroTier network `632ea2908569fc9e`, named
`xellent` in ZeroTier Central. It is public, has 6PLANE enabled, and its managed
LAN route is `10.205.192.0/24`. Each member also receives its own network-scoped
6PLANE IPv6 address. Use the address reported for that member by Central or the
local ZeroTier client; do not derive peer addresses from the node ID yourself.

The Legacy Central API token at `~/.config/zerotier/central-api-token` is an
administration credential, not a runtime setting. Keep it owner-readable only
(mode `0600`), do not copy it into a repository or world/client configuration,
and do not include it in command output or logs. A successful read-only API
request to this network returned HTTP 200 on 2026-10-03.

The network's existing flow rules were preserved. TCP port `42901` was added to
the existing TCP destination-port allow list for `worldd`'s libp2p listener.
QUIC uses UDP port `42901`; the existing final UDP policy already permits that
traffic. The policy still contains the pre-existing rules for other services
and ports. Public membership means anyone who knows this network ID may join;
application identity signatures and world permissions must still be enforced
by ElseMesh.

## Joining a Linux host

Install and start ZeroTier One using the package for the host, then join the
public test LAN:

```sh
sudo zerotier-cli join 632ea2908569fc9e
sudo zerotier-cli listnetworks
```

Because the network is public, a new member does not need manual authorization.
Confirm the network is `OK` and note the 6PLANE IPv6 address assigned to this
host. Do not use a physical/public IP in place of the 6PLANE address for this
path.

`worldd` uses TCP and QUIC on port `42901`. Announce the assigned 6PLANE address
when starting it so peers can dial the overlay address:

```sh
worldd --announce-address /ip6/<this-host-6plane-address>/tcp/42901 \
  --announce-address /ip6/<this-host-6plane-address>/udp/42901/quic-v1
```

The daemon's TCP and QUIC listeners bind on IPv6 when an IPv6 announce address
is supplied. Use a currently assigned address for that host only. The public
network Flow Rules allow TCP 42901; UDP is covered by the existing rules. If
either transport cannot connect, first verify the local OS firewall permits
the port on the ZeroTier interface.

## Browser access and decentralized world access

Ordinary browsers do not join the ZeroTier LAN. Publish the daemon's HTTPS/WSS
gateway and configure the hosted client to use that gateway. Direct WebRTC may
be used where the client and host can establish a peer path; the public gateway
or an available libp2p relay remains the fallback. Do not expose the Central API
token to a browser.

Portal links identify worlds and peers using signed ElseMesh identity. A ZeroTier
address is a transport locator, not proof of ownership or permission. Central
may be unavailable after setup: world identity, portal resolution, and access
authorization must continue to work without a Central API request.

## Current limitations and next work

The repository currently has a Go/libp2p daemon with TCP/QUIC, WebSocket and
WebTransport gateways, node records, portal routing, and relay support. Native
`libzt` integration and automatic discovery/announcement of the local 6PLANE
address are not yet implemented. The Linux command above uses a separately
installed ZeroTier One interface; Android/Termux must use the planned `libzt`
integration where Android does not expose a usable ZeroTier interface to the
daemon. The LAN settings and open port are prepared, but cross-NAT portal
traversal is not validated until independently connected nodes exchange traffic.

The follow-up implementation must cover:

- `libzt` integration and persistent node identity for Linux and Android/Termux.
- Automatic detection and advertisement of the correct network-scoped 6PLANE
  address, with observed `findip` results used only as a fallback.
- Direct peer connections, NAT traversal, relay fallback, and multi-node tests
  from separate internet connections.
- Browser gateway and WebRTC access without a ZeroTier client, plus user-facing
  daemon setup, invite, troubleshooting, and browser-hosting limitations.
- A runtime test proving worlds and portals continue to work while Central API
  access is unavailable.
