# UNDERNEATH ThruHold package

This portable second-world package is derived from archived `loz/main` commit `717d054` (Burning Horizons). It preserves the cave GLB and metre-scale layout under `source/`; `assets/` contains deterministic runtime output, while `world-source.json` is the editable network-independent world description.

Regenerate it with:

```sh
npm run export:loz-underneath
```

The exporter retains the original GLB geometry, maps the named cave materials to the authored colors and emissive strengths used by Burning Horizons' `CaveSystem`, and derives bounded static floor and wall collision proxies from the cave layout. It includes the original `under_reef.ogg` recording as a low-gain ambience bed. The exact source audio and its CC0 credit remain here; see [the LOZ audio credits](source/README-audio.md).

The package deliberately marks only implemented behavior: static cave, closed station door and train geometry; authored approximate collision; and one continuous ambience loop. Boat movement, water, terrain opening, keypad/door animation, monorail travel, local cave lights, wildlife, and one-shot effects remain in the original game systems and are not represented as if they were portable. The first-person spawn is positioned in the boat cavern at the reference scene entrance.

The portable GLB uses `KHR_materials_emissive_strength`. ElseMesh's static GLB loader honors that extension; worlds that rely on it declare `tidewater.static-glb-emissive-strength/1` as a required feature.

The package carries a reciprocal, open-view portal to `tw-world:example-island` at the transformed cave entrance. Its entry `[0, 4.2, 8]` maps to the island portal at `[-340, 4.2, 80]`; both worlds resolve the destination by signed world ID without pinning a provider PeerID. The profile end-to-end test starts each package under a separate owner identity, discovers providers through the local DHT, and fetches the cave's portal-preview asset before crossing.
