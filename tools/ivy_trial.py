"""Isolated GPL-2.0-or-later IvyGen compatibility/export trial.

Uses the unmodified reviewed add_curve_ivygen.py growth classes. Only its
Blender collision adapters are replaced; no add-on registration or handlers.
Optional generated leaf texture on folded alpha cards; no bundled blend/texture used.
"""
import bpy, importlib.util, sys, pathlib, json, hashlib, random, math, time
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
source, out = map(pathlib.Path, args[:2])
leaf_texture = pathlib.Path(args[2]) if len(args) > 2 else None
out.mkdir(parents=True, exist_ok=True)
start = time.perf_counter()
spec = importlib.util.spec_from_file_location('reviewed_ivy', source / 'add_curve_ivygen.py')
ivy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ivy)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def box(name, location, dimensions):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob

wall = box('EXCLUDED workshop rear wall collision proxy', (0, -.25, 2.8), (19, .5, 5.6))
raw_error = None
try:
    test = ivy.Ivy()
    test.seed(Vector((0, .04, .05)))
    test.grow(wall)
except Exception as error:
    raw_error = f'{type(error).__name__}: {error}'

def adhesion(loc, ob, maximum):
    hit, point, normal, index = ob.closest_point_on_mesh(ob.matrix_world.inverted() @ loc, distance=maximum)
    delta = ob.matrix_world @ point - loc if hit else Vector((0, 0, 0))
    distance = delta.length
    return delta.normalized() * max(0, 1 - distance / maximum) if distance else delta

def collision(ob, pos, new_pos):
    inverse = ob.matrix_world.inverted()
    origin, target = inverse @ pos, inverse @ new_pos
    direction = target - origin
    if direction.length < 1e-8:
        return False
    hit, point, normal, index = ob.ray_cast(origin, direction, distance=direction.length)
    if hit and direction.dot(normal) < 0:
        target -= 2 * (target - point).project(normal)
        new_pos[:] = ob.matrix_world @ target
        return True
    return False

ivy.adhesion, ivy.collision = adhesion, collision

def grow(ob, seed, length, rng, float_length=.3):
    random.seed(rng)
    plant = ivy.Ivy(primaryWeight=.65, randomWeight=.3, adhesionWeight=.2,
        gravityWeight=.14, branchingProbability=.025, ivySize=.09,
        maxFloatLength=float_length, maxAdhesionDistance=.25)
    plant.seed(Vector(seed))
    iterations = 0
    while plant.maxLength < length and any(r.alive for r in plant.ivyRoots) and iterations < 220 and len(plant.ivyRoots) < 32:
        plant.grow(ob)
        iterations += 1
    return plant

def summary(plant, ob):
    nodes = [n for r in plant.ivyRoots for n in r.ivyNodes]
    distances = []
    for n in nodes:
        hit, p, _, _ = ob.closest_point_on_mesh(ob.matrix_world.inverted() @ n.pos)
        distances.append((ob.matrix_world @ p - n.pos).length if hit else 999)
    return dict(roots=len(plant.ivyRoots), nodes=len(nodes), maxHeight=max(n.pos.z for n in nodes),
        maxLength=plant.maxLength, maxSurfaceDistance=max(distances),
        nodesOver8cm=sum(d > .08 for d in distances))

# Exact 12-mm wires and rail spacing from tools/bracken_gatehouse.py, one 2.2 m panel.
wires = []
for index in range(11):
    wires.append(box('EXCLUDED open vertical wire', (-.98 + index * .196, 0, 1.29), (.012, .012, 1.88)))
for index in range(8):
    wires.append(box('EXCLUDED open horizontal wire', (0, 0, .42 + index * .245), (2, .012, .012)))
bpy.ops.object.select_all(action='DESELECT')
for ob in wires: ob.select_set(True)
bpy.context.view_layer.objects.active = wires[0]
bpy.ops.object.join()
fence = bpy.context.object
raw_fence = grow(fence, (-.78, .035, .33), 2.2, 490)
fence_metrics = summary(raw_fence, fence)
# The guided test uses a support plane to prevent branches crossing mesh holes.
guide = box('EXCLUDED fence support guide', (0, -.025, 1.25), (2.08, .04, 2.1))
plants = [('building', grow(wall, (-5.4, .035, .09), 4.5, 185)),
          ('building', grow(wall, (-3.2, .035, .09), 3.3, 24)),
          ('building', grow(wall, (6.5, .035, .09), 2.6, 61)),
          ('building', grow(wall, (5.8, .035, .09), 2.8, 64)),
          ('building', grow(wall, (6.9, .035, .09), 3.0, 66)),
          ('building', grow(wall, (-4.7, .035, .09), 2.3, 189)),
          ('fence', grow(guide, (-.78, .035, .33), 2.1, 490)),
          ('fence', grow(guide, (-.4, .035, .33), 1.5, 725))]

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .88
    p.inputs['Metallic'].default_value = 0
    return mat

leaves_mat = material('authored muted ivy foliage', (.095, .145, .043))
if leaf_texture:
    leaves_mat.name = 'generated English ivy alpha foliage'
    image = bpy.data.images.load(str(leaf_texture))
    image.scale(512, 512)
    image.pack()
    tex = leaves_mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    bsdf = leaves_mat.node_tree.nodes.get('Principled BSDF')
    leaves_mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    cutoff = leaves_mat.node_tree.nodes.new('ShaderNodeMath')
    cutoff.operation = 'GREATER_THAN'
    cutoff.inputs[1].default_value = .5
    leaves_mat.node_tree.links.new(tex.outputs['Alpha'], cutoff.inputs[0])
    leaves_mat.node_tree.links.new(cutoff.outputs[0], bsdf.inputs['Alpha'])
    leaves_mat.surface_render_method = 'DITHERED'
    leaves_mat.use_backface_culling = False
