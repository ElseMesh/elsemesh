# Example Island Package

`world-source.json` and `assets/<sha256>` are the checked-in, deterministic static terrain package generated from the same `TerrainData` source used by the playable island.

Regenerate it with:

```sh
npm run export:island
```

The exporter writes a 512 by 512 grid of the island heightfield as a GLB with normals and vertex colors. It samples the fixed terrain seed `7`; the output hash is the asset ID. `SOURCE_DATE_EPOCH` can pin the source document timestamp when intentionally refreshing the package. Without it, regeneration preserves the checked-in timestamp.

The package is an initial transportable terrain layer, not a full conversion of the playable island. Water, vegetation, village props, wildlife, boat behavior, fishing, and other dynamic systems remain authored and simulated by the JavaScript game. Future package revisions should add those contents as separate static GLB instances or explicit, versioned runtime components rather than baking away their existing source behavior.

To serve it from a node, import the checked-in GLB with `worldd --import-asset`, confirm the printed SHA-256 matches the source document, convert the source with `tools/world-source-to-manifest.mjs`, then sign the result with that node's persistent identity.
