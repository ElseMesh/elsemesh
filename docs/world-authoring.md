# Tidewater world authoring and AI editor direction

## Product direction

Worlds are authored in Blender and through a separate AI editor service. Tidewater will not ship an in-game world editor in this direction. Blender is the visual authoring tool; `tidewater.world-source/1` JSON is the portable, reviewable interchange document; the AI service will propose edits to that document and its referenced assets.

A Blender project is a working scene, not the canonical network publication. Keep the JSON source and asset files under version control. Server runtime manifests are separately validated and owner-signed; never treat an AI proposal or `.blend` file as an authorization to publish.

## Shared source format

The normative JSON Schema is [`schemas/world-source.schema.json`](schemas/world-source.schema.json). The browser-side structural checks are in `src/network/WorldSource.js`; Blender import/export is provided by [`../tools/blender/world_source.py`](../tools/blender/world_source.py).

The format uses right-handed, Y-up coordinates in meters to match Tidewater. It records stable IDs, asset hashes, transforms, collision intent, world rules, style guidance, and portal endpoints. Objects refer to content by SHA-256 ID; don't rely on a machine-specific filesystem path. Portals identify the destination world and node, local entry and destination exit transforms, and whether the opening should show a remote preview.

Example exchange:

```sh
blender --background island.blend --python tools/blender/world_source.py -- import worlds/island.world-source.json
blender --background island.blend --python tools/blender/world_source.py -- export worlds/island.world-source.json
```

The helper creates editable metadata empties in a dedicated collection and keeps the full JSON in a Blender text block. Mesh assets remain normal Blender objects/files and should be exported to GLB/glTF and content-addressed separately. Review source diffs after export; Blender saves are not automatically trusted or published.

To produce a runtime document, import each GLB into the node's content store with `worldd --import-asset`, set the resulting ID on the matching source object, then run `tools/world-source-to-manifest.mjs`. Finally, use `worldd --sign-manifest` with the world's persistent owner identity. Runtime signing keys stay on the owner node; the AI service must only return unsigned proposals.

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

The current repository contains the source-format helper, Blender interchange script, and the federated world daemon/client foundation. The AI editor service, isolated Blender worker, preview/review UI, GLB candidate pipeline, portal rendering/handoff, and manifest publishing workflow remain future implementation work. This document describes intended boundaries; it does not claim those services are running.

## Proposed service contract

The initial service boundary should stay separate from `worldd` so world hosting remains decentralized and owners can run without an AI account. A task API can use these operations:

- `POST /v1/edit-tasks` with `{worldId, baseRevision, request, allowedOperations, assetIds}` creates an isolated proposal task.
- `GET /v1/edit-tasks/{taskId}` returns queued/running/ready/failed state, validation findings, previews, and a patch reference.
- `POST /v1/edit-tasks/{taskId}/review` records owner accept/reject and optional comments. Acceptance creates a candidate revision; it does not itself publish or sign it.
- `GET /v1/edit-tasks/{taskId}/patch` downloads a patch bound to the exact base revision. Applying it to a changed source must fail and require a rebase/review.

The worker should receive a capability-limited task bundle, not arbitrary world-server credentials. Its Blender adapter should expose named operations (create/edit mesh, place asset instance, position portal marker, export candidate GLB, render preview) and a bounded `bpy` subset; direct Python execution can be an early prototype only inside a disposable sandbox. Store audit events and artifact hashes, and delete private task bundles according to owner-configured retention.

The service should be optional and deployable by a world owner or community operator. A hosted service must not become a mandatory discovery service, acquire world signing keys, or silently reuse authored worlds as training data. Keep a local CLI/worker path so authors can run the same validators without trusting a hosted AI service.
