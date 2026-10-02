"""Isolated CPU trial derivative. Not governed production/GPU evidence."""
import bpy, pathlib, sys, json, hashlib, math
from mathutils import Matrix, Vector
out=pathlib.Path(sys.argv[-1]); out.mkdir(parents=True,exist_ok=True)
source=bpy.data.filepath
visible=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.visible_get() and not o.hide_render]
deps=bpy.context.evaluated_depsgraph_get()
baked=[]
for obj in visible:
    evaluated=obj.evaluated_get(deps)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=deps)
    copy=bpy.data.objects.new('trial-'+obj.name,mesh); bpy.context.scene.collection.objects.link(copy)
    copy.matrix_world=obj.matrix_world.copy(); baked.append(copy)
for obj in list(bpy.context.scene.objects):
    if obj not in baked: bpy.data.objects.remove(obj,do_unlink=True)
changes=[]
# Fill the unused low registration recess using the neighbouring authored bumper
# curvature, not an added box. Only its exterior centre patch is deformed.
bumper=bpy.data.objects.get('trial-bumper-rear')
if not bumper: raise RuntimeError('authored rear bumper missing')
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get(); patch=[]
for vertex in bumper.data.vertices:
    p=bumper.matrix_world @ vertex.co
    if abs(p.x)>.305 or not (.395<p.z<.605) or p.y<2.35: continue
    samples=[]
    for x in [.32,.42]:
        hit,q,n,f,o,m=bpy.context.scene.ray_cast(deps,Vector((x,4,p.z)),Vector((0,-1,0)))
        if not hit or o!=bumper: raise RuntimeError('bumper curvature sample failed')
        samples.append(q.y)
    curvature=(samples[0]-samples[1])/(.42**2-.32**2)
    target=samples[0]+curvature*(.32**2-p.x**2)
    if target>p.y: patch.append((vertex,Vector((p.x,target,p.z))))
for vertex,p in patch: vertex.co=bumper.matrix_world.inverted() @ p
bumper.data.update()
changes.append('fill obsolete low rear plate recess using adjacent bumper curvature: '+str(len(patch))+' vertices; no added primitive')
# Source is a posed presentation scene. Neutralise the authored front-wheel turn
# around each tyre centre, then bake wheel orientation so runtime spin is about X.
for front,rear,wheel in [('trial-generic-tire-low','trial-generic-tire-low.002','trial-generic-wheel'),('trial-generic-tire-low.001','trial-generic-tire-low.003','trial-generic-wheel.001')]:
    tire=bpy.data.objects.get(front); reference=bpy.data.objects.get(rear)
    if not tire or not reference: raise RuntimeError('required wheel pivot missing')
    pivot=tire.matrix_world.translation.copy()
    delta=reference.matrix_world.to_quaternion() @ tire.matrix_world.to_quaternion().inverted()
    correction=Matrix.Translation(pivot) @ delta.to_matrix().to_4x4() @ Matrix.Translation(-pivot)
    for name in [front,wheel]:
        obj=bpy.data.objects.get(name); obj.matrix_world=correction @ obj.matrix_world
for obj in baked:
    if any(s in obj.name for s in ['generic-wheel','generic-tire-low','brake-disc']):
        world=obj.matrix_world.copy(); translation=Matrix.Translation(world.translation)
        obj.data.transform(translation.inverted() @ world); obj.matrix_world=translation
changes.append('neutralise source front steering pose about tyre pivots; bake wheel orientation preserving centres for runtime X spin')
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    output=next((n for n in mat.node_tree.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output),None)
    linked=output.inputs['Surface'].links[0].from_node if output and output.inputs['Surface'].links else None
    bsdf=linked if linked and linked.type=='BSDF_PRINCIPLED' else next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
    if not bsdf: continue
    name=mat.name.lower()
    if 'car paint' in name:
        for key,value in [('Roughness',.23),('Metallic',.45),('Coat Weight',.6),('Coat Roughness',.16)]:
            socket=bsdf.inputs[key]
            for link in list(socket.links): mat.node_tree.links.remove(link)
            socket.default_value=value
        changes.append('active output paint shader corrected: roughness .23 metallic .45 coat .6/.16; source base colour and normal maps retained')
    if name.startswith('glass ext'):
        # Browser glTF blend approximation, explicitly recorded instead of opaque fallback.
        for key,value in [('Base Color',(.08,.11,.13,1)),('Roughness',.08),('Metallic',0),('Alpha',.20),('Transmission Weight',0),('Specular IOR Level',.5)]:
            if key in bsdf.inputs:
                socket=bsdf.inputs[key]
                for link in list(socket.links): mat.node_tree.links.remove(link)
                socket.default_value=value
        mat.surface_render_method='DITHERED'; mat.use_nodes=True
        changes.append(mat.name+' alpha-blend approximation')
    elif name.startswith('glass -'):
        lens_values=[('Transmission Weight',0),('Alpha',.65 if 'red' in name else .10),('Roughness',.22 if 'red' in name else .06)]
        if 'clear' in name: lens_values.append(('Base Color',(.12,.14,.16,1)))
        for key,value in lens_values:
            if key in bsdf.inputs:
                socket=bsdf.inputs[key]
                for link in list(socket.links): mat.node_tree.links.remove(link)
                socket.default_value=value
        mat.surface_render_method='DITHERED'
        changes.append(mat.name+' lens transmission translated to alpha blend')
