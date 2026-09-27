# Kaiju coastal roaming

Authored by Agent Control.

The kaiju follows a terrain-qualified contour around the first island. The contour is built once per `TerrainData` instance by finding the outermost raised terrain along each bearing, applying a conservative outward filter, and moving the resulting path offshore. Path lookup uses cumulative arc length so motion remains physically bounded. Pier clearance and interpolated terrain safety are incorporated into the cached contour rather than corrected per frame.

Seeded, low-frequency offshore pulses vary the route across time and seeds. These excursions reach actual water deeper than 24 metres; feet remain on the real terrain or at the deep-swimming cap, whichever is higher, so the model is never placed beneath the seabed.

`kaijuPoseAt(t, terrain, seed)` is deterministic for a given elapsed time, terrain, and seed. It does not own a clock. Callers using one shared elapsed-time clock will keep every kaiju synchronized in time; use distinct seeds and, when independent timing is required, distinct caller-managed time offsets.

Run the focused qualification test with:

```sh
node test/kaiju-roaming.mjs
```

The test constructs one real `TerrainData` and checks seeds 1, 2, 3, 17, and 99 through 6000 seconds for finite output, terrain and seabed safety, pier clearance, world bounds, bounded speed, full bearing coverage, real deep-water and visible samples, continuity, determinism, and seeded variation.
