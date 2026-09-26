# First scanned playable character

The player's exterior avatar now loads the KIRI scan as a skinned GLB. It
follows the existing player and boat transforms, crossfades between idle,
walk, run and helm clips, and is hidden near the first-person camera as the
previous avatar was. The original procedural avatar remains a fallback if the
GLB cannot load. No terrain, sea, boat physics, map, or UNDERNEATH geometry
was changed.

## Provenance and untouched source

- Supplied KIRI project: `Project 2`, Featureless Scan, OBJ, high polygon
  count, 4K texture, object masking off.
- Shared download: `https://www.kiriengine.app/share/download/2be6fa5a4ed549ec93fb01edee28641d`.
- Untouched archive on D: `D:\Codex\Burning-Horizons-character-source\project-2-20260926\kiri-project-2-source-obj.zip`.
- Archive SHA-256: `194a9d562f2fbc92f691d66ce5f545dbdffa1827e5b0b7272b18a8ff1b8ec839`.
- Full baseline report, imported Blender file, and five textured views plus
  wireframe are under `D:\Codex\Burning-Horizons-character-source\project-2-20260926\evidence`.
- The personal source archive and `.blend` files are deliberately outside
  the public game repository. The runtime GLB is in
  `public/models/characters/scanned-explorer.glb`.

## Measured asset comparison

| Measurement | KIRI OBJ source | Game GLB |
| --- | ---: | ---: |
| Geometry file | 43,595,589 bytes OBJ | 10,907,956 bytes GLB including texture, skin and clips |
| Vertices | 192,491 | 39,968 |
| Triangles | 384,968 | 79,999 |
| Meshes / materials | 1 / 1 | 1 / 1 |
| Texture | 1 JPEG, 4096 × 4096 | 1 packed colour image, 2048 × 2048 |
| UV | 1 layer | 1 layer |
| Rig / animation | none / none | 17 bones / idle, walk, run, helm |
| Non-manifold edges | 198 | 121 |

The source has ten connected components. Visual inspection identified the
706-face piece beside the right arm as detached scan debris; only that piece
was removed from the working duplicate. Small remaining disconnected details
were kept. The body source bounds were 4.1904 Blender units high, with an
offset origin; the game copy is grounded at 1.78 m. The source faced Blender
`+X`; the export faces game `+Z`. The original source was not changed.

The OBJ has triangular topology and only an albedo image connected to base
colour. It has no normal, metallic, roughness or occlusion textures. The
supplied export has no KIRI-generated rig, so the Blender pipeline generated
one and validated deformation in neutral, walking, running, seated and joint
stress poses. It is a practical game rig, not a hand-built facial or finger
rig. The walk and run clips now sample the CC BY 4.0 Mannequiny motion donor
credited in [CREDITS.md](../CREDITS.md). The sampled lower-leg bend reaches
69.9 degrees on this rig. Blender geometry checks on sampled walk frames put
the lowest shoe vertex 0.005 m above the ground plane. Shoulder range and
leg separation remain limited because the source was scanned with arms down
and legs close together. The updated GLB was rendered by the game's own
`SkinnedModel` loader; the earlier version was also checked in the live beach
and boat scene.

The KIRI export link offered a completed OBJ package, not export controls.
The Pixel control route was offline during this work, so Quad Mesh, PBR
Materials and Generate Rig could not be selected in the KIRI app. A future
rigged or quad export can be inspected without replacing this untouched
source or the qualified game asset.

## Rebuild and verify

See [`tools/character_pipeline/README.md`](../tools/character_pipeline/README.md)
for commands. The source report and validation images stay on D:. Run the
character smoke test, `npm test`, and `npm run build` after changing the
asset or integration. The game shows the scan to other players/cameras;
normal walking remains first person at the existing camera position.