stem_mat = material('authored weathered ivy stems', (.12, .10, .055))
objects = {'building': [], 'fence': []}
metrics = []
for pi, (kind, plant) in enumerate(plants):
    metrics.append(dict(kind=kind, **summary(plant, wall if kind == 'building' else guide)))
    curve = bpy.data.curves.new(f'{kind} IvyGen stems', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = .006 if kind == 'building' else .003
    curve.bevel_resolution = 0
    vertices, faces, uvs = [], [], []
    random.seed(1900 + pi)
    for root in plant.ivyRoots:
        points = []
        for n in root.ivyNodes:
            # Explicit art-direction bounds keep growth below roof and inside panel.
            if kind == 'fence' and (abs(n.pos.x) > .98 or not .32 <= n.pos.z <= 2.19): break
            if not .07 <= n.pos.z <= 5.15 or abs(n.pos.x) > 8.8: break
            # Controlled surface projection eliminates floating/off-wall tips.
            # Guided fence stems weave a few millimetres either side of wires;
            # this is explicit manual placement, not successful raw IvyGen adhesion.
            depth = .008 + .014 * math.sin(n.pos.z / .245 * math.pi) if kind == 'fence' else .025
            p = Vector((n.pos.x, depth, n.pos.z))
            points.append(p)
        if len(points) < 2: continue
        spline = curve.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for i, p in enumerate(points):
            spline.points[i].co = (*p, 1)
            spline.points[i].radius = max(.3, 1 - i / len(points) * .65)
            if random.random() < .15: continue
            size = random.uniform(.035, .07) if kind == 'fence' else random.uniform(.04, .09)
            angle = random.uniform(-1.8, 1.8)
            width_ratio = random.uniform(.75, 1.05)
            tilt = random.uniform(-.35, .35)
            # Five-lobed silhouette, with a slightly folded centre (not flat squares).
            outline = [(0,-.5),(-.30,-.28),(-.92,-.12),(-.46,.22),(-.60,.64),(-.22,.48),(0,1),(.22,.48),(.60,.64),(.46,.22),(.92,-.12),(.30,-.28)]
            if leaf_texture:
                outline = [(-1,-1),(1,-1),(1,1),(-1,1)]
            base = len(vertices)
            center = p + Vector((size * (.55 if i % 2 else -.55), .035, size * .35))
            # Connect the petiole end of the textured leaf to its support stem.
            petiole_end = center + Vector((size*.87*math.sin(angle), 0, -size*.87*math.cos(angle)))
            petiole = curve.splines.new('POLY')
            petiole.points.add(1)
            petiole.points[0].co = (*p, 1)
            petiole.points[1].co = (*petiole_end, 1)
            for point in petiole.points: point.radius = .25
            vertices.append(tuple(center + Vector((0, size * .08, 0))))
            uvs.append((.5, .5))
            for x, z in outline:
                xx, zz = size * x * width_ratio, size * z
                vertices.append(tuple(center + Vector((xx*math.cos(angle)-zz*math.sin(angle), zz*math.sin(tilt), (xx*math.sin(angle)+zz*math.cos(angle))*math.cos(tilt)))))
                uvs.append(((x+1)/2, (z+1)/2))
            for j in range(len(outline)):
                faces.append((base, base+1+j, base+1+(j+1)%len(outline)))
    stem = bpy.data.objects.new(f'{kind} restrained IvyGen stems', curve)
    bpy.context.collection.objects.link(stem)
    stem.data.materials.append(stem_mat)
    mesh = bpy.data.meshes.new(f'{kind} authored lobed leaves')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
    leaf = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(leaf)
    leaf.data.materials.append(leaves_mat)
    objects[kind] += [stem, leaf]

exports = []
for kind, group in objects.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in group: ob.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = f'{kind}-ivy-trial'
    for poly in ob.data.polygons: poly.use_smooth = False
    path = out / f'{kind}-ivy.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_yup=True)
    ob.data.calc_loop_triangles()
    exports.append(dict(file=path.name, bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), triangles=len(ob.data.loop_triangles), materials=len(ob.data.materials)))
bpy.ops.wm.save_as_mainfile(filepath=str(out / 'ivy-trial.blend'))
report = dict(sourceRevision='2ab4d81244999ec350193edad1000abd66b99774', blender=bpy.app.version_string,
    rawCompatibilityError=raw_error, rawFence=fence_metrics, guidedPlants=metrics, outputs=exports,
    elapsedSeconds=time.perf_counter()-start, device='CPU; no GPU execution claimed',
    adaptations=['modern closest-point and ray-cast matrix APIs', 'fixed seed and bounded iterations',
    'fence support guide', 'all final stems projected to support plane', 'manual keep-out clipping',
    'scale-relative centre fold', 'generated alpha-masked ivy texture on folded cards' if leaf_texture else 'authored lobed leaves'],
    texturesUsed=[dict(file=leaf_texture.name, sha256=hashlib.sha256(leaf_texture.read_bytes()).hexdigest(),
        provenance='OpenAI built-in image generation; not a photograph or CC0 source', exportedResolution=512)] if leaf_texture else [], bundledBlendsUsed=[])
(out / 'generation.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
