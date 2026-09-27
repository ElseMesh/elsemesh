# Stock playable character

Local and remote players use **Microsoft Rocketbox Male Adult 08** (MIT).
This is a library model imported and animated in Blender, not a scan of the user.
NPC Loz explicitly selects `scanned-explorer`; Joe and Marta remain unchanged.

Source: https://github.com/microsoft/Microsoft-Rocketbox
Licence: `public/models/characters/LICENSE-Rocketbox.md`.

## Asset

- 4,584 exported vertices; 7,364 triangles; 80 bones; three materials.
- 3,997,328-byte GLB, including textures and four animation clips.
- Colour, normal and derived roughness maps at 1024 pixels; opacity cards retain alpha.
- `idle`, `walk`, `run`, `helm` (seated) clips, crossfaded by existing player state.
- The original locomotion travels forward. Blender removes linear horizontal root
  travel while retaining hip sway, vertical movement and the donor's joint rotations.
- The source's gait uses its matching Rocketbox skeleton rather than the KIRI rig.

## Rebuild on MSI

All source and working files are on D:, under
`D:/Codex/Burning-Horizons-character-source/rocketbox-player`.
Download these files from the Rocketbox repository's `Assets` directory:

- `Avatars/Adults/Male_Adult_08/Export/Male_Adult_08.fbx`
- The seven `m014_*.tga` files from that avatar's `Textures` directory.
- `Animations/all_animations_max_motextr_static/m_idle_neutral_01.max.fbx`
- `Animations/all_animations_max_motextr_static/m_sit_chair_idle_neutral_01.max.fbx`
- `Animations/all_animations_max_motextr_xy/m_walk_neutral_01.max.fbx`
- `Animations/all_animations_max_motextr_xy/m_run_neutral_01.max.fbx`

Use the existing `fetch.sh` media/raw fallback or download the raw files directly.
Keep source downloads outside Git. Run `prepare_stock_textures.py SOURCE PREPARED`
with Python/Pillow. Then run the existing Blender `convert.py` with avatar FBX,
prepared texture directory, prefix `m014`, output GLB, and those four animation FBXs.
Set `BH_STOCK_PLAYER=1` and `BH_STOCK_BLEND` to the desired D: Blender working file.
This enables in-place motion and the runtime clip names without changing vendor builds.

`validate_stock.py OUTPUT_GLB REVIEW_DIRECTORY` runs in Blender and renders the
actual exported GLB from front and side in idle/walk/run/seated poses.
The current review is in `D:/Downloads/Stock-player-review`.

For an in-engine animation review, start Vite and `island-review-receiver.mjs`,
load the game with `?bench&noAudio`, and call `recordStockReview` from
`tools/video/stock-review.js` after startup. The camera and positions are
choreographed; this is an animation review, not live multiplayer evidence.
