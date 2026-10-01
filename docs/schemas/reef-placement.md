# Reef placement asset, version 1

`tidewater.reef-placement/1` (`TRP1`) is the portable placement-data format for the built-in Reef renderer. The SHA-256 covers the complete byte sequence; a signed `tidewater.static-reef/1` component references it using `placementAssetId` and provides `streamingBounds`. Each asset is a spatial chunk. The client can append decoded chunks to one shared Reef renderer, retaining the built-in Reef geometry, materials, species, and LOD path. The bytes do not contain mesh geometry, textures, shaders, fish, or collision data.

`tidewater.static-reef/1` interprets each record's `x`, `y`, and `z` as absolute world-space meters. It does not run procedural placement generation or sample terrain. `TRP1`'s header seed is provenance/generator metadata for the content; the static renderer does not use it to regenerate placements. The existing procedural island Reef continues to use its current deterministic runtime path.

All fields are little-endian. Version 1 has a 16-byte header followed by zero or more 64-byte records. The file length must equal `16 + count * 64` exactly.

## Header

| Offset | Size | Type | Meaning |
| --- | ---: | --- | --- |
| 0 | 4 | bytes | ASCII `TRP1` magic (includes format version) |
| 4 | 4 | `uint32` | Source/generator seed |
| 8 | 4 | `uint32` | Record count, 0–200,000 |
| 12 | 2 | `uint16` | Reef type count; must match the reader's version-1 type table (44) |
| 14 | 2 | `uint16` | Record size; must be 64 |

## Record

| Record offset | Size | Type | Meaning |
| ---: | ---: | --- | --- |
| 0 | 2 | `uint16` | Stable reef type ID |
| 2 | 1 | `uint8` | Model variant index, valid for the type |
| 3 | 1 | `uint8` | Reserved flags; must be zero |
| 4 | 4 | `float32` | `x`, world-space meters |
| 8 | 4 | `float32` | `y`, world-space meters |
| 12 | 4 | `float32` | `z`, world-space meters |
| 16 | 4 | `float32` | Uniform scale `s` |
| 20 | 4 | `float32` | X scale multiplier `sx` |
| 24 | 4 | `float32` | Y scale multiplier `sy` |
| 28 | 4 | `float32` | Z scale multiplier `sz` |
| 32 | 4 | `float32` | Quaternion `q.x` |
| 36 | 4 | `float32` | Quaternion `q.y` |
| 40 | 4 | `float32` | Quaternion `q.z` |
| 44 | 4 | `float32` | Quaternion `q.w` |
| 48 | 4 | `uint32` | Packed 24-bit color `c1` (upper 8 bits zero) |
| 52 | 4 | `uint32` | Packed 24-bit color `c2` (upper 8 bits zero) |
| 56 | 4 | `float32` | Per-instance seed, [0, 1] |
| 60 | 4 | `float32` | Flex amount, [-2, 2] |

Coordinates are finite and bounded to ±10,000 m. `s`, `sx`, `sy`, and `sz` must be finite and in `(0, 100]`. Quaternion components must be finite, each with absolute value at most 1.001, and squared length within 0.002 of 1. Color values must be integers in `[0, 0xffffff]`. Type IDs and variants must exist in the reader's table. Readers reject unknown flags, non-finite values, invalid bounds, unsupported type counts or record sizes, excess records, truncation, and trailing bytes.

## Stable type IDs

IDs are zero-based and use this exact table. The table is also exported as `REEF_TYPE_NAMES` from the client source.

| ID | Name | ID | Name |
| ---: | --- | ---: | --- |
| 0 | `slab` | 22 | `rubble` |
| 1 | `rock` | 23 | `grass` |
| 2 | `boulder` | 24 | `fan` |
| 3 | `lobes` | 25 | `plume` |
| 4 | `brain` | 26 | `lettuce` |
| 5 | `brainWide` | 27 | `wallPlate` |
| 6 | `starlet` | 28 | `wire` |
| 7 | `knobby` | 29 | `blackCoral` |
| 8 | `pillar` | 30 | `ear` |
| 9 | `elkhorn` | 31 | `barrelDeep` |
| 10 | `staghorn` | 32 | `fanDeep` |
| 11 | `finger` | 33 | `meadow` |
| 12 | `fire` | 34 | `halimeda` |
| 13 | `plate` | 35 | `penicillus` |
| 14 | `rod` | 36 | `bayRock` |
| 15 | `whip` | 37 | `baySlab` |
| 16 | `barrel` | 38 | `bayBoulder` |
| 17 | `tube` | 39 | `shoreRock` |
| 18 | `vase` | 40 | `starfish` |
| 19 | `rope` | 41 | `cucumber` |
| 20 | `urchin` | 42 | `conch` |
| 21 | `anemone` | 43 | `sargassum` |

Never reorder or reuse an existing ID. Adding a type changes the table count, which version-1 readers validate exactly; therefore adding a type also requires a new protocol and magic (for example `TRP2`), a new asset kind, and matching manifest feature support. Do not change the interpretation or binary layout of an existing field in place. Incompatible semantic changes follow the same versioning rule.

The encoder and decoder are `encodeReefPlacements(records, seed)` and `decodeReefPlacements(bytes)` in `src/network/ReefPlacements.js`. Their record object fields correspond directly to the record table: `{type, variant, x, y, z, s, sx, sy, sz, q, c1, c2, seed, flex}`.
