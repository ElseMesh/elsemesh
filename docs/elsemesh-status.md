# ElseMesh implementation status

This document tracks the agreed ElseMesh direction against the current code. It is a progress ledger, not a reduced definition of the project. Protocol IDs beginning with `tidewater.` remain in use for compatibility; ElseMesh is the project and ThruHold is an independently owned world.

## Implemented foundations

| Capability | Current evidence | Boundary |
| --- | --- | --- |
| Linux and Termux world node | `server/worldd`; `tools/build-server.sh` | Public deployment still requires operator-managed TLS, ports, and process lifetime. |
| Persistent cryptographic node identity and signed world documents | `server/worldd/identity.go`, `server/worldd/world.go` | Identity recovery and rotation tooling remain limited. |
| Node discovery and optional directory | `server/worldd`, `server/directoryd`, `src/network/WorldConnector.js` | `thruhold.org` is an optional deployment target; this repository does not operate that service or domain. |
| Browser WebTransport with WSS fallback | `server/worldd/webtransport.go`, `src/network/WorldConnector.js` | Requires a reachable HTTP/3 UDP endpoint and a browser that supports the deployed WebTransport version. |
| Signed portals and staged asset delivery | `src/network/PortalHandoff.js`, `src/network/WorldConnector.js`, `src/network/WorldStreaming.js`, `src/App.js` | Bounded objects stream when in view or nearby; portal preview still uses authored tiers and distance. Bandwidth adaptation and cancellation after view changes remain. |
| Owner-scoped immutable neighbor caching | `server/worldd/cache.go`, `server/worldd/cache_integration_test.go` | Cache grants do not authorize edits or simulation writes. |
| Bounded delegated authority lease | `server/worldd/world.go`, `server/worldd/main.go` | Concurrent simulation, split-brain recovery, and shared write conflict resolution are not implemented. |
| Replaceable static world package | `src/network/WorldPackage.js`, `tools/world-source-to-manifest.mjs` | Renderer currently supports static GLB triangle meshes with embedded base-color textures and authored collision. |
| Reproducible island source package | `worlds/island/`, `tools/export-island.mjs` | Package currently exports the terrain heightfield and scanned driftwood/shell props; it does not yet package the village, vegetation, water, boat, wildlife, or other dynamic systems. The complete procedural island remains in the game source. |
| Blender interchange and source validation | `tools/blender/world_source.py`, `docs/world-authoring.md`, `docs/schemas/world-source.schema.json` | Blender source is unsigned; only the owner node signs a runtime manifest. |

## Remaining implementation gates

### 1. Complete the island as a portable example world

- Export and content-address the remaining static village, pier, vegetation, reef, and boat content without replacing or degrading the built-in procedural game path.
- Define which parts stay data-driven runtime components, such as water, weather, fish, and wildlife, instead of flattening them into static meshes.
- Make the exporter deterministic, verify every emitted hash, and keep all source assets and generation code in this repository.
- Load the resulting package as a hosted ThruHold and compare its authored scene against the built-in island on desktop and Android.

### 2. Stream content by actual need

- Use signed object bounds to request assets as they enter the view or nearby buffer, while keeping portal preview assets ready before a crossing.
- Adapt background work to bandwidth and cancel or deprioritize requests after the player turns away or changes worlds.
- Keep portal preview assets available before crossing, hash-check every completed asset, and cancel or deprioritize requests after the player turns away or changes worlds.
- Add tests for frustum entry/exit, portal approach, interrupted transfer, provider fallback, and device/network limits.

### 3. Finish portal and session continuity

- Add portal aperture clipping and a live destination camera/render path; static preview placement is only the current first stage.
- Transfer supported player/session state explicitly and define behavior for incompatible world rules.
- Exercise unreachable destinations, stale providers, and interrupted handoffs with a usable retry/failover path.

### 4. Define dynamic simulation authority

- Specify versioned, data-only component contracts for procedural systems; never execute arbitrary downloaded JavaScript as world authority.
- Decide which systems are deterministic client presentation and which require server simulation.
- Add conflict handling and authority recovery before allowing concurrent writes. A higher-epoch signed lease alone does not guarantee that an unreachable former owner has stopped acting.

### 5. Build the separate AI editing service

- Keep the service separate from `worldd`; it produces reviewable unsigned source patches and candidate assets, never owner signatures.
- Provide Blender-aware tools and a disposable, resource-limited worker with access only to an explicit task bundle.
- Show owners a structured source diff, asset hashes, validation results, and rendered preview before acceptance.
- Build an opt-in corpus from accepted tasks so AI assistance can improve from Blender-specific examples without training on private or rejected world data.

### 6. Add optional account features without changing world ownership

- If Google sign-in is added, treat it as an optional account-to-world-role mapping, not as the source of cryptographic world identity.
- Keep worlds and node identities usable without a Google account; specify consent, revocation, and recovery before adding a role API.

## Completion standard

The network is not complete merely because nodes can exchange signed manifests and immutable assets. The remaining gates above need implementation, tests at the same scope as each claim, operational documentation, and a working end-to-end deployment. Desktop and Android rendering must both be checked; changes to the portable package must not silently replace or reduce quality in the existing procedural game.
