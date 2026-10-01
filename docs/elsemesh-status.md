# ElseMesh implementation status

This document tracks the agreed ElseMesh direction against the current code. It is a progress ledger, not a reduced definition of the project. Protocol IDs beginning with `tidewater.` remain in use for compatibility; ElseMesh is the project and ThruHold is an independently owned world.

## Implemented foundations

| Capability | Current evidence | Boundary |
| --- | --- | --- |
| Linux and Termux world node | `server/worldd`; `tools/build-server.sh` | Linux amd64/arm64 and Android arm64 binaries build from the external checkout. On the Flip7, both Android binaries reported the embedded source SHA; `worldd --print-node-id` generated a PeerID using disposable Termux storage. A long-running Android node with live peer/gateway traffic has not yet been exercised. Public deployment still requires operator-managed TLS, ports, and process lifetime. |
| Persistent cryptographic node identity and signed world documents | `server/worldd/identity.go`, `server/worldd/world.go` | Identity recovery and rotation tooling remain limited. |
| Node discovery and optional directory | `server/worldd`, `server/directoryd`, `src/network/WorldConnector.js` | `thruhold.org` is an optional deployment target; this repository does not operate that service or domain. |
| Browser WebTransport with WSS fallback | `server/worldd/webtransport.go`, `src/network/WorldConnector.js` | Requires a reachable HTTP/3 UDP endpoint and a browser that supports the deployed WebTransport version. |
| Signed portals and staged asset delivery | `src/network/PortalHandoff.js`, `src/network/WorldPortalView.js`, `src/network/WorldConnector.js`, `src/network/WorldStreaming.js`, `src/App.js` | Open portals render prepared destination GLB content through a 2.42 × 4.9 m aperture using a mapped camera at 256 × 512 and up to 10 updates/s; a per-fragment exit-plane clip excludes source-side geometry. Bounded objects stream when in view or nearby; consumers of the same asset share one in-flight download, canceled after its last consumer leaves. Download concurrency responds to data-saver, connection-quality, and verified transfer-rate estimates. A missing, malformed, or hash-invalid asset response now excludes that provider for the connector session, rediscovers signed providers, and retries the content-addressed asset from another authorized node. The browser validates portal/component records and cross-kind ID uniqueness. Dynamic destination systems and oblique near-plane projection remain. |
| Owner-scoped immutable neighbor caching | `server/worldd/cache.go`, `server/worldd/cache_integration_test.go`, `server/worldd/files.go` | Cache grants do not authorize edits or simulation writes. Signed package assets can be preloaded as a complete, hash-verified set; failover-only grants cannot import or serve those assets. |
| Bounded delegated authority lease | `server/worldd/world.go`, `server/worldd/main.go` | Concurrent simulation, split-brain recovery, and shared write conflict resolution are not implemented. |
| Replaceable static world package | `src/network/WorldPackage.js`, `tools/world-source-to-manifest.mjs` | Renderer currently supports static GLB triangle meshes with embedded base-color textures, box/compound/heightfield collision, and world-handoff cleanup. |
| Reproducible island source package | `worlds/island/`, `tools/export-island.mjs` | Package exports terrain, vertex-tinted static village/pier geometry, scanned driftwood/shell props, seed-7 vegetation placement records, and a signed `tidewater.island-ocean/1` renderer component for the existing island water. Grass retains the procedural terrain-mask path; `?noVeg` remains an opt-out. Village shader textures and animated details, boat, wildlife, and general dynamic systems remain un-packaged. The complete procedural island remains in the game source. |
| Blender interchange and source validation | `tools/blender/world_source.py`, `docs/world-authoring.md`, `docs/schemas/world-source.schema.json` | Blender source is unsigned; only the owner node signs a runtime manifest. |
| Hash-bound unsigned source proposals | `tools/apply-world-proposal.mjs`, `docs/schemas/world-proposal.schema.json` | Applies allowlisted ID-based edits to a copied source snapshot and validates the complete result; there is no model service, Blender worker, preview/review UI, or publication integration yet. |
| Typed Blender scene action prototype | `tools/blender/world_actions.py`, `test/blender-world-actions.py` | Hash-bound add/update/remove plans now target imported stable-ID source markers and verify content-addressed GLB imports. Python plan validation is tested; Blender scene execution remains unverified because Blender is unavailable in this environment. |

## Remaining implementation gates

### 1. Complete the island as a portable example world

- Preserve the village's material fidelity in the portable GLB, export reef content, and represent the boat and other interactive systems as versioned data-driven components without replacing or degrading the built-in procedural game path. Island vegetation placements now travel as signed-manifest-referenced, hash-verified data; other worlds still need a general vegetation placement/terrain contract.
- Generalize the example-only island ocean contract into portable water bodies that can declare sea level, bounded extent, material profile, and terrain interaction without depending on the built-in island heightfield. Weather, fish, wildlife, and boat systems still need component contracts.
- Make the exporter deterministic, verify every emitted hash, and keep all source assets and generation code in this repository.
- Load the resulting package as a hosted ThruHold and compare its authored scene against the built-in island on desktop and Android.

### 2. Stream content by actual need

- Use signed object bounds to request assets as they enter the view or nearby buffer, while keeping portal preview assets ready before a crossing.
- Adapt background work to bandwidth and refine cancellation so useful shared-asset transfers are not restarted unnecessarily.
- Keep portal preview assets available before crossing and hash-check every completed asset. Portal preparation now aborts when the player leaves its selected portal or completes a handoff; integration tests cover cancellation during manifest lookup, WebTransport readiness, and WebSocket connection setup. Browser integration tests cover concurrent missing-asset responses at the current provider, shared recovery through signed provider records to an owner-authorized cache, and final content-hash verification. Recovery against live multi-node deployments and device/network limits still need end-to-end coverage.
- Add tests for frustum entry/exit, portal approach, interrupted transfer, provider fallback, and device/network limits.

### 3. Finish portal and session continuity

- Add oblique near-plane clipping and animate data-driven destination components in the portal view.
- Transfer supported player/session state explicitly and define behavior for incompatible world rules.
- Exercise unreachable destinations, stale providers, and interrupted handoffs with a usable retry/failover path.

### 4. Define dynamic simulation authority

- Specify versioned, data-only component contracts for procedural systems; never execute arbitrary downloaded JavaScript as world authority.
- Decide which systems are deterministic client presentation and which require server simulation.
- Add conflict handling and authority recovery before allowing concurrent writes. A higher-epoch signed lease alone does not guarantee that an unreachable former owner has stopped acting.

### 5. Build the separate AI editing service

- Connect an AI assistant to the hash-bound proposal and typed Blender action formats; keep the service separate from `worldd` and never give it owner signing keys.
- Provide Blender-aware tools and a disposable, resource-limited worker with access only to an explicit task bundle.
- Show owners a structured source diff, asset hashes, validation results, and rendered preview before acceptance.
- Build an opt-in corpus from accepted tasks so AI assistance can improve from Blender-specific examples without training on private or rejected world data.

### 6. Add optional account features without changing world ownership

- If Google sign-in is added, treat it as an optional account-to-world-role mapping, not as the source of cryptographic world identity.
- Keep worlds and node identities usable without a Google account; specify consent, revocation, and recovery before adding a role API.

## Completion standard

The network is not complete merely because nodes can exchange signed manifests and immutable assets. The remaining gates above need implementation, tests at the same scope as each claim, operational documentation, and a working end-to-end deployment. Desktop and Android rendering must both be checked; changes to the portable package must not silently replace or reduce quality in the existing procedural game.
