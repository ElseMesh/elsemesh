# Building 002 source asset report

## Identity and provenance

The preserved source is `/fast/qualification/building-002/source-original/warehouseupload2.blend`, SHA-256 `caa62559dc36b70ebf5f4d2b8b3fe8e3d3b55ff2d45e829aa0293239b11b9d81`. It is the author-linked Blender file for [Abandoned Warehouse](https://sketchfab.com/3d-models/abandoned-warehouse-698a34300af34095ac6593f348585daa) by Arsen Ismailov, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The pipeline treats this file as immutable and writes only distinct outputs outside the repository.

## Blender 4.5.9 baseline inventory

- 37 objects total and 32 mesh objects
- 105,921 vertices, 88,530 polygons, and 198,191 triangles
- 14 materials and 54 packed images
- UV maps present on every mesh; no missing images
- No lights and no cameras
- Overall bounds: 41.31 m × 47.57 m × 12.98 m

`SmallGateVar1`, `SmallGateVar2`, and `SmallGateVar3` are three disconnected helper meshes. They remain untouched in `SOURCE_PRISTINE` but are the only objects excluded from runtime duplication and GLB export.

## Scale, axes, and orientation

The preparation pipeline preserves the source transforms, coordinate values, scale, and orientation; it performs no rotation, unit conversion, recentering, transform application, or geometry rescaling. The reported bounds are interpreted as metres using the source/Blender scene convention. The exported glTF uses Blender 4.5.9's standard glTF coordinate conversion. A consuming system must verify placement, forward direction, origin, and real-world scale against its own coordinate conventions before integration.

## Materials, textures, PBR, and UVs

All runtime objects receive independent object and data-block copies while retaining their material relationships. The source contains 14 materials, 54 packed images, and UV mapping on all meshes, with no missing image references in the baseline inventory. Blender's GLB exporter embeds exportable image data and maps supported material inputs to glTF PBR materials. Unsupported Blender shader nodes or procedural effects may not reproduce exactly; texture colour space, alpha handling, normal-map direction, roughness/metalness response, and visual parity require inspection of the generated GLB. No claim is made that every source shader is natively glTF-PBR compatible.

## Navigability and collision limits

The principal ground-level warehouse floor is the assumed accessible area. This is a planning assumption only: the source has not been certified as a collision mesh, navigation mesh, accessibility model, or watertight architectural representation. Door clearances, thresholds, slopes, steps, floor continuity, headroom, railings, wall thickness, normals, overlapping geometry, and disconnected surfaces remain unverified. Runtime collision and navigation should be derived and tested separately after visual qualification; render geometry must not automatically be treated as safe or efficient collision geometry.

## Future planning zones

The working file adds removable Empty cube markers in `PLANNING_MARKERS_NON_RUNTIME` for six future zones: mezzanine, stairs, living, retro-computer, utilities, and portal. Their positions and dimensions are preliminary spatial prompts, not approved construction, collision, gameplay, or accessibility specifications. They are excluded from the runtime GLB. The mezzanine and stairs specifically require later clearance, support, guard, traversal, and collision validation; the other zones require layout and interaction validation.

## Generated deliverables and qualification boundary

`tools/building_pipeline/process_building.py` verifies the source hash before opening, immediately saves a distinct working `.blend`, preserves source objects in `SOURCE_PRISTINE`, creates independent runtime duplicates, and exports selected runtime objects as an embedded GLB without animations, cameras, lights, or required compression extensions. Working outputs are configured under `/fast/qualification/building-002/output/`, outside the repository. Agent Control prepared this report and pipeline but did not execute Blender or a browser. Codex must execute the documented command, inspect its JSON result, and visually qualify the working file and GLB before runtime use.
