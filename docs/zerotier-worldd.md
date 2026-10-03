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
and do not include it in command output or logs. On 2026-10-03, the locally
available token returned HTTP 403 for read-only requests to both the network
endpoint and the network-list endpoint. Central configuration could therefore
not be revalidated through that token; a 403 does not establish that the
network settings changed. Generate a working Legacy API token in Central and
replace the local file without sharing the token in chat or source control.

The last recorded flow-rule inspection found TCP destination port `42901` in
the allow list for `worldd`'s libp2p listener, while the existing final UDP
rule allowed QUIC traffic on UDP `42901`. Preserve the other existing service
rules. Because the current Central API credential is rejected, treat this as
the last known configuration, not a verified current snapshot.

If Central is using templated flow rules, add custom allowances for both TCP
and UDP destination port `42901` (or the configured `--p2p-port`). If the UDP
catch-all has been removed, do not open all UDP for ElseMesh. For the advanced
custom rules engine, do not assume connection tracking: ZeroTier documents
that custom rules are stateless. TCP replies need the documented SYN/ACK
whitelisting pattern, and UDP request/reply policy needs deliberate handling
for both directions, preferably scoped to the intended members/tags. A lone
UDP destination-port rule can allow requests while dropping replies. See the
[ZeroTier Rules Engine guide](https://docs.zerotier.com/rules/) before editing
custom rules, and verify the final policy in Central. These flow rules apply
only to traffic carried over ZeroTier; they do not open the machine's public
firewall. The browser HTTPS/WSS gateway does not need an overlay rule unless
clients are intentionally connecting to it over ZeroTier.

Public membership means anyone who knows this network ID may join; application
identity signatures and world permissions must still be enforced by ElseMesh.

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

`worldd` listens for libp2p TCP and QUIC on port `42901` by default (the port
can be changed with `--p2p-port`). Permit TCP and UDP on the chosen peer port
in the network flow rules and the host firewall. TCP carries the TCP transport;
QUIC carries UDP. If using the default, announce the assigned 6PLANE address
when starting it so peers can dial the overlay address:

```sh
worldd --announce-address /ip6/<this-host-6plane-address>/tcp/42901 \
  --announce-address /ip6/<this-host-6plane-address>/udp/42901/quic-v1
```

The daemon's TCP and QUIC listeners bind on IPv6 when an IPv6 announce address
is supplied. Use a currently assigned address for that host only. The last
recorded network policy allowed TCP 42901 explicitly and UDP through a broader
existing rule; verify that policy in Central before relying on it. ZeroTier
flow rules are enforced in the distributed network path, so verify the
required peer traffic in both directions. If either transport cannot connect,
check Central's rules and the local OS firewall for the selected port on the
ZeroTier interface.

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

## Embedded libzt transport

`worldd` has an opt-in libzt integration for systems where installing a
ZeroTier One service is inconvenient, including Android/Termux. Build libzt
for the target platform first, then build `worldd` with cgo enabled and the
libzt headers and library available. For a Linux shared-library build:

```sh
CGO_ENABLED=1 \
CGO_CFLAGS="-I/path/to/libzt/include" \
CGO_LDFLAGS="-L/path/to/libzt/lib -lzt -lstdc++" \
go build -tags zerotier -o worldd ./worldd
```

At runtime, make `libzt.so` available to the dynamic linker (for example with
`LD_LIBRARY_PATH`) and start `worldd` with the network ID:

```sh
worldd --zerotier-network 632ea2908569fc9e --data /path/to/private/worldd-data
```

The embedded node identity is persisted in the `zerotier` subdirectory of the
daemon data directory. Back up that directory with the rest of the daemon
identity data; deleting it creates a different ZeroTier node. `worldd` waits
up to 60 seconds for network membership/configuration, computes its
network-scoped 6PLANE address from its stable ZeroTier node ID, and announces
that address on TCP port 42901. TCP dials to that network's 6PLANE `/40` prefix
go through libzt; inbound connections are bridged to the ordinary libp2p TCP
listener. Other TCP addresses and QUIC/WebSocket/WebTransport/WebRTC keep their
normal paths. The address is a transport locator only; signed identity and
world authorization remain authoritative.

This path requires a libzt build for each target architecture and its native
dependencies. Android/Termux builds additionally need an Android libzt/cgo
toolchain; this repository does not yet distribute prebuilt libzt libraries.
The build also depends on the licensing terms and notices shipped with the
exact libzt version; keep those notices with distributed builds. Users who
already have ZeroTier One can use the native setup above without cgo. A browser
does not join ZeroTier: it connects through the HTTPS/WSS gateway or supported
browser peer path.

## Remaining validation

The opt-in libzt path is implemented, but still needs runtime validation
between nodes on separate NATed networks, browser gateway verification while
Central is unavailable, and a target-specific Android/Termux libzt build and
Flip7 renderer check. Do not treat a successful Linux compile as proof of
those deployment paths.
