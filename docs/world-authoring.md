# ElseMesh ThruHold authoring and AI editor direction

## Product direction

ThruHolds are authored in Blender and through a separate AI editor service. ElseMesh will not ship an in-game world editor in this direction. Blender is the visual authoring tool; the existing `tidewater.world-source/1` JSON identifier is retained for compatibility; the AI service will propose edits to that document and its referenced assets.

A Blender project is a working scene, not the canonical network publication. Keep the editable source, export recipe, and reproducible packaged world assets under version control. The procedural island follows the same rule: it is a built-in example world whose source and exported package live in this repository, rather than a permanent scene layer. A selected hosted world replaces the currently active world content. Server runtime manifests are separately validated and owner-signed; never treat an AI proposal or `.blend` file as an authorization to publish.

## Replaceable world content and packaging

The game runtime should select a world provider by world ID. The procedural island is the default/demo provider; a packaged or remotely hosted world is another provider and occupies the same world-content slot. Shared engine services (renderer, camera, input, audio, and world-transition code) are not island content. Loading a different world must unload the island content instead of drawing it behind or around the selected world.

World content has three related forms, with distinct jobs:

1. **Editable source in Git:** generator code and parameters for procedural content, plus Blender `.blend` files and `tidewater.world-source/1` documents where applicable. This is the human-readable, reviewable source of truth.
2. **Built runtime package in Git:** deterministic export output for the example island, including its runtime manifest and content-addressed asset files. Committing the package makes the exact demo world available to reproduce and lets a node seed its content store without rebuilding from source.
3. **Served content in a node store:** the same immutable package assets copied or imported into `worldd` storage and referenced by an owner-signed runtime manifest. Nodes serve those bytes to clients and permitted neighbor caches. The repository is not itself the live content server.

The initial terrain export now turns `TerrainData` into a deterministic, vertex-colored GLB and a `tidewater.world-source/1` document under [`worlds/island`](../worlds/island/README.md). It uses the same validation, hashing, manifest conversion, and signing pipeline as Blender-authored worlds. This first package contains the static terrain heightfield only; it does not replace the playable procedural island or export the village, vegetation, water, boat, wildlife, or gameplay. Extend the package as separate, stable-ID assets or versioned runtime components so source changes remain reviewable. Large binary assets may be stored with Git LFS if repository size warrants it, while their hashes and package index remain versioned in Git. A world node can import the checked-in package into its local content store and sign/publish it with that node's world identity; private signing keys must never be committed.

The initial runtime package should support static meshes, materials/textures, transforms, collision intent, world rules, and portal records. Dynamic island systems (for example water, weather, wildlife, fishing simulation, and boat behavior) need explicit runtime component definitions or a documented ElseMesh extension; they cannot be assumed to survive a static mesh export. The procedural island remains fully playable as the example ThruHold until equivalent runtime behavior is represented in the package format.

## Shared source format

The normative JSON Schema is [`schemas/world-source.schema.json`](schemas/world-source.schema.json). The browser-side structural checks are in `src/network/WorldSource.js`; Blender import/export is provided by [`../tools/blender/world_source.py`](../tools/blender/world_source.py).

The format uses right-handed, Y-up coordinates in meters. It records stable IDs, asset hashes, transforms, collision intent, world rules, style guidance, and portal endpoints. `rules.gravity` is a multiplier applied to player movement acceleration (1 preserves the built-in 9.81 m/s²); the browser switches it when entering a linked world. Only `default` and `tidewater-default` physics profiles are accepted; they currently use the same movement model. `avatarComplexity` is validated and transported but does not yet enforce a runtime avatar budget. `rules.requiredFeatures` is an optional, unique list of versioned `tidewater.<feature>/N` capability IDs; the daemon validates the syntax and the browser refuses worlds that require features it does not implement. Currently recognized browser requirements are `tidewater.static-glb/1`, `tidewater.portal-handoff/1`, and `tidewater.portal-preview-static/1`. Add a capability to that list only after its runtime behavior is implemented and verified. Objects refer to content by SHA-256 ID; don't rely on a machine-specific filesystem path. Assign each asset a streaming priority: `portal-preview` for content needed to preview a connected world, `visible` for the first usable scene, `nearby` for close supporting content, or `background` for the remaining world. The browser loads these tiers in order, with bounded concurrency within each tier. Portals identify the destination ThruHold, libp2p node, optional secure browser gateway origin, local entry and destination exit transforms, and whether the opening should show a remote preview. Without an explicit destination gateway, the browser reuses the current gateway.

Example exchange:

```sh
blender --background island.blend --python tools/blender/world_source.py -- import worlds/island.world-source.json
blender --background island.blend --python tools/blender/world_source.py -- export worlds/island.world-source.json
```

The helper creates editable metadata empties in a dedicated collection and keeps the full JSON in a Blender text block. Mesh assets remain normal Blender objects/files and should be exported to GLB/glTF and content-addressed separately. Review source diffs after export; Blender saves are not automatically trusted or published.

Static asset instances may declare an enabled box collision in local asset coordinates: `center` and positive `halfExtents` vectors, plus explicit `walkable` and `solid` flags. Terrain may instead declare a `heightfield` with `columns`, `rows`, `walkable: true`, and `solid: true`; its GLB must contain exactly one mesh whose regular XZ-grid vertex count equals `columns * rows`. The browser extracts that mesh's vertex heights and applies the asset instance scale, yaw, and position when the active world is entered. Keep collision geometry intentional and review it in Blender; arbitrary visual triangle meshes are never treated as implicit collision geometry.

