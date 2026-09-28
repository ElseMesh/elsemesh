# Portal warehouse reference-detail learning ledger

## Agent Control operation

This iteration is governed as `portal-warehouse-reference-detail-v1`. The machine-readable operation is stored at `tools/portal_interior/reference-detail-v1.json`. It converts observations from the supplied warehouse-loft references into bounded scene operations and verifies them against protected circulation and interaction invariants.

The operation deliberately works in the existing primitive batching recipe. Repeated props reuse the current material batches, so increased geometric detail does not create one draw call per object. Building #001, Building #002, the arrival point, the stair route, mezzanine collision and C64 interaction remain protected.

## Attempt and correction ledger

| Agent Control attempted | Result | Codex correction | Generalisable lesson |
| --- | --- | --- | --- |
| Treat the supplied images as a list of scene details | Broad visual intent was clear, but it was not independently testable | Converted nine observations into a versioned manifest with explicit object names and protected invariants | Reference-image work needs a machine-readable observation-to-object contract before visual claims are made |
| Add richer objects directly to the scene | Detail increased, but a naïve asset-per-object approach would increase draw calls and runtime memory | Added geometry to existing merged material batches and reused procedural materials | Prefer batched primitive detail for repeated small props; reserve imported assets for silhouette-critical objects |
| Add decorative furniture freely | Some placements could obstruct the proven stair and mezzanine routes | Kept all additions outside the arrival and retro-zone route and retained existing collider geometry | Treat circulation zones and interaction radii as immutable constraints during detail passes |
| Reuse the existing generic fabric shader for every rug | Rugs remained flat and visually interchangeable | Added a separate woven motif treatment for rug materials while retaining the same material count | Material variation can be added inside a shared shader branch without introducing texture downloads or extra draw batches |

## Reusable sequence

1. Record concrete reference observations without copying protected artwork or trademarks.
2. Map each observation to named scene objects in a versioned manifest.
3. Declare protected zones, collisions and interactions before mutation.
4. Add repeated small detail through existing merged material batches.
5. Add or refine a shared procedural material only when geometry cannot express the observation.
6. Run manifest, route, interaction, full regression and production-build checks.
7. Capture runtime evidence from the actual browser renderer.
8. Record any failed placement or visual mismatch before correcting it.

## Learning state

`CANDIDATE_PENDING_RUNTIME_VERIFICATION`

Agent Control must complete its governed repository review and the browser evidence must pass before this operation can be labelled `VERIFIED_REUSABLE_OPERATION`. It is not promoted as an autonomous deterministic skill from a single execution.
