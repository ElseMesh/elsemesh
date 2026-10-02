# Content-addressed assets

`assetId(bytes)` returns `sha256:<hex>`. A node requests that identifier, receives bounded bytes, computes SHA-256 and accepts only an exact match. The proof caps accepted assets at 8 MiB and messages at 64 KiB; these are small qualification limits, not suitable for full GLB files. Production transfer needs chunking, per-chunk bounds, total-size declaration, timeouts, quotas and verified assembly before exposing an asset to the renderer.

The signed sector manifest separates publisher NodeID, sector, version and content hashes. Current authority is separate state; route/location is supplied by discovery. A valid hash does not grant publication or simulation authority. World Forge output stays a proposal until policy accepts it.

`test/network-foundation.mjs` and the physical two-node demo both prove corrupt-byte rejection. The repository's current GLB and texture workflow is untouched.
