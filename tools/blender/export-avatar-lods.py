"""Blender 4.3: rebuild animated stock avatar LODs from the full GLBs.

blender --background --factory-startup --python tools/blender/export-avatar-lods.py \
    -- --source public/models/characters --out /var/tmp/avatar-lods

Each level starts from the full mesh; collapse interpolation retains UVs and
vertex groups. Applying only DECIMATE leaves the armature and NLA clips intact.
"""
import argparse
import os
import sys

import bpy

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
os.makedirs(args.out, exist_ok=True)
for name in ('stock-player', 'stock-female'):
    for level, ratio in (('medium', 0.5), ('low', 0.25)):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        # Stock clips are baked at 30 Hz. Set this before import so the importer
        # and NLA exporter retain their original endpoints without 24 Hz rounding.
        bpy.context.scene.render.fps = 30
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(os.path.join(args.source, name + '.glb')))
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
        before = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
        for obj in meshes:
            modifier = obj.modifiers.new('Avatar LOD collapse', 'DECIMATE')
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        after = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
        bpy.ops.export_scene.gltf(
            filepath=os.path.abspath(os.path.join(args.out, name + '-' + level + '.glb')),
            export_format='GLB', export_animations=True,
            export_animation_mode='NLA_TRACKS', export_skins=True,
            export_all_influences=False, export_yup=True,
        )
        print(f'AVATAR_LOD {name} {level}: {before} -> {after} triangles')
