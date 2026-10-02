# Building 002 Blender pipeline

This directory contains the deterministic, reusable preparation program for Building 002. It verifies the original Blender file byte-for-byte before opening it, immediately creates a distinct working copy outside the repository, retains the imported objects in `SOURCE_PRISTINE`, builds independent runtime duplicates, adds removable non-runtime planning markers, and exports an embedded binary glTF. Runtime objects use cached copies of their source materials and referenced images; only those runtime image copies are deterministically scaled when their larger dimension exceeds the configured cap. The source file, pristine material links, and original packed image datablocks are never modified.

## Prerequisites

Use Blender 4.5.9 at the configured path. The immutable source is:

- `/fast/qualification/building-002/source-original/warehouseupload2.blend`
- SHA-256: `caa62559dc36b70ebf5f4d2b8b3fe8e3d3b55ff2d45e829aa0293239b11b9d81`

## Exact command

The output paths deliberately live outside the repository. The directories are created by the script when necessary.

```sh
/fast/tools/blender-portal/blender-4.5.9-linux-x64/blender --background --python tools/building_pipeline/process_building.py -- --source /fast/qualification/building-002/source-original/warehouseupload2.blend --working /fast/qualification/building-002/output/building-002-working.blend --glb /fast/qualification/building-002/output/building-002.glb
```

Run this command from the repository root. The optional `--max-texture-size` argument defaults to `1024`; it may be supplied after `--glb` to select another positive pixel cap. On success, the final standard-output line is a compact JSON result recording the verified source hash, output paths, runtime object count, the three excluded helpers, planning zones, configured cap, source and runtime texture counts and maximum dimensions, measured GLB byte size, and export feature flags. Blender execution and visual qualification remain a Codex follow-up; Agent Control authored this refinement and documentation but did not run Blender.

## Deterministic scene structure

- `SOURCE_PRISTINE` contains the source objects. Their geometry is not used directly for export.
- `RUNTIME_EXPORT` contains object copies with independent data-block copies. Only objects in this collection are selected for GLB export.
- `PLANNING_MARKERS_NON_RUNTIME` contains named Empty cube markers for `mezzanine`, `stairs`, `living`, `retro-computer`, `utilities`, and `portal`. They are planning aids, removable as a collection, and never exported.
- `SmallGateVar1`, `SmallGateVar2`, and `SmallGateVar3` are the only source objects omitted from runtime duplication. They are disconnected helper meshes and remain preserved in `SOURCE_PRISTINE`. The program fails if any expected helper is absent.

The GLB is embedded (`GLB`) and is exported without animation, cameras, lights, or Draco compression. It therefore requires no compression extension. Geometry, UV layers, material channels, and alpha inputs otherwise remain unchanged. Material and image caches preserve source sharing relationships among runtime copies, and aspect ratio is preserved when an oversized runtime image is scaled. Inspect the resulting material appearance during visual qualification.

## Measured performance gate

Codex successfully ran the first Agent Control pipeline and produced a valid extension-free GLB with 34 runtime objects, 29 meshes, 13 materials, 35 images, and approximately 150,259 indexed triangles. That first GLB measured 200,549,608 bytes, while its working blend measured 162,510,223 bytes. The GLB therefore failed the repository and browser-runtime size gate. Those measurements are retained as evidence; they predate the runtime-only 1024-pixel texture cap. No smaller output is claimed until Codex reruns Blender and reports the new measurement.

## Known source baseline

The Blender 4.5.9 inventory is 37 objects, including 32 meshes with 105,921 vertices, 88,530 polygons, and 198,191 triangles; 14 materials; and 54 packed images. All meshes have UV mapping, no images are missing, and there are no lights or cameras. The overall bounds are 41.31 m × 47.57 m × 12.98 m. See `docs/BUILDING-002-ASSET-REPORT.md` for interpretation and limitations.
