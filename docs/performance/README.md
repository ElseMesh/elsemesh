# Rendering qualification — Agent Control

27 September 2026. Baseline: `4d8b437`. Tests: MSI Windows PC, Edge 154,
Intel Arc Graphics. GPU times are timestamp queries, not an FPS guarantee.

## Review of Rebroad

Reviewed [rebroad/tidewater](https://github.com/rebroad/tidewater) at `59a2a52`.
Its Linux-only changes reduce canvas/internal/refraction resolution, disable SSR
and shadows, remove temporal AA, cap rendering at 24 fps, and fall back to a
default adapter when the high-performance adapter is unavailable.

Agent Control retained the adapter fallback and applied rendering budgets across
platforms. Burning Horizons retains temporal AA, the existing world, game physics,
avatar/network code, and a High option. Adaptive resolution reduces scale after
sustained overload, recovers after sustained headroom, and pauses between changes.
Explicit `?scale=` and manual scale changes disable adaptation. Benchmarks do too.

## Implemented

- Auto selects Balanced on desktop, Mobile for coarse-pointer/small-screen devices.
- Balanced: 75% internal scale, output budget 1,166,400 pixels, 35% refraction target,
  shadows retained, screen-space water reflections off.
- Mobile: 65% internal scale, output budget 518,400 pixels, 25% refraction target,
  sun shadow maps and screen-space water reflections off. Lighting, night boat
  lights, terrain, water, characters and gameplay remain.
- High: 100% internal scale, uncapped CSS-pixel output, shadows and reflections on.
- All profiles retain temporal anti-aliasing; Auto can lower internal scale to 50%.
- Cave geometry now has bounds and participates in normal view/shadow culling.
- 140 tunnel fish use four instanced batches; animation skips distant/above-water views.
- Cave textures are three shared 1K mipmapped maps (~2.45 MB download), with world
  projection, normal detail, ambient occlusion, roughness and wet darkening.
- Pressure enclosure has vertical glass sides, a semicircular crown and a solid
  foundation. Maglev guides sit above the base. The train has a separate curved
  glass monocoque, narrow structural ribs and low sills, with fish beyond both layers.
- Online hosting streams models, compresses text and supports ETag/304 revalidation.
  Hashed Vite bundles get immutable caching; mutable assets revalidate on every visit.

## Fixed 1280 × 720 output comparison

45 warm-up + 90 measured frames per view, fixed simulation step 1/60 s.
Values below are mean **GPU milliseconds per frame**. Lower is better.

| View | Previous 100% | New High 100% | New Balanced 75% |
|---|---:|---:|---:|
| Beach | 33.125 | 30.771 | 27.438 |
| Boat helm | 34.002 | 32.101 | 26.123 |
| Cave | 22.726 | 22.437 | 20.323 |
| Tunnel | 21.143 | 20.174 | 19.613 |

Balanced reduces GPU time by 17–23% outdoors and 7–11% in these interior views.
High reduces GPU time by 1–7% despite the added stone and glass detail. End-to-end
wall timings did not consistently improve in this small-resolution run; background
scheduling/thermal variability means these GPU reductions must not be reported as
the same percentage increase in live FPS. Source data: [before](msi-before.json),
[after with pass breakdowns](msi-after.json).

## Large output versus bounded output

Same new build, camera sequence and machine. This explicitly includes quality and
resolution tradeoffs, **not** an equal-image-quality comparison.

| Profile / output | Beach GPU / wall ms | Boat GPU / wall ms | Tunnel GPU / wall ms |
|---|---:|---:|---:|
| High / 2560 × 1440 | 63.503 / 80.557 | 75.463 / 83.861 | 45.970 / 70.370 |
| Balanced / 1440 × 810 | 28.383 / 33.639 | 30.259 / 33.959 | 19.295 / 20.277 |
| Mobile / 960 × 540 | 17.203 / 21.100 | 18.004 / 21.888 | 13.527 / 14.440 |

[Full data](msi-output-budgets.json). The mobile row runs a mobile rendering budget
on the **PC GPU**, not a physical phone. Physical Pixel/iOS performance, battery
use and a ten-device session remain **NOT TESTED**.

## Reproduce

Run `npm run dev`, open `/?bench&noAudio`, then in the development console:

```js
const { measure } = await import('/tools/performance/render-benchmark.js');
await measure(__app, __bench, 'high', 1280, 720);
await measure(__app, __bench, 'balanced', 1280, 720);
```

The harness stops gameplay and isolates flight/rail cameras before selecting views.
An initial run with the flight camera still active was rejected and excluded.
Shader compilation and the first cold launch are not covered by these warm-frame
measurements. This is a custom engine GPU benchmark, not a Lighthouse report.

## Release checks

- `npm test` and `npm run build` passed on MSI, including rendering-budget,
  tunnel-clearance, cave route, GPU smoke, hunger toggle, helicopter and HTTP cache tests.
- All **29** networking tests passed on hpubuntu. On Windows, the existing raw
  TCP/UDP reference-transport test stalled and was stopped; the other **28** tests
  passed when run without that case. The browser WebSocket tests passed on both hosts.
- A 390 × 844 browser emulation selected Mobile automatically, displayed the full
  title and rendered without logged GPU/shader errors. This is not a physical phone test.
- GitHub Pages deployment for `314e2d5` succeeded; Pages and hpubuntu served
  `main-B2tEzysx.js`. Public HTTPS/WebSocket movement relay passed. Cave-texture
  requests returned HTTP 200 initially and 304 when revalidated with their ETag.
- The edited Susie video is 809.9 seconds, 284,536,616 bytes, on D: outside Git.
  SHA-256: `7c6d4a6b5a63b894ee8436a9fe8ddfa5a914b146979b4ae4bcf2b845f78e52ac`.
  It is silent and chapter-edited; the appendix is a staged rendering inspection.
