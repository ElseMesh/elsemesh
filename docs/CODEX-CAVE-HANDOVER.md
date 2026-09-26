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

## Implementation record — 26 September 2026

Work was based on `main` at `4e46283cc26a7409c3254f9c5ef677f1a9fb244d` in a clean clone. Because C: was full, the working checkout, official portable Blender 4.5.10 LTS archive/executable, generated world export, editable `.blend`, screen recordings and npm dependencies were kept on D:. The scene was imported at `--step 4`, viewed in Blender, and regenerated after the localized approach-channel terrain change. The generated `.blend` and source screen recordings remain ignored local artifacts.

The selected sea mouth is game `(-340, 0, 80)` on the west outer headland. The Blender-authored `BH_Caves` scene contains a boat cavern, sheltered landing and connector, five named passages, a four-way junction, a hall and a closed iron-and-brass door. `build_underneath.py` and `underneath-layout.json` reproduce the geometry. `export_caves.py` writes `public/models/world/caves.glb` and `caves.json`. The runtime keeps the procedural island, carves only a narrow submerged approach shoal to a 3.2 m depth, and masks a small section of cliff face at the mouth. `CaveSystem` supplies cave materials, seven local lights, floor queries, passage-wall constraints, boat-wall proxies and a closed-door collider.

The generated world export had the expected 11 files, 2048 x 2048 at 1 m per texel, and heights of -90 to 305.77 m. `npm test` and `npm run build` passed on the D: checkout. The focused cave test parses the committed GLB and layout, checks the approach depth, landing/junction/hall/door floor coordinates, wall constraint and closed-door collision. Edge/WebGPU reached the playable state without a new browser error.

The browser was used for staged qualification with the actual game objects. A deterministic 120 Hz boat-physics run (flat cached water samples, starting at `(-400, 80)`, mooring released) followed the carved channel through the mouth and into the cavern without grounding; its hull stayed near water level. At a boat position beside the landing, the game's `ashoreTarget()` returned a 1.2 m walkable point and `exitBoat()` entered walk mode there. The player controller followed the Descent, Basalt Gallery and Final Corridor centerlines to the door; the door stopped forward travel at game Z `-9.15`. Both side branches and the reverse route to the landing were traversed by the same controller, and a sideways wall test stopped at the passage boundary. These are staged/simulated checks, not a manual end-to-end drive from the starting pier.

Remaining qualification before publication: manually drive the boat from the starting pier through waves into the cave; inspect mast and hull clearance throughout, stop and step ashore using normal controls; walk the complete route and return in a continuous session; check exterior and fishing regression. A few light leaks near shell joins and basic low-poly rock/landing finishes may need visual refinement. Do not call the cave production-ready or push it to `main` until those checks pass.

Final report should state: setup status, Blender version, cave entrance location, modelling approach, runtime integration status, tests/build results, screenshots/video produced, commit SHA, remaining limitations and next recommended step.
