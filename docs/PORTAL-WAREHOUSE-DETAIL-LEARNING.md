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
| Accept the first browser capture after structural checks passed | The WebGPU side-by-side showed a credible shell but sparse living zones, a blank approach wall, pale seating and insufficient archive clutter | Added a darker upholstery palette, layered wall mural, lounge gallery console, framed prints, plants, kitchen objects, dining rug trim, archive devices and riveted foreground columns using existing batches | Runtime comparison at the intended camera angle is a required correction signal; object-count tests alone cannot validate visual density |
| Run the governed repository review on the shared Agent Control instance | The controller failed closed because the repository was outside its allowed root | Started an isolated Agent Control instance scoped only to this worktree, leaving the shared service unchanged | Repository policy should be explicit per isolated execution environment |
| Route the isolated review through configured reasoning roles | Four review attempts failed closed (`work_parcel_reasoning_planner_unconfigured`, `repository_path_outside_policy`, `model_role_missing`, then `model_route_unavailable`) | Retained every run identifier and continued with deterministic operation checks and observed WebGPU evidence; no successful autonomous review is claimed | Agent acknowledgement and a queued job are not completion; route health must be verified before autonomous review can be credited |
| Compare the floor with the supplied low-wide reference | The pale 1.8 m grid dominated the scene and read as clean showroom tile | Changed the shared floor shader to dark, large irregular industrial slabs with wear and damp roughness variation; added sparse flush repairs and drains while preserving the original collider | Large architectural surfaces need silhouette, scale, roughness and colour validation from the target camera before adding more small props |

## Reusable sequence

1. Record concrete reference observations without copying protected artwork or trademarks.
2. Map each observation to named scene objects in a versioned manifest.
3. Declare protected zones, collisions and interactions before mutation.
4. Add repeated small detail through existing merged material batches.
5. Add or refine a shared procedural material only when geometry cannot express the observation.
6. Run manifest, route, interaction, full regression and production-build checks.
7. Capture runtime evidence from the actual browser renderer.
8. Record any failed placement or visual mismatch before correcting it.

Run the deterministic Agent Control evidence gate with:

```bash
npm run verify:portal-detail
```

It emits `agent-control.portal-interior-reference-detail-evidence/v1` JSON with named checks and measured scene counts. A passing result verifies the declared operation contract; it does not replace runtime visual evidence or a healthy governed model review.

## Governed review evidence

- Shared natural-task parcel `parcel-5a10e6c0-d465-4165-a125-38e7e966831b`: failed closed, reasoning planner unconfigured.
- Shared parameterised review `7801ac9c-1671-47b1-84a2-0c0f1ac8521b`: failed closed, repository outside policy.
- Isolated review `048017bd-8f92-4736-81a3-f19635f608b3`: failed closed, model role missing.
- Isolated review `7e1efb89-c234-49ec-b4b7-a7c58679540f`: failed closed, model route unavailable.
- Isolated review `285c4b3c-6ccf-47cb-a4cf-1087be42d54e`: failed closed, model route unavailable after resolving an ambiguous saved-job route.
- Exact-candidate review `0d31c245-6309-4275-80a1-4050b4088205`: failed closed, model route unavailable.

These failures are retained as learning evidence. They do not count as a successful Agent Control repository review. The reusable operation remains dependent on deterministic manifest checks, regression tests, production build, and observed browser evidence until an Agent Control model route is independently qualified.

## Learning state

`VERIFIED_WITH_AGENT_CONTROL_REVIEW_BLOCKED`

The deterministic operation gate passed with 1,755 objects, 34 materials, 13 lights and 96 colliders. The focused tests, full 24-test game suite, 29-test network suite and production build passed. Edge/WebGPU runtime validation confirmed PBR readiness, C64 availability and Building #002 coexistence with no observed console or resource errors. The calibrated floor capture ran at 36 fps in the recorded 1600×900 view. The requested low-wide comparison is stored at `D:\Downloads\Burning-Horizons-Portal-Detail-Comparison\portal-warehouse-reference-vs-industrial-floor.png`.

The governed model review remains blocked by unavailable routing, so this is not labelled `VERIFIED_REUSABLE_OPERATION` or promoted as an autonomous skill. Agent Control can deterministically rerun and measure the operation, while future route qualification remains an explicit prerequisite for model-led review.
