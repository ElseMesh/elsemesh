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

All runtime objects receive independent object and data-block copies. Their material slots are redirected to cached runtime-only material copies, and image texture nodes are redirected to cached runtime-only image copies, preserving sharing without changing `SOURCE_PRISTINE` material links or original packed image datablocks. The source contains 14 materials, 54 packed images, and UV mapping on all meshes, with no missing image references in the baseline inventory. Runtime image copies whose larger dimension exceeds the deterministic `--max-texture-size` cap (1024 pixels by default) are scaled proportionally; smaller copies are unchanged. Geometry, UVs, material channels, alpha inputs, and no-compression export settings otherwise remain unchanged. Blender's GLB exporter embeds exportable image data and maps supported material inputs to glTF PBR materials. Unsupported Blender shader nodes or procedural effects may not reproduce exactly; texture colour space, alpha handling, normal-map direction, roughness/metalness response, and visual parity require inspection of the generated GLB. No claim is made that every source shader is natively glTF-PBR compatible.

## Measured export performance

Codex executed the first Agent Control pipeline successfully. It produced a valid extension-free GLB with 34 runtime objects, 29 meshes, 13 materials, 35 images, and approximately 150,259 indexed triangles. The working blend measured 162,510,223 bytes and the GLB measured 200,549,608 bytes. That GLB failed the repository and browser-runtime performance gate.

Codex then executed Agent Control's refined 1024-pixel runtime-texture pipeline. The qualified runtime GLB is 40,703,788 bytes (79.7% smaller than the first export), SHA-256 `12112f1687dc2a0ee98ad65878cd8c6a5b2649125672d418ac2c0056941cbcfa`. It retains 29 exported meshes, 13 glTF materials and approximately 150,259 indexed triangles without a required compression extension. The optimized working Blender file is 299,923,261 bytes, SHA-256 `35b049ea56acb73451da84223beb19962e97bef2ed7f1a552383d9a204437b40`; it is larger because it deliberately contains the pristine packed source images and separate runtime image copies. Source geometry is unchanged.

## Navigability and collision limits

The runtime uses a separate conservative collision shell: one walkable principal-floor slab, an approach strip, and outer wall boxes with the source main-gate span left open. Windows, columns, raised steelwork and source props remain render geometry rather than collision geometry. The main ground-level volume can be approached, entered, crossed and exited. Upper platforms, stairs, side rooms, roof areas and source-detail clearances are not certified accessible.

## Runtime placement and validation

Building #002 is instantiated independently at the third-island industrial area near world `(145, 600)`, rotated 90 degrees so its open gate addresses the existing Warehouse Loft access route. Procedural trees are excluded from its footprint. Building #001 remains the unmodified `PortalInterior` system and its exterior `WAREHOUSE LOFT · E TO ENTER` marker remains visible beside Building #002. The existing Building #001 interior remains portal-isolated by its original architecture; the marker and Building #002 exterior are simultaneously visible, while the full Building #001 interior is visible only after entering its portal.

Windows Edge WebGPU validation loaded both systems with no application error and recorded 27–34 fps during the evidence path. Ubuntu Chromium on the Quadro P5000 failed a separate video-capture qualification because its WebGPU limits allow only four storage textures and sixteen sampled textures per stage; that is a host limitation in existing ocean/post pipelines, not a Building #002 GLB load failure. Both results are retained.

## Future planning zones

The working file adds removable Empty cube markers in `PLANNING_MARKERS_NON_RUNTIME` for six future zones: mezzanine, stairs, living, retro-computer, utilities, and portal. Their positions and dimensions are preliminary spatial prompts, not approved construction, collision, gameplay, or accessibility specifications. They are excluded from the runtime GLB. The mezzanine and stairs specifically require later clearance, support, guard, traversal, and collision validation; the other zones require layout and interaction validation.

## Generated deliverables and qualification boundary

`tools/building_pipeline/process_building.py` verifies the source hash before opening, immediately saves a distinct working `.blend`, preserves source objects in `SOURCE_PRISTINE`, creates independent runtime duplicates, and exports selected runtime objects as an embedded GLB without animations, cameras, lights, or required compression extensions. Working outputs are configured under `/fast/qualification/building-002/output/`, outside the repository. Agent Control prepared this report and pipeline. Codex executed Blender, measured and hashed both exports, implemented the runtime correction after Agent Control exhausted its runtime task budget, and qualified the result in Windows Edge WebGPU. The evidence harness removes the first-run tutorial card only inside the disposable capture page so it cannot obstruct the warehouse; it does not change the game or persisted production UI.
