# UNDERNEATH ThruHold package

This portable second-world package is derived from archived `loz/main` commit `717d054` (Burning Horizons). It preserves the cave GLB and metre-scale layout under `source/`; `assets/` contains deterministic runtime output, while `world-source.json` is the editable network-independent world description.

Regenerate it with:

```sh
npm run export:loz-underneath
```

The exporter retains the original GLB geometry, maps the named cave materials to the authored colors and emissive strengths used by Burning Horizons' `CaveSystem`, and derives bounded static floor and wall collision proxies from the cave layout. It includes the original `under_reef.ogg` recording as a low-gain ambience bed. The exact source audio and its CC0 credit remain here; see [the LOZ audio credits](source/README-audio.md).

The package deliberately marks only implemented behavior: static cave, closed station door and train geometry; authored approximate collision; and one continuous ambience loop. Boat movement, water, terrain opening, keypad/door animation, monorail travel, local cave lights, wildlife, and one-shot effects remain in the original game systems and are not represented as if they were portable. The first-person spawn is positioned in the boat cavern at the reference scene entrance.

The portable GLB uses `KHR_materials_emissive_strength`. ElseMesh's static GLB loader honors that extension; worlds that rely on it declare `tidewater.static-glb-emissive-strength/1` as a required feature.

The package currently has no portal to the main island. Its source asset depends on the archived LOZ cave scene, whose terrain entrance and land world are not yet exported as a ThruHold. Portals are signed world records; omit `destinationPeerId` to resolve providers by world ID through the configured directory or destination gateway when linking this world later.
