# Blender / external world-editing workflow

Burning Horizons keeps its procedural JavaScript terrain as the authoritative runtime source, but it can now export a standard world-editing package for Blender and other tools.

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
  --save artifacts/blender/Burning-Horizons.blend
```

`--step 4` creates a manageable 4 m preview mesh. Use `--step 1` only when the full-resolution 2048 x 2048 mesh is really needed.

The importer creates collections named `BH_World`, `BH_Terrain`, `BH_Features` and `BH_Caves`.
## Building caves

Caves must be real 3D geometry, not heightmap edits. A heightmap cannot represent a roof and floor at the same X/Z coordinate.

Keep cave work in the `BH_Caves` collection. Recommended workflow:

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
blender Burning-Horizons.blend --background \
  --python tools/blender/export_caves.py -- \
  --collection BH_Caves \
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