for im in bpy.data.images:
    name=im.name.lower()
    limit=2048 if any(s in name for s in ['car_paint','honeycomb']) else 1024
    if any(s in name for s in ['car-bottom','suspension','engine','stainless']): limit=512
    if max(im.size)>limit:
        ratio=limit/max(im.size); im.scale(max(1,int(im.size[0]*ratio)),max(1,int(im.size[1]*ratio)))
        changes.append('resize '+im.name+' to '+str(limit)+' max; retain exterior 2K, cabin/tyre 1K, hidden mechanical 512')

def material(name,color):
    m=bpy.data.materials.new(name); m.use_nodes=True
    shader=m.node_tree.nodes.get('Principled BSDF'); shader.inputs['Base Color'].default_value=color
    shader.inputs['Roughness'].default_value=.5; return m
ink=material('fictional plate black',(.008,.008,.008,1))
mount=material('registration rubber mounting frame',(.018,.018,.018,1))
for label,y,z,angle,color in [('front',-2.505,.45,math.pi/2,(.85,.85,.78,1)),('rear',2.50,.82,math.pi/2,(.75,.55,.015,1))]:
    if label=='rear':
        bpy.context.view_layer.update()
        hit,point,normal,face,obj,matrix=bpy.context.scene.ray_cast(bpy.context.evaluated_depsgraph_get(),Vector((0,4,z)),Vector((0,-1,0)))
        if not hit: raise RuntimeError('rear registration mounting surface absent')
        y=point.y+.012
        changes.append('rear registration mounted to observed rear panel surface '+str(tuple(point)))
    outward=-1 if label=='front' else 1
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,y-outward*.008,z)); frame=bpy.context.object
    frame.name='registration '+label+' rubber frame'; frame.scale=(.536,.014,.128); frame.data.materials.append(mount); baked.append(frame)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,y,z)); plate=bpy.context.object
    plate.name='fictional UK '+label+' plate'; plate.scale=(.52,.012,.112); plate.data.materials.append(material(label+' registration',color)); baked.append(plate)
    bpy.ops.object.text_add(location=(0,y+(-.009 if label=='front' else .009),z))
    text=bpy.context.object; text.name=label+' AI68 LOZ'; text.data.body='AI68 LOZ'; text.data.align_x='CENTER'; text.data.align_y='CENTER'; text.data.size=.08
    text.rotation_euler=(angle,0,0 if label=='front' else math.pi); text.data.materials.append(ink)
    bpy.ops.object.convert(target='MESH'); baked.append(bpy.context.object)
    for x in [-.235,.235]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.0035,location=(x,y+outward*.009,z))
        screw=bpy.context.object; screw.name='registration fastening'; screw.scale.y=.35; screw.data.materials.append(ink); baked.append(screw)
static=[o for o in baked if not any(s in o.name for s in ['generic-wheel','generic-tire-low','brake-disc'])]
bpy.ops.object.select_all(action='DESELECT')
for obj in static: obj.select_set(True)
bpy.context.view_layer.objects.active=static[0]
bpy.ops.object.join(); joined=bpy.context.object; joined.name='sedan-static-material-batches'
baked=[o for o in bpy.context.scene.objects if o.type=='MESH']
changes.append('join static geometry by source material; preserve wheel/tire/disc objects; no decimation')
bpy.ops.object.select_all(action='DESELECT')
for obj in baked: obj.select_set(True)
bpy.context.view_layer.objects.active=baked[0]
path=out/'mmc-sedan-trial.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_cameras=False,export_lights=False)
report={'status':'CPU_TRIAL_NOT_FINAL','source':source,'changes':changes+['user-requested front and rear lettering AI68 LOZ'],'plate':'AI68 LOZ fictional; no real registration asserted','triangles_evaluated':sum(len(p.vertices)-2 for o in baked for p in o.data.polygons),'mesh_count':len(baked),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
(out/'trial-manifest.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
