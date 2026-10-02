import bpy, sys, json
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
for path in sys.argv[sys.argv.index('--')+1:]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    action=arm.animation_data.action if arm.animation_data else None
    frames=list(map(int,action.frame_range)) if action else [0,0]
    samples=[]
    for f in [frames[0],sum(frames)//2,frames[1]]:
        bpy.context.scene.frame_set(f)
        samples.append({'frame':f,'bones':{p.name:list(arm.matrix_world@p.matrix.translation) for p in arm.pose.bones if p.name in ['Bip01','Bip01 Pelvis','Bip01 L Foot','Bip01 R Foot']}})
    print(json.dumps({'path':path,'frames':frames,'samples':samples,'bones':[p.name for p in arm.pose.bones][:8]}))
