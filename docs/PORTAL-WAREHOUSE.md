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

After one uninterrupted minute inside, Esmie from Edinburgh gives a faint, roughly 30-second account of the islands' wrecks, hidden treasure and connected past. A different childhood memory is selected about every five minutes after that, with immediate repeats prevented. The memory pool mentions the Royal Mile, Calton Hill, Edinburgh Castle, the Water of Leith, Greyfriars Kirkyard, Arthur's Seat and Waverley Station.

Speech uses the browser's installed speech service, preferring a Scottish or British English voice. Volume, rate and pitch are deliberately subdued. The caption is dismissible, speech respects the game mute setting, and timing pauses during C64 use or while the browser tab is hidden. If speech is unavailable, the caption remains the fallback.

## Verification

`test/portal-warehouse.mjs` validates the retained circulation zones, reference details, programmable BASIC execution, queued terminal input, and Esmie timing/content. Runtime evidence is captured on a Windows WebGPU browser; the capture camera and accelerated Esmie timer are evidence fixtures and do not alter production timing.
