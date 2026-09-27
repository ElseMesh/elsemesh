"""Render front/side locomotion checks from the actual exported stock GLB."""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector
source,out=sys.argv[sys.argv.index('--')+1:];out=Path(out);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=600;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Review world');scene.world.color=(.35,.35,.35)
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.data.objects if o.type=='MESH')
for tr in arm.animation_data.nla_tracks:tr.mute=True
for loc,power,size in [((2,-4,5),700,4),((-3,-1,3),450,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object
mat=bpy.data.materials.new('Review floor');mat.diffuse_color=(.19,.23,.26,1);floor.data.materials.append(mat)
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.25
report={}
for name,frame in [('idle',1),('walk',10),('run',7),('helm',1)]:
    action=next(a for a in bpy.data.actions if a.name==name or a.name.startswith(name+'_') or a.name.endswith('_'+name))
    arm.animation_data.action=action
    if action.slots:arm.animation_data.action_slot=action.slots[0]
    scene.frame_set(frame)
    report[name]={'action':action.name,'frames':list(action.frame_range)}
    for view,loc in [('front',(0,-4,1.0)),('side',(4,0,1.0))]:
        camera.location=loc;camera.rotation_euler=(Vector((0,0,.9))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/f'{name}-{view}.png');bpy.ops.render.render(write_still=True)
(out/'report.json').write_text(json.dumps(report,indent=2))
