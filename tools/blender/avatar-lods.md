# Stock avatar LODs

The checked-in full stock GLBs are the inputs. Blender 4.3.2 generates each
level independently with the collapse decimator at 0.5 and 0.25, retaining
vertex weights, UVs, armatures and NLA animation tracks. Import and export use
30 Hz to preserve the source baked animation endpoints.

```sh
blender --background --factory-startup --python tools/blender/export-avatar-lods.py \
  -- --source public/models/characters --out /var/tmp/tidewater-avatar-lods
cp /var/tmp/tidewater-avatar-lods/*.glb public/models/characters/
node test/avatar-lod-assets.mjs
```

| Asset | Full triangles | Medium | Low |
| --- | ---: | ---: | ---: |
| stock-player | 7364 | 3682 | 1841 |
| stock-female | 8732 | 4366 | 2183 |

The test reads the actual generated GLBs through the runtime parser and checks
triangle reduction, all 80 joint names, inverse-bind count, normalized skin
weights, valid joint indices, all four clips and durations, channel counts,
finite animation values, UVs and the textured body/head/opacity materials used
by appearance tinting. Embedded textures retain their full resolution, so file
size and texture memory do not decrease proportionally to triangles.

These checks establish structural compatibility. They do not establish visual
quality during motion, correct tint rendering or live remote-client behavior;
those require rendering the levels and exercising the connected application.
