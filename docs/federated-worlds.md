# Federated Tidewater worlds

## Goal and trust model

Each world is hosted by an independently operated Go daemon on Linux or Android/Termux. A world has a stable `tw-world:` identifier, an owner identity, a signed versioned manifest, and one current authority epoch. Nodes have libp2p PeerIDs. Browser visitors connect to the selected node's HTTPS gateway; the gateway connects to world peers over libp2p. No central service is required for an already-known peer to host its world.

The daemon is a transport and content service. The world owner controls the manifest, world rules, and grants. A grant independently enables `content-cache` and/or bounded `failover-authority`; caching never grants write or authority rights. An owner-signed failover window permits a delegate to issue a temporary higher-epoch authority lease when its window opens. Runtime conflict recovery and shared simulation authority still need implementation before this is suitable for concurrent writes.

## Connectivity and links

Node-to-node connections use libp2p TCP/QUIC, DHT discovery on Tidewater's protocol namespace, optional static bootstrap peers, NAT traversal, and opt-in circuit relays. Browser clients cannot use native TCP/QUIC directly, so the node exposes a WebSocket gateway intended to sit behind HTTPS. WebTransport may be added where browser support permits; WebSocket remains the compatibility transport. Public deployment must configure TLS, request limits, rate limits, and a trusted bootstrap/DHT mesh.

A browser link should identify the world and its gateway, for example `https://world-host.example/?worldId=tw-world:...&gateway=wss://world-host.example/gateway`. Invite links can also include a node PeerID/address. Unknown worlds are looked up by world ID through configured discovery; do not trust an unsigned URL as proof of ownership.

`thruhold.org` can optionally provide a public bootstrap directory and human-friendly links. It is not required for hosting, world authority, or access to a known node. Community relays are optional and should be operator opt-in, bounded, and observable.

## Portals and streaming

A portal is a signed-manifest record containing destination world/node, entry/exit transforms, and `openView`. The intended visitor flow is to resolve the destination and prefetch its manifest and portal-preview assets before crossing. Asset transfer is content-addressed and ordered `portal-preview`, `visible`, `nearby`, then `background`; hashes are checked before use. Neighbor cache grants allow replicas to serve immutable bytes, not to change the owner's manifest.

The current connector and daemon provide manifest/chunk transport foundations. Rendering another world through an open doorway, seamless coordinate handoff, player/session transfer, and full retry/failover behavior are not yet implemented.

## Source, manifest, policy

Authoring source is `tidewater.world-source/1` (see [world authoring](world-authoring.md)). Runtime manifests use `tidewater.world/1`, are signed by the owner identity, and contain immutable asset references, portals, rules, and host grants. The daemon rejects invalid signatures, IDs, bounds, priorities, and grants. The local procedural JS world and GLB/glTF asset workflow remain supported; Blender is an authoring/interchange tool, not a replacement runtime format.

Account login is optional and distinct from world identity. Google sign-in may later map a verified account to per-world roles, but identities and account preferences must not silently become a global lockout. Authentication, role APIs, and login UI are not implemented by the current daemon.

## Current implementation and operation

The `server/worldd` Go program persists a node identity, serves a signed local starter manifest, accepts an owner-signed manifest, exposes a browser gateway and content-addressed asset endpoint, and supports optional discovery/relay configuration. `src/network/WorldConnector.js` verifies signed documents and content hashes and fetches prioritized chunks. A manifest must be created and signed by the owning identity before other nodes can host it; neighbor permission configuration UX is still pending.

Build/test from the repo's `server` directory with Go 1.24.6 or newer. For Linux use `go build -o worldd ./worldd`; for Android arm64/Termux use `GOOS=android GOARCH=arm64 go build -ldflags=-checklinkname=0 -o worldd ./worldd`. The linker flag is required by the current libp2p Android network-interface dependency (`wlynxg/anet`), which uses Go linkname to work around Android netlink restrictions; keep it scoped to the Android build. For public browsers, serve the web app and gateway through HTTPS/WSS. The daemon's default HTTP bind is loopback. Bootstrap peers must speak the Tidewater DHT protocol prefix; generic public IPFS bootstrap peers are not compatible.

See `server/worldd` for the current code. This is an evolving prototype. It does not yet provide a production bootstrap directory, Google authentication, full owner policy engine, live cross-world rendering/handoff, robust multi-writer simulation, or a deployed service at thruhold.org.
