# Player avatars

Use **Choose your avatar** before creating/joining a room, or **K / Avatar** in-game.
Save applies the choice; Cancel restores it. Appearance is stored under `elsemesh.avatar.v1`
in this browser (not an account). Each running player has their own appearance snapshot.
Refresh older game tabs after deployment to load the chooser and new assets.

## Initial choices

- Microsoft Rocketbox Male Adult 08: short hair, shirt and trousers.
- Microsoft Rocketbox Female Adult 01: ponytail, shirt and jeans.
- Shirt, trousers, skin and hair each have six swatches and a custom colour control.
- Skin tone is independently selectable. There are no ethnicity-based stats or racial labels.
- Face shape and hairstyle are currently tied to these two character presets; this is
  not yet a modular hair/face sculpting system. The lobby image is a style reference,
  not a recoloured render. On foot, the in-game chooser previews the actual avatar.
- Idle, walk, run and seated animation clips are retained. NPC Loz keeps the KIRI scan.

## Network

`elsemesh.player-state/1` includes optional `appearance` with exactly `style`, `shirt`,
`trousers`, `skin`, `hair`. Style is an allowlisted ID; colours are lowercase six-digit
hex. The relay validates it and refuses arbitrary models/URLs. State remains below
the existing 4096-byte cap. Old packets without appearance use the default male.
Appearance travels on periodic state updates, so reconnects and late joins acquire
it without a separate inventory protocol. Unsaved local previews are not broadcast.

Async model swaps retain the old model until ready and discard superseded loads.
Colour changes update per-instance uniforms, never shared source data or NPC materials.

## Assets and reproduction

Both avatars and their matching m_/f_ idle, walk, run and seated FBXs are from
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), MIT;
the licence is at `public/models/characters/LICENSE-Rocketbox.md`. Source exports
remain on D:, outside Git. No personal scan is used for playable characters.

1. Download the avatar FBX and original TGA textures from the official repository.
2. Run `python tools/characters/prepare_stock_textures.py SOURCE PREPARED PREFIX`
   with `m014` (Male Adult 08) or `f001` (Female Adult 01).
3. Run `python tools/characters/avatar_masks.py PREPARED PREFIX`.
4. Set `ELSEMESH_STOCK_PLAYER=1`, `ELSEMESH_AVATAR_MASKS=1`, and `ELSEMESH_STOCK_BLEND` to a D: `.blend`
   output. Run Blender in background with `tools/characters/convert.py`, passing the
   avatar FBX, prepared texture directory, prefix, output GLB, and four donor FBXs.
   Walk/run donors are in `all_animations_max_motextr_xy`; idle/seated in `_static`.

The mask tool marks UV regions in the otherwise-unused ORM red channel: 0 unchanged,
51 shirt, 102 trousers, 153 skin, 204 hair. Green remains roughness, blue metallic.
These masks are UV-specific and must not be applied blindly to different models.
Runtime shading preserves texture lightness, folds and normal maps. Colour masks
are approximate at hairlines and garment boundaries; they do not alter geometry.

## Checks

`npm run test:network` covers appearance validation/storage, late-state handling,
required GLB skeleton/clips/maps, and ten WebSocket clients exchanging distinct
appearances with every other peer. This is protocol coverage, not ten physical
devices or a ten-GPU performance qualification. `npm run build` builds both lobby
and game. Visually inspect both models and strong colour contrasts after mask edits.

The September 27 check rendered both models with the real game skinning/material
runtime in `tools/characters/avatar-review.html`; female walk/run knee bending and
contrasting skin/clothing colours were visually checked. Lobby save/reload was
verified in-browser. Two full-world preview attempts hit a Windows WebGPU
`E_OUTOFMEMORY` / driver device-loss error during startup, including at reduced
render resolution. Full-world visual qualification remains incomplete on this machine.
