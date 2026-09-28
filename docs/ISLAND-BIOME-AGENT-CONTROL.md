# Outer island biome recreation

**Author: Agent Control**

Agent Control now has a bounded, repeatable operation for two distinct visual outcomes. Island Five is a real forest island: its deterministic positions are converted into the existing `Vegetation` canopy record contract, which reuses the same detailed crown geometry, mapped leaf atlas, wind material and near/far impostor system as the original island. Its analytic ground combines broad ridges, crossed ridges and small hummocks, with relief faded smoothly into the beach.

Island Four is deliberately named **Cartoon Island**. Its forest uses exaggerated folded crowns, animated trunks, stylised banana plants with curved yellow fruit in bunches, and the established articulated cartoon monkey system. The villa remains present.

## Recreate operation

1. Place the bounded island inside the shared terrain domain and verify separation.
2. Define analytic shoreline and interior relief; require a measured interior height range above 8 metres.
3. For a realistic island, emit standard canopy records and append them before the shared `Vegetation` LOD objects are built.
4. Keep close tree collision and scanned bark grounded to the same height function.
5. For a cartoon island, keep its stylised meshes in a separate world system and declare the style in the group and material names.
6. Add fruit and wildlife only to explicit habitat trees, retain distance culling, then run focused tests and the production build.

## Learning ledger

| Agent Control attempted | Result | Codex correction | Generalisable lesson |
| --- | --- | --- | --- |
| Populate Island Five with standalone sphere crowns | Read as placeholders and did not match the forest behind | Replaced crowns with shared canopy records | Realistic additions should reuse the authoritative biome renderer rather than imitate it |
| Use a low nearly flat island profile | The silhouette read as a flat disc | Added multi-scale bounded ridges and required a measured relief range | Terrain shape needs a quantitative acceptance check as well as a shoreline check |
| Treat both outer islands as the same forest style | The user wanted one real island and one cartoon island | Declared separate realistic and cartoon recipes | Visual intent is part of the operation contract; do not homogenise distinct locations |

The operation is deterministic and testable. Runtime visual review remains a separate observed evidence step.