Owner-authorized serving permissions live in the source document's optional `hosts` list, so Blender and AI source edits retain the policy that will be signed. Each grant names a node PeerID, a unique subset of `content-cache` and `failover-authority` scopes, an expiry Unix timestamp, and a positive grant epoch. Failover grants also require an activation timestamp and a duration of 1–3600 seconds fully inside the grant expiry. The converter copies grants into the runtime manifest; only the owner node signs that manifest. Keep grants scoped to known neighbors and remove/re-issue them when permissions change.

To produce a runtime document, import each GLB into the node's content store with `worldd --import-asset`, set the resulting ID on the matching source object, then run `tools/world-source-to-manifest.mjs`. The converter carries the versioned source document's `updatedAt` and owner host grants into the runtime manifest so the same source and assets produce byte-stable unsigned manifest content. Worlds are private by default; pass `--discoverable true` only when publishing to public discovery. Blender export preserves `updatedAt` when metadata is unchanged; when it changes metadata, set `SOURCE_DATE_EPOCH` for reproducible timestamps. Finally, use `worldd --sign-manifest` with the world's persistent owner identity. Runtime signing keys stay on the owner node; the AI service must only return unsigned proposals.

## AI editor service

The service is a planned, separate authoring product, not part of the world daemon's authority path. Its first implementation should be a tool-using assistant rather than model fine-tuning: provide a bounded Blender workspace and explicit operations through `bpy`, alongside schema-aware JSON edits. This yields inspectable actions and avoids training a model to emit opaque scene files.

A task starts from a versioned world-source snapshot, referenced asset catalog, style guide, coordinate conventions, and relevant neighborhood/portal context. The agent produces a patch (stable IDs plus add/update/remove operations), Blender Python actions for mesh work when needed, and a short rationale. The service applies changes in an isolated working copy, exports candidate GLB assets, computes hashes, validates the source and asset limits, then renders preview images and a structured diff. The owner reviews and accepts or rejects the proposal. Only accepted content is converted into a new owner-signed world manifest and published.

Required safety and quality boundaries:

- Run generated Blender scripts in a disposable, resource-limited worker with no ambient network or host filesystem access. Expose only the task files and a small documented helper API.
- Validate JSON against the schema and project rules; validate GLB size, hashes, triangle budgets, transforms, collision declarations, and portal destinations before preview.
- Keep every operation attributable to a task and model; store the source revision, tool calls, generated files, validation output, preview, and reviewer decision.
- Never give the assistant node identity keys, owner signing keys, deployment credentials, or direct write access to a live world.
- Require human review for world publication and for edits that alter rules, portals, ownership, or neighbor permissions.
- Make retries deterministic from a pinned source revision, prompt/context bundle, model identifier, and tool version. Use an explicit patch format so a failed task can be discarded without corrupting the source.

## Training and evaluation path

Initially, "teach the AI Blender" means give it good Blender-specific tools, examples, and feedback—not train a foundation model from scratch. Build a curated task set from accepted changes: object placement, transform correction, simple prop creation, portal placement, style matching, and repair of invalid source documents. Each example should pair the request and source snapshot with the accepted patch, Blender operations, preview, and validation results. Exclude rejected/private world data unless its owner opts in.

Evaluate on held-out worlds and measure schema validity, correct IDs/links, rule compliance, visual review scores, performance budgets, and how often owners accept with no edits. Fine-tuning can be considered later if these evaluations show repeatable tool-use failures that prompting and tools cannot address. Preserve provenance and owner consent for any training data.

## Implementation boundary

The current repository contains the source-format helper, Blender interchange script, ElseMesh node/client foundation, a deterministic terrain-only island package, and a browser loader for static GLB instances in a signed hosted ThruHold. That loader can replace the procedural example scene, stream authored priority tiers, register authored box and heightfield collision, show explicitly authored static preview-tier objects at an open portal, and hand off the player through configured portals. Hosted static worlds use the grounded first-person controller and their active-world colliders. The portal preview aligns the destination exit to the source entry, but has no aperture clipping or remote-camera rendering. Dynamic world components are not loaded yet. Streaming uses authored tiers and portal distance, not per-object visibility. Extending the island package to remaining content, the AI editor service, isolated Blender worker, preview/review UI, GLB candidate pipeline, and complete manifest publishing workflow remain future implementation work. This document describes intended boundaries; it does not claim those services are running.

## Proposed service contract

The initial service boundary should stay separate from `worldd` so world hosting remains decentralized and owners can run without an AI account. A task API can use these operations:

- `POST /v1/edit-tasks` with `{worldId, baseRevision, request, allowedOperations, assetIds}` creates an isolated proposal task.
- `GET /v1/edit-tasks/{taskId}` returns queued/running/ready/failed state, validation findings, previews, and a patch reference.
- `POST /v1/edit-tasks/{taskId}/review` records owner accept/reject and optional comments. Acceptance creates a candidate revision; it does not itself publish or sign it.
- `GET /v1/edit-tasks/{taskId}/patch` downloads a patch bound to the exact base revision. Applying it to a changed source must fail and require a rebase/review.

The worker should receive a capability-limited task bundle, not arbitrary world-server credentials. Its Blender adapter should expose named operations (create/edit mesh, place asset instance, position portal marker, export candidate GLB, render preview) and a bounded `bpy` subset; direct Python execution can be an early prototype only inside a disposable sandbox. Store audit events and artifact hashes, and delete private task bundles according to owner-configured retention.

The service should be optional and deployable by a world owner or community operator. A hosted service must not become a mandatory discovery service, acquire world signing keys, or silently reuse authored worlds as training data. Keep a local CLI/worker path so authors can run the same validators without trusting a hosted AI service.
