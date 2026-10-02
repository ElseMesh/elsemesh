# Blender / external world-editing workflow

ElseMesh keeps its procedural JavaScript terrain as the authoritative runtime source, but it can now export a standard world-editing package for Blender and other tools.

## Export the current island

Run:

```sh
npm run world:export
```

This creates `artifacts/world/` with:

- `heightmap.png` — 16-bit grayscale heightmap for visual terrain tools.
- `heightmap.f32` — exact little-endian Float32 game heights.
- `rock.png`, `sand.png`, `path.png`, `gully.png`, `seagrass.png`, `rubble.png`, `scarp.png` — terrain masks.
- `terrain.json` — dimensions, height range, axes and scale.
- `world-features.geojson` — paths and point features in an interoperable vector format.

The generated artifacts are intentionally ignored by Git; regenerate them from source when needed.
## Coordinate system

The game uses metres with X east, Y up and Z south. Blender uses X east, Y north and Z up.

The importer converts coordinates as:

```text
Blender X = game X
Blender Y = -game Z
Blender Z = game Y
```

One Blender unit is one metre.

## Import into Blender

Install Blender 4.x or newer, then run from the repository root:

```sh
blender --python tools/blender/import_world.py -- \
  --world artifacts/world \
  --step 4 \
  --save artifacts/blender/ElseMesh.blend
```

`--step 4` creates a manageable 4 m preview mesh. Use `--step 1` only when the full-resolution 2048 x 2048 mesh is really needed.

The importer creates collections named `ELSEMESH_World`, `ELSEMESH_Terrain`, `ELSEMESH_Features` and `ELSEMESH_Caves`.
## Building caves

Caves must be real 3D geometry, not heightmap edits. A heightmap cannot represent a roof and floor at the same X/Z coordinate.

Keep cave work in the `ELSEMESH_Caves` collection. Recommended workflow:

1. Use the imported terrain only as a visual/scale reference.
2. Build a visible sea-level entrance in the coastal cliff.
3. Continue the cave geometry underneath the existing island rather than replacing the island terrain.
4. Keep passages physically separated from the terrain surface except where an entrance/shaft is intended.
5. Use non-destructive curves, bevels and Boolean modifiers while iterating where practical.
6. Convert/apply only when needed for reliable GLB export.
7. Keep collision-friendly geometry separate or generate simplified collision meshes in-game.
8. Preserve one Blender unit = one metre.

Export the cave collection with:

```sh
blender ElseMesh.blend --background \
  --python tools/blender/export_caves.py -- \
  --collection ELSEMESH_Caves \
  --out public/models/world/caves.glb
```
## Codex + Computer Use

Codex can use Blender interactively on a machine with Computer Use enabled. The scripts in `tools/blender/` are deliberately kept alongside the GUI workflow so repetitive work can be automated while visual modelling remains teachable.

A good learning pattern is:

- ask Codex to explain the next Blender operation before doing it;
- inspect the modifier/object it creates;
- repeat one small operation manually yourself;
- keep intermediate `.blend` files under `artifacts/blender/`;
- export GLB only after visual inspection.

See [CAVE-SYSTEM-BRIEF.md](CAVE-SYSTEM-BRIEF.md) for the first planned underground environment.

## UNDERNEATH authoring record (26 September 2026)

Blender 4.5.10 LTS was installed as the official portable Windows archive on D:. The world export produced all 11 expected files at 2048 x 2048 and 1 m per texel, with heights from -90 m to approximately 305.77 m. The importer used `--step 4` and saved `artifacts/blender/ElseMesh.blend` on D:.

The imported island and coast were inspected in Blender before modelling. The west outer headland at game `(-340, 0, 80)` offers a sea-level approach, rock volume above the tunnel, and a mouth away from the starting pier's immediate sightline. The boat approaches by water around the headland and stops afloat near `(-323, 0, 84.5)` in the deeper part of the cavern, clear of the landing and cave wall. The explorer jumps overboard onto a submerged shallow shelf, splashes into the water, and wades up a stone ramp onto the raised landing at `(-294, 1.2, 70)`. The cavern floor rises from -4.2 m at its mouth to the shallow inner end. The walking route continues through the junction, Basalt Gallery, Salt Fissure, Tide Alcove and larger hall to the electronic entry near `(-220, 1.2, -10)`. A ceiling-lift door reveals a lit boarding alcove and waiting train.

`tools/blender/underneath-layout.json` is the metre-scale layout. `tools/blender/build_underneath.py` builds named `UN_` objects in six child collections of `ELSEMESH_Caves`. Its ring meshes keep editable cross-sections; room wall openings align with passage branches. A connector shell and rock canopy bridge the boat cavern to the landing. The landing, electronic reader, station preview and iron-and-brass door are separate objects with retained bevel modifiers. No third-party cave assets were added.

To regenerate after importing the world, open the saved `.blend` in Blender, switch to the Python Console, and run `p = bpy.path.abspath('//../../tools/blender/build_underneath.py'); exec(compile(open(p).read(), p, 'exec'), {'__file__': p})`. Save the scene, then use `export_caves.py` as above. The exporter writes both `public/models/world/caves.glb` and `caves.json`.

The game keeps the procedural terrain generator. A narrow submerged channel from approximately `(-400, 80)` to the mouth lowers only the approach shoal to a 3.2 m depth; the channel is present in the exported heightmap and Blender preview. A small elliptical fragment cutout at `(-344, 80)` reveals the sea entrance. `CaveSystem` loads the GLB and layout, assigns reusable materials and local lights, and provides conservative passage-footprint, landing, door and boat-wall collision. The cave floor takes precedence over the surface reef height while the player is underground. Seven fixed cool lights aid orientation; the existing flashlight remains available.

`npm test` includes a focused GLB/layout/collision check, and `npm run build` verifies bundling. Browser startup and route qualification are recorded in the handover. The generated `.blend`, world export, and Blender screen recordings remain local under ignored `artifacts/` on D:; they are not committed.
