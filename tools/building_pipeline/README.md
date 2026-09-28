# Building 002 Blender pipeline

This directory contains the deterministic, reusable preparation program for Building 002. It verifies the original Blender file byte-for-byte before opening it, immediately creates a distinct working copy outside the repository, retains the imported objects in `SOURCE_PRISTINE`, builds independent runtime duplicates, adds removable non-runtime planning markers, and exports an embedded binary glTF. The source file is never saved or overwritten.

## Prerequisites

Use Blender 4.5.9 at the configured path. The immutable source is:

- `/fast/qualification/building-002/source-original/warehouseupload2.blend`
- SHA-256: `caa62559dc36b70ebf5f4d2b8b3fe8e3d3b55ff2d45e829aa0293239b11b9d81`

## Exact command

The output paths deliberately live outside the repository. The directories are created by the script when necessary.

```sh
/fast/tools/blender-portal/blender-4.5.9-linux-x64/blender --background --python tools/building_pipeline/process_building.py -- --source /fast/qualification/building-002/source-original/warehouseupload2.blend --working /fast/qualification/building-002/output/building-002-working.blend --glb /fast/qualification/building-002/output/building-002.glb
```

Run this command from the repository root. On success, the final standard-output line is a compact JSON result recording the verified source hash, output paths, runtime object count, the three excluded helpers, planning zones, and export feature flags. Blender execution and visual qualification remain a Codex follow-up; Agent Control authored the pipeline and documentation but did not claim to run Blender.

## Deterministic scene structure

- `SOURCE_PRISTINE` contains the source objects. Their geometry is not used directly for export.
- `RUNTIME_EXPORT` contains object copies with independent data-block copies. Only objects in this collection are selected for GLB export.
- `PLANNING_MARKERS_NON_RUNTIME` contains named Empty cube markers for `mezzanine`, `stairs`, `living`, `retro-computer`, `utilities`, and `portal`. They are planning aids, removable as a collection, and never exported.
- `SmallGateVar1`, `SmallGateVar2`, and `SmallGateVar3` are the only source objects omitted from runtime duplication. They are disconnected helper meshes and remain preserved in `SOURCE_PRISTINE`. The program fails if any expected helper is absent.

The GLB is embedded (`GLB`) and is exported without animation, cameras, lights, or Draco compression. It therefore requires no compression extension. Materials, UV layers, and packed texture-derived image data are carried through Blender's glTF exporter; inspect the resulting material appearance during visual qualification.

## Known source baseline

The Blender 4.5.9 inventory is 37 objects, including 32 meshes with 105,921 vertices, 88,530 polygons, and 198,191 triangles; 14 materials; and 54 packed images. All meshes have UV mapping, no images are missing, and there are no lights or cameras. The overall bounds are 41.31 m × 47.57 m × 12.98 m. See `docs/BUILDING-002-ASSET-REPORT.md` for interpretation and limitations.
