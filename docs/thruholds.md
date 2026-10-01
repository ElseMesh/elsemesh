# ThruHolds on ElseMesh

## Goal and trust model

Each ThruHold is a world hosted by an independently operated ElseMesh node on Linux or Android/Termux. ThruHolds connect to one another through portals while remaining independently hosted and governed. Each has a stable `tw-world:` identifier, an owner identity, a signed versioned manifest, and one current authority epoch. Nodes have libp2p PeerIDs. Browser visitors connect to the selected node's HTTPS gateway; the gateway connects to world peers over libp2p. No central service is required for an already-known peer to host a ThruHold.

The daemon is a transport and content service. The world owner controls the manifest, world rules, and grants. A grant independently enables `content-cache` and/or bounded `failover-authority`; caching never grants write or authority rights. An owner-signed failover window permits a delegate to issue a temporary higher-epoch authority lease when its window opens; the daemon schedules activation even when it started before the window and stops serving the lease when it expires. Runtime conflict recovery and shared simulation authority still need implementation before this is suitable for concurrent writes.

## Connectivity and links

Node-to-node connections use libp2p TCP/QUIC, DHT discovery on the existing Tidewater-prefixed protocol namespace, optional static bootstrap peers, NAT traversal, and opt-in circuit relays. Browser clients cannot use native TCP/QUIC directly, so the node exposes a WebSocket gateway intended to sit behind HTTPS. An optional WebTransport HTTP/3 gateway can be enabled for browsers that support the pinned draft; clients prefer it on HTTPS and fall back to WSS if connection setup fails. Keep WSS available because WebTransport draft support varies by browser and deployment. Public deployment must configure TLS, reachable UDP for HTTP/3, request limits, rate limits, and a trusted bootstrap/DHT mesh.

Android restricts the netlink interface scan used by libp2p. On Termux, provide each reachable interface address with repeatable `--announce-address` values; accepted forms are `/ip4/<address>/tcp/<port>`, `/ip6/<address>/tcp/<port>`, and the corresponding `/udp/<port>/quic-v1` form. These addresses are advertised in signed node records and DHT results. A private Wi-Fi address is only reachable on that LAN; Internet access still needs a forwarded public port or a configured relay. Without an address reachable by intended peers, the daemon can run and serve the local browser gateway but other nodes may not dial it.

A browser link should identify the world and its gateway, for example `https://world-host.example/?worldId=tw-world:...&gateway=wss://world-host.example/gateway`. Invite links can also include a node PeerID/address. Unknown worlds are looked up by world ID through configured discovery; do not trust an unsigned URL as proof of ownership.

An optional `directoryd` service provides HTTPS world lookup and signed node links. It is not required for hosting, world authority, or access to a known node. Directory entries are short-lived node-signed records paired with owner-signed manifests; the service indexes only discoverable worlds whose node is the owner or has an active `content-cache` grant. Nodes publish only after every manifest asset is present and hash-verified. The browser verifies the node record and then verifies the owner-signed world manifest and provider grant. Community relays remain operator opt-in, bounded, and observable.

## Portals and streaming

A portal is a signed-manifest record containing destination world/node, an optional HTTPS/WSS gateway origin for that node, entry/exit transforms, and `openView`. The browser connects directly to that gateway when it is present, allowing different operators to serve each ThruHold; otherwise it reuses the current gateway. As the player approaches, the browser resolves the destination and downloads assets in ordered stages: `portal-preview`, then `visible`, followed by `nearby` and `background` after arrival. Assets within a stage load with bounded concurrency, and each completed file is checked against its content hash. Neighbor cache grants allow replicas to serve immutable bytes, not to change the owner's manifest.

