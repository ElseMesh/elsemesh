# Warehouse Loft Reference Review

Author: AgentControl

## Reproduction and layout

The deterministic source is `src/world/PortalInteriorRecipe.js`: Y-up metres, fixed procedural placement, no random seed, and only box/cylinder/sphere/torus primitives. Runtime maps it directly; Blender maps engine `(x,y,z)` to `(x,-z,y)`. The protected circulation remains clear: mezzanine route `(3,.5) -> (3,10.9) -> (-3,10.9)` and ground route `(12,0) -> (12,10.5) -> (8,10.5)`. Portal entry, return state, and colliders remain on the established runtime path.

The visual pass retains aged brown brick, black steel, tall left glazing, clear rear-loft glass, warm lounge/dining/kitchen pools, furniture, foliage, thin mezzanine fascia/supports, and structural roof diagonals. The cancelled rear shelf-computer bank has been removed and replaced by one original restrained geometric wall artwork using cyan, magenta, and amber neon accents. The three principal machines retain distinct C64 breadbin, BBC red-key-row, and Sun pizza-box silhouettes, each on a full-depth desk whose four corner legs span from the mezzanine floor to the raised desktop underside. Low-backed chairs are tucked beneath and slightly offset from the desks to keep screens and keyboards visible from the intended walking-glance view.

## Retro displays

All display content is an original programmatic recreation described by the recipe's exported `screens` array. No screenshots, ROMs, OS downloads, copied bitmap assets, or external fonts are used. Runtime and Blender consume the same wording and colour metadata:

- C64: blue field, light-blue border and text, `COMMODORE 64 BASIC V2`, free-bytes line, `READY.`, and block cursor.
- BBC Model B: white on black, `BBC Computer 32K`, `BASIC`, `>`, and block cursor.
- Sun SPARCstation: `SunOS 4.1.3`, `OpenWindows`, overlapping generated File Manager and Terminal panels.

Runtime creates exactly three 512 x 384 canvas textures once during interior construction. C64/BBC cursor visibility is calculated in the material from `frame.time`: 0.5 seconds on, 0.5 seconds off. There are no per-frame canvas or texture uploads. All non-screen recipe geometry remains merged by material; only three named screen meshes are separated. Readable machine nameplates are generated as Blender text and the runtime cases carry matching descriptive object names.

The editable `.blend` source keys each cursor's `hide_render` at 24 fps for 12 frames on and 12 frames off. The exported GLB intentionally contains the still-on cursor frame because glTF does not carry Blender `hide_render` animation. This is an export-format limit, not OS emulation.

## Sources and interpretation

These primary manuals informed only identifying text, colours, and broad hardware character; their screenshots/assets were not copied:

- Commodore 64 User's Guide: https://www.commodore.ca/manuals/c64_users_guide/c64-users_guide-01-setup.pdf
- Acorn BBC Microcomputer Service Manual: https://acorn.huininga.nl/pub/docs/manuals/Acorn/BBC%20B/BBC%20Microcomputer%20Service%20Manual.pdf
- Sun OpenWindows Version 3 Installation and Start-Up Guide: https://www.bitsavers.org/pdf/sun/openWindows/Open_Windows_Version_3_Installation_and_Start-Up_Guide_Sep91.pdf

## Commands and verification boundary

The governed acceptance command is `coding.test`; its actual result is recorded by Agent Control rather than anticipated here. The standalone asset procedure is:

```sh
npm run build
node tools/export-portal-recipe.mjs /tmp/portal-recipe.json
blender --background --python tools/blender/build-portal-interior.py -- /tmp/portal-recipe.json /tmp/portal-interior
```

The Blender command validates primitive bounds, saves `portal-interior.blend`, exports `portal-interior.glb`, and writes the bounded 1100 x 900 Eevee review render `portal-interior.png`. The configured review camera is `(-4,9.5,1.7)`, aimed at `(-3,-9,3.5)`, with a 26 mm lens. Generated GLB artwork consists of embedded mesh text and panels, so it has no PIL dependency.

Static checks can prove descriptor sharing, supported shapes, material/object budgets, build validity, and preservation of declared routes. They cannot prove final visual quality, in-engine navigation feel, visibility from every view, or both live cursor phases. Those require Codex reviewer inspection of the render, the running engine, and cursor states separated by at least 0.5 seconds. Native Computer Use remains unqualified until that evidence exists.

## Performance and future procedure

The recipe must remain below 45 materials and 12,000 objects; acceptance reports the actual counts. Runtime cost added by this pass is three small immutable RGBA textures, three screen draw meshes, and two inexpensive time comparisons for cursor masks. Future AgentControl updates should edit shared descriptors first, regenerate Blender artifacts with the command above, run `coding.test`, then hand the render and live navigation/cursor checks to the reviewer. Do not claim visual acceptance from structural checks alone.
