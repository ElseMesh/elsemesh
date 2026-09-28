# Building 002 import procedure

## Governed inputs and outputs

Use the immutable source `/fast/qualification/building-002/source-original/warehouseupload2.blend`. Its required SHA-256 is `caa62559dc36b70ebf5f4d2b8b3fe8e3d3b55ff2d45e829aa0293239b11b9d81`. Never open and save this path interactively or use it as an output. The prepared working file and GLB belong outside the repository at `/fast/qualification/building-002/output/building-002-working.blend` and `/fast/qualification/building-002/output/building-002.glb`.

## Generate the working asset

From the repository root, run exactly:

```sh
/fast/tools/blender-portal/blender-4.5.9-linux-x64/blender --background --python tools/building_pipeline/process_building.py -- --source /fast/qualification/building-002/source-original/warehouseupload2.blend --working /fast/qualification/building-002/output/building-002-working.blend --glb /fast/qualification/building-002/output/building-002.glb
```

The program hashes the source before Blender opens it, rejects mismatches and path aliasing, immediately saves a separate working copy, and then performs all mutations in that copy. Its final standard-output line is JSON. Confirm that it reports the expected source hash, the two requested output paths, exclusions `SmallGateVar1`, `SmallGateVar2`, and `SmallGateVar3`, all six planning zones, and false values for animation, camera, light, and required-compression export flags. A failure or missing JSON result means the generated assets are not approved for further use.

## Inspect the working Blender file

Open only the generated working copy in Blender 4.5.9. Confirm that:

- `SOURCE_PRISTINE` retains all source objects, including the three disconnected `SmallGateVar` helpers.
- `RUNTIME_EXPORT` contains independent duplicates of every source object except those three helpers. Editing a runtime mesh must not alter its corresponding pristine mesh.
- `PLANNING_MARKERS_NON_RUNTIME` contains removable markers for mezzanine, stairs, living, retro-computer, utilities, and portal.
- The source appearance, transforms, orientation, and dimensions remain consistent with the 41.31 m × 47.57 m × 12.98 m baseline.
- Material assignment, UV mapping, packed-image use, colour space, transparency, normal maps, and roughness/metalness appearance remain credible.

Do not save any inspection changes back to the immutable source. If adjustments are needed, make them reproducibly in the pipeline or in a newly named derivative outside the repository.

## Qualify the GLB

Inspect `/fast/qualification/building-002/output/building-002.glb` in a suitable glTF viewer. Confirm that it loads without external texture dependencies or required compression extensions; contains no animation, camera, light, pristine source object, helper mesh, or planning marker; and preserves the expected warehouse geometry and PBR appearance. Check origin, up axis, facing direction, metre-scale interpretation, normals, transparency, and texture fidelity.

Treat the principal ground-level floor as only a candidate accessible area. Collision and navigation are unverified: inspect floor continuity, thresholds, steps, ramps, openings, headroom, wall thickness, railings, overlapping faces, and disconnected surfaces. Build and test dedicated collision and navigation data later rather than using render meshes without qualification. Mezzanine and stair markers require traversal, clearance, guards, support, and collision design; living, retro-computer, utilities, and portal markers are preliminary layout prompts only.

## Acceptance record

Record the Blender version, command, timestamp, final JSON result, output hashes, visual findings, and any deviations. Agent Control authored the reusable preparation material but did not claim Blender or browser execution. Codex is responsible for executing this procedure and visually qualifying the outputs before any separate runtime integration task.

## Reusable runtime integration stage

1. Copy only the qualified, hashed runtime GLB into `public/models/buildings/`; never copy or mutate the archival `.blend`.
2. Load the static glTF hierarchy with the engine's GLB parser. Preserve node translation, rotation, scale, indices, normals, UVs, base colour, ORM and normal textures. Reject required unsupported extensions.
3. Instantiate the building as a named, independent scene group. Keep the existing building system untouched.
4. Measure the placed render bounds in the browser. Reserve the footprint from procedural vegetation before adding collision.
5. Add a dedicated walkable floor, coarse exterior wall collision with the visually verified entrance left open, and a walkable approach route. Do not use the high-detail render mesh directly as collision.
6. Test approach, entry, principal-floor traversal, exit, and the route back to the existing building. Record inaccessible upper or detailed source areas.
7. Run `npm run build`, then qualify in a real WebGPU browser. Record the renderer, application errors, frame-rate range, screenshots and walkthrough video. Preserve hardware-specific negative results separately.
8. Commit only after source hash, runtime hash, Building #001 preservation and evidence paths are recorded.