The current connector and daemon provide signed manifest/chunk transport foundations. A browser URL with `worldId` and optional `gateway`/`nodeId` selects a ThruHold; the client verifies the manifest and asset hashes, loads static GLB instances, and replaces the procedural example scene. This first renderer supports embedded base-color textures and static triangle meshes. Authored box collision bounds are transformed with their asset instance and enabled only in the active world; mesh-derived collision is not supported. Linked-world portals now prefetch destination `portal-preview` assets first, then `visible` assets while nearby; the preview tier is displayed at an `openView` doorway by aligning the destination's signed exit transform with the local entry. The camera waits at the entry plane until usable destination assets load, then the client swaps the active world and places the camera at the signed exit transform. `nearby` and `background` assets are appended after arrival. Portal entries face local -Z, and crossing from the +Z side triggers the transfer. The preview is a set of explicitly authored static GLB objects: there is not yet portal aperture clipping, remote-camera rendering, or live destination animation, so authors should keep preview-tier assets spatially limited to what should be visible through the opening. Prefetching currently uses distance and authored asset tiers rather than view visibility. Dynamic world components, player/session simulation transfer, and full retry/failover behavior remain incomplete.

## Source, manifest, policy

Authoring source is `tidewater.world-source/1` (see [world authoring](world-authoring.md)); these existing protocol identifiers retain their original spelling for compatibility. Runtime manifests use `tidewater.world/1`, are signed by the owner identity, and contain immutable asset references, portals, rules, and host grants. The daemon rejects invalid signatures, IDs, bounds, priorities, and grants. Optional `rules.requiredFeatures` are versioned capability IDs: the daemon validates their syntax and uniqueness, and the browser rejects a world if it requires a capability the current client does not support. This prevents a client from silently treating a required simulation or rendering behavior as optional. Worlds are replaceable providers: the procedural island is the built-in example world, and a selected hosted world takes its place as active content. Island source and its reproducible runtime package belong in this Git repository; the checked-in example package currently contains its static terrain heightfield, while the full playable island continues to use its procedural JavaScript implementation. A world node can import and serve the package using the same owner-signed manifest flow as other worlds. Blender is an authoring/interchange tool, not a replacement runtime format. Dynamic procedural systems require explicit runtime component support and are not represented by static GLB assets alone.

Account login is optional and distinct from world identity. Google sign-in may later map a verified account to per-world roles, but identities and account preferences must not silently become a global lockout. Authentication, role APIs, and login UI are not implemented by the current daemon.

## Current implementation and operation

The `server/worldd` Go program persists a node identity, serves a signed local starter manifest, accepts an owner-signed manifest, exposes browser gateways and content-addressed assets, and supports optional discovery/relay configuration. The default browser gateway is WebSocket. To enable WebTransport, provide a separate HTTP/3 UDP listener and certificate/key; make the browser's HTTPS host/port route to that listener over UDP while TCP HTTPS/WSS continues to route to the web server or reverse proxy. For example, a public `:443/udp` forwarding rule can target `worldd --webtransport :5201`; the certificate must cover the public host. The client tries WebTransport at `/gateway-webtransport` on the configured HTTPS origin, then falls back to `/gateway` over WSS. `src/network/WorldConnector.js` verifies signed documents and content hashes and fetches prioritized chunks; `src/network/WorldPackage.js` builds the currently supported static GLB instances. Author a Blender source document, import its GLB assets, convert it to an unsigned runtime manifest, then sign it using the same persistent node identity:

Build Linux and Termux binaries from the repository's external build checkout with `tools/build-server.sh all`. It produces `server/bin/{worldd,directoryd}-linux-amd64`, `-linux-arm64`, and `-android-arm64`. The Android target is a native Go Android executable for 64-bit Termux; only that target uses `-checklinkname=0`, required by its Android interface-network dependency. Linux builds do not disable linker checks. For a single target, pass `linux-amd64`, `linux-arm64`, or `android-arm64`.

```sh
worldd --data ./world-data --print-node-id
worldd --data ./world-data --import-asset ./assets/boat.glb
node tools/world-source-to-manifest.mjs --source ./island.world-source.json --owner <PeerID> --assets ./world-data/assets --out ./world-data/unsigned.json
worldd --data ./world-data --sign-manifest ./world-data/unsigned.json --manifest-out ./world-data/world.signed.json
worldd --data ./world-data --manifest ./world-data/world.signed.json --webtransport :5201 --webtransport-tls-cert fullchain.pem --webtransport-tls-key privkey.pem
```

