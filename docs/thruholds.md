# ThruHolds on ElseMesh

## Goal and trust model

Each ThruHold is a world hosted by an independently operated ElseMesh node on Linux or Android/Termux. ThruHolds connect to one another through portals while remaining independently hosted and governed. Each has a stable `tw-world:` identifier, an owner identity, a signed versioned manifest, and one current authority epoch. Nodes have libp2p PeerIDs. Browser visitors connect to the selected node's HTTPS gateway; the gateway connects to world peers over libp2p. No central service is required for an already-known peer to host a ThruHold.

The daemon is a transport and content service. The world owner controls the manifest, world rules, and grants. A grant independently enables `content-cache` and/or bounded `failover-authority`; caching never grants write or authority rights. An owner-signed failover window permits a delegate to issue a temporary higher-epoch authority lease when its window opens. Runtime conflict recovery and shared simulation authority still need implementation before this is suitable for concurrent writes.

## Connectivity and links

Node-to-node connections use libp2p TCP/QUIC, DHT discovery on the existing Tidewater-prefixed protocol namespace, optional static bootstrap peers, NAT traversal, and opt-in circuit relays. Browser clients cannot use native TCP/QUIC directly, so the node exposes a WebSocket gateway intended to sit behind HTTPS. An optional WebTransport HTTP/3 gateway can be enabled for browsers that support the pinned draft; clients prefer it on HTTPS and fall back to WSS if connection setup fails. Keep WSS available because WebTransport draft support varies by browser and deployment. Public deployment must configure TLS, reachable UDP for HTTP/3, request limits, rate limits, and a trusted bootstrap/DHT mesh.

A browser link should identify the world and its gateway, for example `https://world-host.example/?worldId=tw-world:...&gateway=wss://world-host.example/gateway`. Invite links can also include a node PeerID/address. Unknown worlds are looked up by world ID through configured discovery; do not trust an unsigned URL as proof of ownership.

An optional ElseMesh directory can provide bootstrap discovery and human-friendly links. It is not required for hosting, world authority, or access to a known node. Community relays are optional and should be operator opt-in, bounded, and observable.

## Portals and streaming

A portal is a signed-manifest record containing destination world/node, entry/exit transforms, and `openView`. As the player approaches, the browser resolves the destination and downloads assets in ordered stages: `portal-preview`, then `visible`, followed by `nearby` and `background` after arrival. Assets within a stage load with bounded concurrency, and each completed file is checked against its content hash. Neighbor cache grants allow replicas to serve immutable bytes, not to change the owner's manifest.

The current connector and daemon provide signed manifest/chunk transport foundations. A browser URL with `worldId` and optional `gateway`/`nodeId` selects a ThruHold; the client verifies the manifest and asset hashes, loads static GLB instances, and replaces the procedural example scene. This first renderer supports embedded base-color textures and static triangle meshes. Linked-world portals now prefetch destination `portal-preview` and `visible` tiers while nearby, hold the camera at the entry plane until those assets load, then swap the active world and place the camera at the signed exit transform. `nearby` and `background` assets are appended after arrival. Portal entries face local -Z, and crossing from the +Z side triggers the transfer. The `openView` preview is not rendered yet, and prefetching currently uses distance and authored asset tiers rather than visibility. GLB collision, dynamic world components, player/session simulation transfer, and full retry/failover behavior remain incomplete.

## Source, manifest, policy

Authoring source is `tidewater.world-source/1` (see [world authoring](world-authoring.md)); these existing protocol identifiers retain their original spelling for compatibility. Runtime manifests use `tidewater.world/1`, are signed by the owner identity, and contain immutable asset references, portals, rules, and host grants. The daemon rejects invalid signatures, IDs, bounds, priorities, and grants. Worlds are replaceable providers: the procedural island is the built-in example world, and a selected hosted world takes its place as active content. Island source and its reproducible runtime package belong in this Git repository; the package is imported into a node's content store for serving. Blender is an authoring/interchange tool, not a replacement runtime format. Dynamic procedural systems require explicit runtime component support and are not represented by static GLB assets alone.

Account login is optional and distinct from world identity. Google sign-in may later map a verified account to per-world roles, but identities and account preferences must not silently become a global lockout. Authentication, role APIs, and login UI are not implemented by the current daemon.

## Current implementation and operation

The `server/worldd` Go program persists a node identity, serves a signed local starter manifest, accepts an owner-signed manifest, exposes browser gateways and content-addressed assets, and supports optional discovery/relay configuration. The default browser gateway is WebSocket. To enable WebTransport, provide a separate HTTP/3 UDP listener and certificate/key; make the browser's HTTPS host/port route to that listener over UDP while TCP HTTPS/WSS continues to route to the web server or reverse proxy. For example, a public `:443/udp` forwarding rule can target `worldd --webtransport :5201`; the certificate must cover the public host. The client tries WebTransport at `/gateway-webtransport` on the configured HTTPS origin, then falls back to `/gateway` over WSS. `src/network/WorldConnector.js` verifies signed documents and content hashes and fetches prioritized chunks; `src/network/WorldPackage.js` builds the currently supported static GLB instances. Author a Blender source document, import its GLB assets, convert it to an unsigned runtime manifest, then sign it using the same persistent node identity:

```sh
worldd --data ./world-data --print-node-id
worldd --data ./world-data --import-asset ./assets/boat.glb
node tools/world-source-to-manifest.mjs --source ./island.world-source.json --owner <PeerID> --assets ./world-data/assets --out ./world-data/unsigned.json
worldd --data ./world-data --sign-manifest ./world-data/unsigned.json --manifest-out ./world-data/world.signed.json
worldd --data ./world-data --manifest ./world-data/world.signed.json --webtransport :5201 --webtransport-tls-cert fullchain.pem --webtransport-tls-key privkey.pem
```

`--import-asset` prints the content hash to assign to a source object. Signing validates the runtime document and never overwrites an existing signature file. Review and edit owner grants in the unsigned manifest before signing when delegating a cache or failover role. A manifest must be signed by the owning identity before other nodes can host it; neighbor permission configuration UX is still pending.

Build/test from the repo's `server` directory with Go 1.24.6 or newer. For Linux use `go build -o worldd ./worldd`; for Android arm64/Termux use `GOOS=android GOARCH=arm64 go build -ldflags=-checklinkname=0 -o worldd ./worldd`. The linker flag is required by the current libp2p Android network-interface dependency (`wlynxg/anet`), which uses Go linkname to work around Android netlink restrictions; keep it scoped to the Android build. For public browsers, serve the web app and gateway through HTTPS/WSS. The daemon's default HTTP bind is loopback. Bootstrap peers must speak the legacy Tidewater DHT protocol prefix; generic public IPFS bootstrap peers are not compatible.

See `server/worldd` for the current code. This is an evolving prototype. It does not yet provide a production bootstrap directory, Google authentication, full owner policy engine, live cross-world rendering/handoff, or robust multi-writer simulation.
