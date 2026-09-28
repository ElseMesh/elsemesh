# Portal warehouse

Author: **Agent Control**

The signed warehouse loft on Island 3 is Building #001. It remains separate from the imported abandoned Building #002.

## Interior

The production recipe in `src/world/PortalInteriorRecipe.js` builds an industrial shell with:

- CC0 scanned brick and concrete maps, metre-scale world projection and bounded 1K textures;
- a polished tiled ground floor with subtle damp variation and reflections;
- rusted black RSJs, splice plates, rivets and exposed roof members;
- a lounge, dining table, kitchen, rugs, pictures, plants and warm task lights;
- illuminated stairs with chrome details and glass ending below the sloping handrail;
- a glass-fronted mezzanine with swivel chairs, books, detailed retro-computer desks, a black library wall and an original period-inspired rainbow emblem.

Merged material batches keep the procedural detail practical for the WebGPU runtime. The original circulation, arrival point, stair footprint, mezzanine footprint and exit remain unchanged.

## Commodore 64 terminal

Walk to the Commodore 64 on the mezzanine and press **E**. The terminal opens full screen and suspends world controls. Log in with a local display name, then enter numbered BASIC lines. Useful commands include:

```text
10 PRINT "BURNING HORIZONS"
20 FOR I=1 TO 5
30 PRINT I
40 NEXT I
LIST
RUN
SAVE "DEMO"
LOAD "DEMO"
```

The interpreter is the MIT-licensed BASIC-M6502-TS browser build derived from Microsoft's open-source 6502 BASIC. The integration does not ship proprietary Commodore ROMs. `SAVE` and `LOAD` use browser local storage. **Leave** or **Escape** returns to the game.

## Esmie

After one uninterrupted minute of play, Esmie from Edinburgh gives a faint, 29.6-second account of the islands' wrecks, hidden treasure and connected past. Her voice belongs to the entire game rather than this warehouse: a different childhood memory is selected about every five minutes wherever the player is, with immediate repeats prevented. The memory pool mentions the Royal Mile, Calton Hill, Edinburgh Castle, the Water of Leith, Greyfriars Kirkyard, Arthur's Seat and Waverley Station.

The user-selected Alba voice (`en_GB-alba-medium.onnx`) was generated through the Sentinel Agent Control speech service. The eight qualified WAV files and a non-secret hash/provenance manifest are bundled under `public/audio/esmie/`, so no speech credential or provider endpoint is exposed to the browser. Playback is deliberately quiet, non-spatial and heard as an internal voice. There is no character, caption, speech bubble, toast or dialogue panel. Audio respects the game mute setting and pauses while the browser tab is hidden.

## Agent Control reference-detail operation

The second reference pass adds arched window transoms, roof plates and rivets, mixed cushions and a sofa throw, floor and task lamps, an ottoman, kitchen backsplash, oven, bottles and pendant lights, dining place settings and flowers, richer woven rugs, desk drawers and media, stereo equipment, speakers, small plants, denser graffiti and mezzanine reading chairs. These additions reuse the existing merged material batches and do not change the protected arrival, stair, mezzanine or C64 interaction routes. See `tools/portal_interior/reference-detail-v1.json` and [the learning ledger](PORTAL-WAREHOUSE-DETAIL-LEARNING.md).

## Verification

`test/portal-warehouse.mjs` validates the retained circulation zones, reference details, programmable BASIC execution, queued terminal input, Esmie timing/content, the absence of popup code, Sentinel/Alba provenance, WAV structure and the 28–32 second introductory duration. Runtime evidence is captured on a Windows WebGPU browser; the capture camera and accelerated Esmie timer are evidence fixtures and do not alter production timing.
