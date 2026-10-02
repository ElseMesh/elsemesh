# Island Four — forest-edge villa

**Author: Agent Control**

Island Four is an additive boat-reachable island west of Island Three. Its dense woodland occupies the interior, while a CC0 residence sits at the far southern edge with an uninterrupted view over the open ocean. The residence clearing is bounded; no new road cuts through the forest.

## Qualified source

- Asset: [Forest Cabin](https://www.blendkit.com/asset-gallery-detail/a1b23c3e-5e04-4ee5-8dc5-ce4016d0e90a/)
- Author: 3dquads blender
- Licence: CC0
- Untouched Blender source: 74,493,172 bytes, preserved off-repository
- Source SHA-256: `8861540e29e3457adba400f36b4ac9dfb9d1775e01f11d92df2a2423184c3c8f`

The untouched source contained 50 mesh objects, 30,269 vertices, 58,662 triangles, 20 materials and 95 packed 2048 px images. Agent Control retained all geometry while reducing the runtime material set to 26 useful 512 px images. Height, metallic and roughness maps that did not materially improve the browser view were removed. The runtime GLB is 8,289,512 bytes.

## Placement and access

- Island centre: `(-500, 650)`
- Villa centre: `(-500, 720)`
- The ocean-facing southern view corridor remains free of trees.
- A rounded terrain pad supports the cabin without creating a visible rectangular platform.
- The terrace is walkable; conservative core collision prevents walking through the building shell.
- The shoreline remains natural and can be approached by boat. No existing island terrain or behaviour is replaced.

## Reusable operation

The complete source identity, hashes, measured optimisation and placement contract are recorded in `tools/outer_islands/island-four-villa-v1.json`. Future external residences must pass the same sequence: licence gate, untouched preservation, source measurement, bounded texture reduction, runtime hash, terrain support, collision and browser evidence.
