# Island Five Agent Control Record

## Scope

Island Five is an additive, bounded forest-only module. It exposes an analytic height function and deterministic forest data without integrating with existing world systems.

## Assumptions

- The shared terrain domain is centered at the origin with a 2048 metre span.
- Agent Control proposed `(-700, 620)`. Codex review found that footprint overlapped Island Four and corrected the integrated location to `(-800, 430)`.
- Sea level is `0`; the analytic function returns `-90` outside the island footprint.
- Tree collision metadata is consumed later by the integrating world layer.

## Attempted operations

- Added `src/world/IslandFiveLayout.js` with bounded terrain and containment helpers.
- Added `src/world/IslandFiveSystem.js` with deterministic tree placement, shared geometry/materials, and trunk collision metadata.
- Added `test/island-five.mjs` covering repeatability, bounds, separation, forest-only tree records, and collision data.

## Governed execution ledger

| Attempt | Agent Control result | Codex correction | Reusable lesson |
| --- | --- | --- | --- |
| 1 | Rejected the shared dirty worktree before model execution. | Created a dedicated clean worktree. | Every repository coding task needs its own clean checkout. |
| 2 | Blocked a read of `WorldLayout.js` because it was absent from the frozen context. | Added the file as read-only context. | Freeze all coordinate and world-bound contracts in the task definition. |
| 3 | Failed because the bounded writer could not create a missing parent directory. | Precreated the approved empty directory. | The task bootstrap must create allowed output directories. |
| 4 | Created the layout, then blocked a read of `engine/index.js` because the implementation context was incomplete. | Added the engine and material contracts as read-only context. | Include implementation dependencies as well as world-layout dependencies. |
| 5 | Created four useful files, then denied the configured `tools/island_five` path. | Retained the useful output and recorded the path-policy defect. | Validate nested allowed paths before dispatch; an allowlist entry is not proof that the runtime accepts it. |

Agent Control attempted the bounded implementation and independently enforced its context and path policies. It did not complete its full implement-review-refine-verify parcel. Codex reviewed the partial output, fixed island separation, removed the unintended empty centre by using the declared 180-tree budget, connected the terrain and runtime systems, and ran the project gates.

Retained parcel evidence: `parcel-a8deb5ce-666b-4f9f-aa1d-1a644fb51c33`, `parcel-ffdd62ab-019b-4566-90ca-79bff5f6b70e`, `parcel-51c288a8-323e-4011-9f41-9843c1f94d5f`, `parcel-3d758427-508a-4441-9736-c53575f1ae57`, and `parcel-9abeb73c-6e49-4429-9fbc-d397a7c54616` under `/fast/qualification/island-five/agent-control/` on the controller host.

## Limitations

- The forest uses shared procedural geometry/materials rather than scanned assets.
- Agent Control did not integrate, commit, push, or deploy. Those operations were completed after Codex review.
