# Codex handover — Blender setup and UNDERNEATH cave system

Repository: `https://github.com/lozknowles/Burning-Horizons`

Machine: MSI Windows 11

Goal: install the required Blender tooling on the MSI, validate the new Burning Horizons world-editing pipeline, and take the baton for building the first playable cave system, working name **UNDERNEATH**.

## Authoritative starting point

Burning Horizons is an independent game repository derived from the MIT-licensed Tidewater codebase with history and credits preserved.

The exterior island is a procedural 2048 x 2048 heightfield at 1 metre per texel. Do **not** replace that terrain system.

New tooling already exists in:

- `tools/blender/export-terrain.mjs`
- `tools/blender/import_world.py`
- `tools/blender/export_caves.py`
- `docs/BLENDER-MODDING.md`
- `docs/CAVE-SYSTEM-BRIEF.md`

README documents the workflow.
## Phase 1 — prepare MSI safely

1. Fetch/pull current `main`; do not discard legitimate later work.
2. Confirm the worktree is clean before changes.
3. Install a current stable Blender 4.x release using an appropriate trusted Windows installation method.
4. Do not change global developer tooling unnecessarily.
5. Confirm `blender --version` or determine the installed executable path.
6. Run `npm ci` if dependencies are not present.
7. Run `npm run world:export`.
8. Validate that `artifacts/world/` contains the heightmap, exact Float32 height data, masks, metadata and GeoJSON.
9. Use the supplied Blender importer to create `artifacts/blender/Burning-Horizons.blend`.
10. Confirm 1 Blender unit = 1 metre and the imported terrain aligns with the documented axes.

If the Blender CLI is not on PATH, use its explicit executable path; do not treat that alone as a blocker.
## Phase 2 — inspect before modelling

Use Blender with Computer Use so the work is visually inspectable.

Before changing geometry:

- open the imported Burning Horizons scene;
- inspect `BH_Terrain`, `BH_Features` and `BH_Caves`;
- inspect the coastline and identify candidate sea cliffs for the entrance;
- correlate the candidate with the existing boat route and water level;
- record the chosen entrance coordinates and why they are suitable;
- verify there is enough island volume above/beyond the entrance for a believable underground route.

Prefer a location that is discoverable from the sea but not immediately visible from the starting pier.

Do not begin by cutting the procedural terrain source code.
## Phase 3 — build UNDERNEATH

Player flow:

**boat -> visible sea cave -> boat-navigable outer cavern -> sheltered landing -> on-foot descent -> passage network -> larger chamber(s) -> final corridor -> closed door**

First playable scope:

- one exterior cave mouth at approximately sea level;
- enough width/height for the existing boat;
- a navigable entrance section with believable rock volume;
- a sheltered landing or shallow-water stopping place;
- at least three visually distinct passages;
- at least one junction;
- at least one larger chamber;
- a final corridor;
- one visually distinct closed door;
- basic collision/traversability;
- cave lighting sufficient to navigate while remaining atmospheric.

Keep cave authoring in `BH_Caves` and clearly named child collections.
## Modelling guidance

Use Blender non-destructively where practical:

- curves + bevel for early passage layout;
- metaballs/voxel remesh/booleans or equivalent for organic cave shells;
- separate simplified collision meshes if useful;
- modifiers retained until geometry is stable;
- sensible polygon density for WebGPU/browser runtime;
- reusable rock/material strategy rather than unique heavy textures everywhere.

The cave should exist **under** the current island geometry. Avoid surface intersections except at deliberate openings.

Do not create a disconnected teleport dungeon for the first implementation. The sea cave should be spatially connected to the underground system.

The closed door is the end-state of this phase. Do not invent what is behind it yet.
## Phase 4 — runtime integration

Export the cave through `tools/blender/export_caves.py` to a safe runtime GLB location such as:

`public/models/world/caves.glb`

Then integrate it into Burning Horizons with:

- explicit world/cave loader code;
- collision support;
- appropriate render layers/material handling;
- boat clearance through the entrance;
- player transition from boat to walking at the landing;
- no special teleport unless physically necessary and documented;
- no regression to fishing, boating, village, terrain, ocean or existing world systems.

If a terrain opening requires game-side masking/cutout, implement the smallest bounded opening mechanism necessary rather than replacing the terrain generator.
## Phase 5 — qualification

Before publication:

1. Run existing `npm test`.
2. Run `npm run build`.
3. Add focused tests where practical for cave asset loading / coordinates / collision metadata.
4. Launch the game and physically demonstrate:
   - boat can reach the cave;
   - boat can enter without clipping/blocking;
   - player can reach the landing;
   - player can traverse all required passages;
   - final door is reachable;
   - player cannot trivially walk through cave walls/door;
   - return path to the boat/outdoors works unless intentionally designed otherwise.
5. Capture screenshots/video evidence if Computer Use supports it.
6. Keep known visual or gameplay limitations explicit.

Do not call untested behaviour qualified.
## Documentation and Git

Update README and the detailed docs as implementation evolves.

Record:

- Blender version;
- install method;
- exact entrance coordinates;
- cave collection/object naming;
- runtime asset paths;
- export commands;
- any collision conventions;
- known limitations;
- tests actually run;
- final commit SHA.

Commit logically separated changes. Preserve MIT licence and existing third-party credits. Add credits for any new external assets.

Push only after tests/build pass and the cave work is in a coherent state.

## Teaching mode

The user wants to learn Blender. When using Computer Use, explain major Blender operations before performing them where practical, and leave intermediate objects/modifiers inspectable. Prefer a workflow the user can reproduce manually over opaque destructive automation.

Final report should state: setup status, Blender version, cave entrance location, modelling approach, runtime integration status, tests/build results, screenshots/video produced, commit SHA, remaining limitations and next recommended step.
