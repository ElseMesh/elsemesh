# Trees, fruit and canopy wildlife

**Author: Agent Control — 27 September 2026**

## Where to look

Sail to the third island and follow the path from **Loz's Helicopter Rental** to the helipad. Banana clumps grow beside the path. Look up into the lower branches of the nearby mango trees: four small monkeys patrol their branches, rest and turn back. The first island's existing banana groves also carry fruit; coconut palms retain their coconuts.

## Materials and geometry

- Shared Poly Haven CC0 photographed bark: palm leaf-scar fibres and fissured broadleaf bark. Normal maps and packed AO/roughness maps give relief and lighting response without extra displacement geometry.
- Six bounded JPEG maps total 1,465,855 bytes; about 24 MiB of uncompressed RGBA mipmapped GPU texture storage. Palm 512×1024; broadleaf 1024×1024.
- Third-island tree crowns use folded lance-shaped leaves with midribs instead of solid green spheres. Existing progressive trunk bending and crown movement remain.
- Each mature banana pseudostem carries **28 curved, tapered bananas in four hands**, an arched stalk and a maroon terminal blossom. Fruit follows the plant's existing wind deformation and distance fade.
- Eight mango trees carry clusters of fruit. Their branches attach to the articulated trunks, so foliage, fruit and monkeys follow the same wind transforms.
- Monkeys are original stylised full-body procedural models with face, ears, hands, feet, bent limbs and articulated tails. They use four instanced material batches; all mangoes use one further batch. These are ambient local wildlife, not network-authoritative interactive NPCs.
- Fruit is decorative in this release; picking/eating fruit has not been added. Hunger remains off by default.

## Budgets and tests

Wildlife batches stop drawing beyond 110 m (monkeys) / 90 m (mangoes). Their supporting branch details hide beyond 120 m. Banana clumps retain their 100–120 m fade. Leaf geometry and bark textures are shared.

`npm test` includes patrol position/heading continuity, finite instance matrices, buffer capacity, wind-parent attachment, distant culling and banana geometry checks. Browser review checks actual shader compilation and visible fruit, bark, leaf silhouettes and monkey animation. PC mobile-profile tests are not physical phone qualification.

On MSI Intel Arc / Edge, a fixed 1280×720 wildlife close-up (30 warm-up, 90 measured frames) averaged **26.08 ms GPU / 33.92 ms wall** on Balanced and **20.38 ms GPU / 26.99 ms wall** on the Mobile profile. These are same-PC profile measurements, not a before/after speedup claim or a physical mobile result. Raw data: [wildlife benchmark](performance/wildlife-2026-09-27.json). Browser review reported no WebGPU errors.

The silent 50-second review is saved outside Git at `D:/Downloads/Burning-Horizons-Trees-Monkeys-Bananas.mp4`; stills and source WebM are in `D:/Downloads/Burning-Horizons-Wildlife/`.

## Evidence capture

Run `node tools/video/wildlife-receiver.mjs`, then load the local game with `?bench&noAudio`. In its development console:

```js
const review = await import('/tools/video/wildlife-review.js');
await review.recordWildlife();
await review.wildlifeShot('monkeys');
await review.wildlifeShot('bananas');
await review.wildlifeShot('bark');
```

This records a 50-second silent in-engine inspection with staged camera cuts. It writes only to `D:/Downloads/Burning-Horizons-Wildlife` through a loopback-only receiver. Close the receiver after capture. External video conversion is optional.

Texture provenance is recorded in [vegetation credits](../public/textures/vegetation/CREDITS.md).
