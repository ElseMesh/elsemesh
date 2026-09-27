import bpy, json, math, os, sys
from mathutils import Euler, Matrix, Vector

argv = sys.argv
args = argv[argv.index('--') + 1:] if '--' in argv else []
if len(args) != 2:
    raise SystemExit('usage: blender --background --python build-portal-interior.py -- /absolute/portal-recipe.json /absolute/output-folder')
recipe_path, out_dir = args
os.makedirs(out_dir, exist_ok=True)
with open(recipe_path, encoding='utf8') as f:
    recipe = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)
materials = {}
for name, spec in recipe['materials'].items():
    m = bpy.data.materials.new('Portal ' + name)
    rgb = [((spec['color'] >> shift) & 255) / 255 for shift in (16, 8, 0)]
    m.diffuse_color = (*rgb, 1)
    m.roughness = spec.get('roughness', .7)
    m.metallic = spec.get('metalness', 0)
    if spec.get('emissive'):
        m.use_nodes = True
        bs = m.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Emission Color'].default_value = (*rgb, 1)
        bs.inputs['Emission Strength'].default_value = 1.5
    materials[name] = m

# Engine coordinates are right-handed Y-up. Blender is right-handed Z-up; this
# basis change maps engine (x,y,z) to Blender (x,-z,y), preserving handedness.
BASIS = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
BASIS_INV = BASIS.inverted()

def converted_matrix(position, rotation):
    engine = Matrix.Translation(Vector(position)) @ Euler(rotation, 'XYZ').to_matrix().to_4x4()
    return BASIS @ engine @ BASIS_INV

def local_bounds(o):
    points = [Vector(v.co) for v in o.data.vertices]
    return tuple(max(p[i] for p in points) - min(p[i] for p in points) for i in range(3))

def assert_bounds(o, expected, name, tolerance=.002):
    actual = local_bounds(o)
    if any(abs(a - e) > tolerance for a, e in zip(actual, expected)):
        raise RuntimeError(f'{name}: local bounds {actual} do not match expected {expected}')

def make(obj):
    shape, s = obj['shape'], obj['size']
    if shape == 'box':
        bpy.ops.mesh.primitive_cube_add(size=1)
        expected = (s[0], s[2], s[1])
        bpy.context.object.data.transform(Matrix.Diagonal((*expected, 1)))
    elif shape == 'cylinder':
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=s[0] / 2, depth=s[1])
        expected = (s[0], s[0], s[1])
    elif shape == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1)
        expected = (s[0], s[2], s[1])
        bpy.context.object.data.transform(Matrix.Diagonal((s[0] / 2, s[2] / 2, s[1] / 2, 1)))
    elif shape == 'torus':
        bpy.ops.mesh.primitive_torus_add(major_radius=s[0] / 2, minor_radius=s[1] / 2, major_segments=24, minor_segments=12)
        expected = (s[0] + s[1], s[0] + s[1], s[1])
    else:
        return None
    o = bpy.context.object
    o.name = obj['name']
    o.matrix_world = converted_matrix(obj['position'], obj.get('rotation', [0, 0, 0]))
    o.data.materials.append(materials[obj['material']])
    assert_bounds(o, expected, obj['name'])
    return o

created = [make(obj) for obj in recipe['objects']]
created = [o for o in created if o]
print(f'Portal recipe bounds validated: {len(created)} objects')

def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

# Interior eye-level composition looking from lounge across dining toward the
# staircase and retro zone. Area lights are explicitly aimed into the room.
bpy.ops.object.light_add(type='AREA', location=(2, -5, 9))
key = bpy.context.object
key.name = 'Warm warehouse key'
key.data.energy = 1500
key.data.color = (1.0, .68, .42)
key.data.shape = 'RECTANGLE'
key.data.size = 9
point_at(key, (1, 2, 3))

bpy.ops.object.light_add(type='AREA', location=(-10, 4, 6))
fill = bpy.context.object
fill.name = 'Window fill'
fill.data.energy = 1100
fill.data.color = (.55, .72, 1.0)
fill.data.size = 7
point_at(fill, (-3, 1, 4))

bpy.ops.object.camera_add(location=(14, -9, 2.2))
cam = bpy.context.object
cam.name = 'Interior review camera'
point_at(cam, (0, 2, 2.8))
cam.data.lens = 30
bpy.context.scene.camera = cam

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 900
scene.render.resolution_y = 600
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(out_dir, 'portal-interior.png')
scene.world = bpy.data.worlds.new('Portal World')
scene.world.color = (.025, .035, .04)

# Save the editable source before either export or rendering.
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'portal-interior.blend'))
try:
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, 'portal-interior.glb'), export_format='GLB')
except Exception as e:
    print('GLB export warning:', e)
bpy.ops.render.render(write_still=True)
