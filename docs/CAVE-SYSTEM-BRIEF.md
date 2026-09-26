# UNDERNEATH — first cave-system brief

Working name: **UNDERNEATH**

This is the first large exploratory environment planned for Burning Horizons.

## Player experience

The cave is discovered from the sea, not from an arbitrary inland hole.

The intended flow is:

1. Leave the village in the existing boat.
2. Explore the coastline and notice a clearly visible cave mouth at approximately sea level.
3. Pilot the boat into the outer sea cave.
4. Reach a sheltered landing / shallow-water point inside.
5. Leave the boat and continue on foot.
6. Descend through a connected underground passage network beneath the existing island.
7. Pass through narrower tunnels, junctions and larger chambers.
8. Eventually reach a deliberately constructed door at the end of the system.

The door is the destination for the first implementation. What is behind it is intentionally left unresolved.
## World-design constraints

- Preserve the existing procedural island and all current gameplay.
- The underground system must sit geometrically beneath the existing map.
- Do not flatten or replace the terrain merely to make room for caves.
- Only the sea-cave entrance should visibly break the exterior cliff in the first version.
- The entrance must be large enough to read from the water and to admit the current boat with believable clearance.
- Include a safe place to stop/leave the boat before the walk-only passages.
- Avoid placing underground geometry so close to the surface that it visibly clips through existing terrain.
- Keep all cave authoring in `BH_Caves` or clearly named child collections.
- Maintain one-metre world scale and the documented game-to-Blender axis conversion.
## First playable scope

The first qualification target is intentionally bounded:

- one exterior sea-cave mouth;
- one boat-navigable entrance section;
- one landing area;
- at least three distinct passages;
- at least one meaningful junction;
- at least one larger chamber;
- a final corridor;
- one visually distinct closed door;
- basic collision and traversability;
- lighting sufficient for navigation while retaining a dark cave atmosphere;
- successful GLB export and in-game load;
- no regression to the outdoor island, boating, fishing or existing tests.

Atmosphere, puzzles, enemies, narrative, keys, door opening and procedural cave generation are follow-on work, not blockers for the first physical cave.
## Implementation principle

Treat the cave as additive world geometry loaded by Burning Horizons, not as a rewrite of `TerrainData`.

The procedural terrain remains the canonical exterior heightfield. Blender is the authoring environment for geometry that heightfields cannot represent: caves, overhangs, interiors, ruins, tunnels and constructed spaces.

The repository must retain source provenance, the Blender workflow, exported runtime assets and enough documentation for another developer or Codex session to reproduce the pipeline.