To publish a discoverable node in an optional directory such as `https://thruhold.org`, create its runtime manifest with `tools/world-source-to-manifest.mjs --discoverable true`, then sign it. Public discovery is off by default. Set the node's externally reachable browser gateway and directory URL:

```sh
worldd --data ./world-data --manifest ./world-data/world.signed.json \
  --public-gateway https://world-host.example --directory-url https://thruhold.org
directoryd --http 127.0.0.1:5202 --data ./directory-data
```

On Android/Termux, add explicit reachable libp2p addresses when interface discovery is restricted, for example `--announce-address /ip4/192.168.1.42/tcp/42901 --announce-address /ip4/192.168.1.42/udp/42901/quic-v1` for a LAN peer.

Transfer `server/bin/worldd-android-arm64` to the device, then inside Termux install it (keep identity keys and world data in Termux-private storage, not shared storage):

```sh
cp "$HOME/worldd-android-arm64" "$PREFIX/bin/worldd"
chmod 700 "$PREFIX/bin/worldd"
mkdir -p "$HOME/.local/share/elsemesh/world"
worldd --data "$HOME/.local/share/elsemesh/world" --print-node-id
```

Then start it with the signed manifest and reachable announce addresses shown above. Termux background execution and network reachability remain device/operator responsibilities; Android may suspend processes that are not kept alive by the user's service setup.

Run `directoryd` behind HTTPS and rate limiting; its default listener is loopback. The directory stores announcements for up to 24 hours, while `worldd` refreshes every 12 hours. The node must be owner-authorized, and the world manifest must set `discoverable: true`. Browser links can select this directory without relying on the page's own host: `https://rebroad.github.io/tidewater/?worldId=tw-world:...&directory=https%3A%2F%2Fthruhold.org`. This repository supplies the directory service; registering or operating the `thruhold.org` domain is a separate deployment step.

`--import-asset` prints the content hash to assign to a source object. Signing validates the runtime document and never overwrites an existing signature file. Review and edit owner grants in the unsigned manifest before signing when delegating a cache or failover role. A manifest must be signed by the owning identity before other nodes can host it; neighbor permission configuration UX is still pending.

To seed an owner-authorized neighbor cache, first get that node's PeerID with `worldd --data ./neighbor-cache --print-node-id`, add an unexpired `content-cache` grant for that PeerID to the owner manifest, sign it, and provide the signed manifest to the neighbor. Start the neighbor with `--cache-from <owner-peer-id>` and a `--bootstrap` multiaddr for that source if it is not discoverable through DHT. The cache node fetches missing assets over libp2p, verifies the complete SHA-256 before an atomic install, and only advertises a discoverable world after all its manifest assets are verified locally. A live gateway's `/api/lookup` returns the local provider plus other DHT advertisers, including authorized caches. Use `--cache-sync-interval` to adjust retry cadence. Only the owner or a node with an active `content-cache` grant can serve asset bytes; a `failover-authority` grant alone never permits content serving.

```sh
worldd --data ./neighbor-cache --manifest ./world.signed.json \
  --bootstrap /ip4/<owner-ip>/tcp/42901/p2p/<owner-peer-id> \
  --cache-from <owner-peer-id>
```

Build/test from the repo's `server` directory with Go 1.24.6 or newer. Build `worldd` with `go build -o worldd ./worldd` and the optional directory with `go build -o directoryd ./directoryd`. For Android arm64/Termux, build each with `GOOS=android GOARCH=arm64 go build -ldflags=-checklinkname=0 -o <binary> ./<worldd-or-directoryd>`. The linker flag is required by the current libp2p Android network-interface dependency (`wlynxg/anet`), which uses Go linkname to work around Android netlink restrictions; keep it scoped to Android builds. For public browsers, serve the web app, directory and gateway through HTTPS/WSS. The daemons' default HTTP binds are loopback. Bootstrap peers must speak the legacy Tidewater DHT protocol prefix; generic public IPFS bootstrap peers are not compatible.

See `server/worldd` and `server/directoryd` for the current code. These are evolving prototypes. The repository does not deploy a public directory, provide Google authentication, implement the full owner policy engine, render portal previews as a clipped live destination view, or provide robust multi-writer simulation.
