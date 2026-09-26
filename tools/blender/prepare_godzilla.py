"""Make Steam79's Godzilla 2014 a compact, rigged, 24 m game character.

Run with Blender 4.5: blender -b --python tools/blender/prepare_godzilla.py --
    --source D:/Downloads/godzilla_2014.glb
The source remains on D: and is not checked into this repository. Attribution is
in public/models/godzilla/CREDITS.md.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
opts = parser.parse_args(args)
root = Path(__file__).resolve().parents[2]
out = root / 'public' / 'models' / 'godzilla'
out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(opts.source).resolve()))
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
if not meshes:
    raise RuntimeError('Source GLB has no mesh')

# Sketchfab's export is split into many 65k-vertex mesh chunks. Bake its empty
# hierarchy to world space, then reduce geometry before joining those chunks.
source_tris = 0
for obj in meshes:
    source_tris += sum(len(p.vertices) - 2 for p in obj.data.polygons)
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.data = obj.data.copy()
    obj.data.transform(world)
    obj.matrix_world.identity()
    ratio = 0.11 if 'Skin' in obj.name else 0.65
    if len(obj.data.polygons) > 250:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new('Game triangle budget', 'DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)

bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = 'Steam79_Godzilla_2014'

# Source coordinates are Blender Z-up, -Y forward, with a ~108 unit standing
# height. glTF's Y-up conversion then gives the game a +Y-up, -Z-forward model.
zmin = min(v.co.z for v in body.data.vertices)
zmax = max(v.co.z for v in body.data.vertices)
scale = 24.0 / (zmax - zmin)
body.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((0, 0, -zmin))))
body.data.update()

# The downloaded GLB has no skin or animation. Build a restrained game walk rig
# with soft spatial weights, keeping the creator's sculpt and material textures.
names = ['Root', 'Torso', 'Head', 'Leg.L', 'Leg.R', 'Arm.L', 'Arm.R', 'Tail']
groups = {n: body.vertex_groups.new(name=n) for n in names}
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x-a)/(b-a)))
    return t*t*(3-2*t)

for v in body.data.vertices:
    x, y, z = v.co
    leg = (1-smooth(7.2, 11.5, z)) * smooth(1.7, 3.1, abs(x)) * (1-smooth(5.0, 10.0, y))
    arm = smooth(10.2, 12.0, z) * (1-smooth(17.0, 19.0, z)) * smooth(3.0, 4.7, abs(x)) * (1-smooth(0.0, 5.0, y))
    head = smooth(17.5, 21.0, z) * (1-smooth(3.0, 8.0, y))
    tail = smooth(7.0, 15.0, y) * (1-smooth(7.0, 12.0, abs(x)))
    # These regions overlap at the joints. Normalisation leaves some torso
    # influence there, avoiding hard cuts through the dense sculpt.
    special = min(0.92, leg + arm + head + tail)
    base = 1 - special
    raw = {'Torso': base, 'Head': head, 'Tail': tail}
    raw['Leg.L' if x >= 0 else 'Leg.R'] = leg
    raw['Arm.L' if x >= 0 else 'Arm.R'] = arm
    total = sum(raw.values())
    for name, weight in raw.items():
        if weight > 0.001:
            groups[name].add([v.index], weight / total, 'REPLACE')

arm_data = bpy.data.armatures.new('GodzillaWalkRig')
rig = bpy.data.objects.new('GodzillaWalkRig', arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
spec = {
    'Root': ((0, 0, 0), (0, 0, 9), None),
    'Torso': ((0, 0, 9), (0, -2, 19), 'Root'),
    'Head': ((0, -3, 19), (0, -6, 23), 'Torso'),
    'Leg.L': ((3, 0, 9), (3.5, 0, 0.8), 'Root'),
    'Leg.R': ((-3, 0, 9), (-3.5, 0, 0.8), 'Root'),
    'Arm.L': ((3.5, -2, 16), (5.5, -4, 10), 'Torso'),
    'Arm.R': ((-3.5, -2, 16), (-5.5, -4, 10), 'Torso'),
    'Tail': ((0, 8, 11), (0, 35, 11), 'Torso'),
}
for name, (head, tail, _) in spec.items():
    bone = arm_data.edit_bones.new(name)
    bone.head, bone.tail = head, tail
for name, (_, _, parent) in spec.items():
    if parent:
        arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
body.parent = rig
mod = body.modifiers.new('Godzilla walking skin', 'ARMATURE')
mod.object = rig

scene = bpy.context.scene
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 31
for bone in rig.pose.bones:
    bone.rotation_mode = 'XYZ'
for frame, phase in [(1, 0), (8, math.pi/2), (16, math.pi), (24, 3*math.pi/2), (31, 2*math.pi)]:
    scene.frame_set(frame)
    gait = math.sin(phase)
    for name, amplitude in [('Leg.L', 0.30), ('Leg.R', -0.30),
                            ('Arm.L', -0.15), ('Arm.R', 0.15)]:
        bone = rig.pose.bones[name]
        bone.rotation_euler.x = amplitude * gait
        bone.keyframe_insert(data_path='rotation_euler', frame=frame)
    rig.pose.bones['Tail'].rotation_euler.z = 0.08 * gait
    rig.pose.bones['Tail'].keyframe_insert(data_path='rotation_euler', frame=frame)
    rig.pose.bones['Torso'].rotation_euler.y = 0.025 * gait
    rig.pose.bones['Torso'].keyframe_insert(data_path='rotation_euler', frame=frame)
    rig.pose.bones['Root'].location.z = 0.12 * (1 - math.cos(phase * 2))
    rig.pose.bones['Root'].keyframe_insert(data_path='location', frame=frame)
rig.animation_data.action.name = 'Walk'
scene.frame_set(1)

for image in bpy.data.images:
    if image.source == 'FILE' and max(image.size) > 2048:
        f = 2048 / max(image.size)
        image.scale(max(1, round(image.size[0] * f)), max(1, round(image.size[1] * f)))
    if image.has_data:
        image.pack()

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.wm.save_as_mainfile(filepath=str(root / 'artifacts' / 'blender' / 'Godzilla-2014-encounter.blend'))
bpy.ops.export_scene.gltf(filepath=str(out / 'steam79-walk.glb'), export_format='GLB',
    use_selection=True, export_animations=True, export_nla_strips=False,
    export_optimize_animation_size=True, export_image_format='AUTO')

export_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print('BH_GODZILLA ' + json.dumps({'sourceTris': source_tris, 'gameTris': export_tris,
    'height': 24, 'output': str(out / 'steam79-walk.glb')}))
