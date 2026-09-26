# KIRI scan to Burning Horizons character

This pipeline keeps the KIRI download untouched and generates a separate,
skinned game asset. Use Blender 4.5 or newer. On this workstation, Blender and
all working files are on `D:`. The Windows character smoke test also uses
FFmpeg to decode the embedded texture.

The walk and run clips come from a reduced motion-only copy of GDQuest's
[Mannequiny v0.4.0](https://github.com/gdquest-demos/godot-3d-mannequin/releases/tag/v0.4.0)
Blender file under CC BY 4.0. See `third_party/ATTRIBUTION.md`. The script
`prepare_motion_donor.py` reproduces this copy from the original download.
The retargeter maps hip, knee, ankle and arm motion onto the scanned mesh's
own rig; a texture transfer to the mannequin would not preserve the person's
shape or UV layout.

## Commands (PowerShell)

```powershell
$blender = 'D:\Codex\blender-portable\blender-4.5.10-windows-x64\blender.exe'
$source = 'D:\Codex\Burning-Horizons-character-source\project-2-20260926\extracted\3DModel.obj'
$work = 'D:\Codex\Burning-Horizons-character-source\project-2-20260926'
$donor = 'D:\Codex\Burning-Horizons-character-source\donors\mannequiny-v0.4.0\mannequiny-0.4.0.blend'
$env:BH_TMPDIR = "$work\work"
New-Item -ItemType Directory -Force -Path $env:BH_TMPDIR | Out-Null

& $blender -b $donor -t 4 --python tools/character_pipeline/inspect_animation_donor.py -- 'D:\Codex\Burning-Horizons-character-source\donors\mannequiny-v0.4.0\report.json'
& $blender -b $donor -t 4 --python tools/character_pipeline/prepare_motion_donor.py -- tools/character_pipeline/third_party/mannequiny-motion.blend
& $blender -b -t 4 --python tools/character_pipeline/inspect_scan.py -- $source "$work/evidence"
& $blender -b -t 4 --python tools/character_pipeline/build_character.py -- $source tools/character_pipeline/project-2.json "$work/build"
& $blender -b -t 4 --python tools/character_pipeline/validate_character.py -- "$work/build/scanned-explorer-work.blend" "$work/validation"
& $blender -b -t 4 --python tools/character_pipeline/inspect_weights.py -- "$work/build/scanned-explorer-work.blend"
Copy-Item -LiteralPath "$work/build/scanned-explorer.glb" -Destination public/models/characters/scanned-explorer.glb
node test/character-smoke.mjs public/models/characters/scanned-explorer.glb "$work/validation/engine-idle.png" idle
npm test
npm run build
```

For a side-view moving walk preview, set `FRAMES=60`, `STEP=0.04166667`,
`TRAVEL_METERS=0.58`, then run `test/character-smoke.mjs` with `walk 90`.
Render a front view with `walk 0` to check that a shoe does not swing sideways.

For a moving walk preview, set `FRAMES`, `STEP`, `TRAVEL_METERS`, and `CAM`
before running `test/character-smoke.mjs` with the `walk` clip. The output
pattern `walk.png` becomes `walk_0.png`, `walk_1.png`, and so on. Encode those
frames with FFmpeg using their frame rate. The preview is a renderer test of
the character animation; it does not replace an in-game traversal check.

Keep the downloaded ZIP and extracted files outside Git. `inspect_scan.py`
must run before `build_character.py`; it writes the baseline JSON, six
untouched views, and an imported `.blend`. The build script imports the source
again, retains an unedited `KIRI_SOURCE_UNTOUCHED` collection, removes only
components explicitly listed in the character config, normalises height and
orientation, decimates, resizes a copied texture, makes a humanoid armature,
binds and refines weights, generates idle/walk/run/helm clips, and exports GLB.
`validate_character.py` renders neutral, locomotion, seated, and joint stress
poses. The game retains its procedural avatar as a load-failure fallback.

For another scan, make a new config after reading its untouched report and
evidence. Never reuse a `remove_components` entry blindly: its rank and face
count are assertions, and a mismatch aborts the build. Different scan poses
may require adjusted bone locations and arm-weight bands in the script. GLB
exports with a usable rig can be inspected by `inspect_scan.py`; this build
script currently creates a new rig for a single unrigged mesh.

The current KIRI link provided a high-poly OBJ with one colour texture. It
did not provide quad topology, PBR maps, or a KIRI armature. The pipeline
records those absences. It does not claim quad retopology or PBR generation.
