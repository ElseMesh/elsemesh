# Example Island Package

`world-source.json` and `assets/<sha256>` are the checked-in, deterministic static package generated from the same terrain, village layout, rock placement, and debris placement code used by the playable island.

Regenerate it with:

```sh
npm run export:island
```

The package contains:

- A 512 by 512 terrain GLB with normals, vertex colors, and a matching heightfield collision declaration.
- Deterministic static village, pier, boardwalk, harbor, and prop geometry exported from the same CPU-side builders as the game, with 394 authored walkable and solid box colliders. Its GLB preserves the authored per-vertex tints and material batches; the game's GPU-baked tile textures, moving sign/lantern details, and GPU-only fish props are not included yet.
- The four CC0 scanned debris assets already used by the procedural scene: dead quiver trunk, two branches, and lambis shell. The exporter keeps their LOD1 geometry and embeds each albedo map in a single-mesh GLB.
- Deterministically placed debris instances from the existing `DebrisPlacer`, including full collision-free quaternion transforms. The exporter shares the playable world's CPU vegetation-placement records, so litter, logs, and other debris keep clear of the same plant trunks; vegetation geometry itself, water, the boat, wildlife, fishing behavior, and other dynamic runtime components are not packaged yet.

The assets are content-addressed by SHA-256 and their IDs are recorded in the world source. The source sets a 64 MiB aggregate package budget. `SOURCE_DATE_EPOCH` can pin the source document timestamp when intentionally refreshing the package; otherwise regeneration preserves the checked-in timestamp. Repeated exports must produce byte-identical source and asset bytes.

This is a transportable static example world, not a replacement for the playable procedural JavaScript island. The existing game remains the complete, interactive example; this package demonstrates the content that a world node can host independently. Original scanned model files and their CC0 credits remain in `public/models/debris`.

To serve it from a node, import the source GLBs once with `worldd --import-asset` to obtain their IDs, convert the source with `tools/world-source-to-manifest.mjs`, and sign the result with the owner's persistent identity. Then install the complete generated package from its asset directory:

```sh
worldd --data ./node --manifest ./world.signed.json \
  --import-package ./worlds/island/assets
```

The package importer verifies that every file matches the signed manifest and that the directory has no missing or extra files before adding content to the node store. A neighbor can use the same operation only when the owner-signed manifest grants that node `content-cache`.
