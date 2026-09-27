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

def procedural_material(name, spec):
    m = bpy.data.materials.new('Portal ' + name)
    rgb = [((spec['color'] >> shift) & 255) / 255 for shift in (16, 8, 0)]
    alpha = spec.get('opacity', 1.0)
    m.diffuse_color = (*rgb, alpha)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bs = nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Roughness'].default_value = spec.get('roughness', .7)
    bs.inputs['Metallic'].default_value = spec.get('metalness', 0)
    bs.inputs['Alpha'].default_value = alpha
    if spec.get('emissive'):
        bs.inputs['Emission Color'].default_value = (*rgb, 1)
        bs.inputs['Emission Strength'].default_value = .8
    if spec.get('transparent'):
        m.surface_render_method = 'DITHERED'
        m.use_transparency_overlap = False

    tex = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeMapping')
    links.new(tex.outputs['Generated'], mapping.inputs['Vector'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.2
    noise.inputs['Detail'].default_value = 5.0
    noise.inputs['Roughness'].default_value = .72
    links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*[c * .62 for c in rgb], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, c * 1.18) for c in rgb], 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])

    if name in ('brick', 'brickDark'):
        brick = nodes.new('ShaderNodeTexBrick')
        brick.offset = .5
        brick.offset_frequency = 2
        brick.squash = 1.0
        brick.inputs['Color1'].default_value = (*[c * .76 for c in rgb], 1)
        brick.inputs['Color2'].default_value = (*[min(1, c * 1.12) for c in rgb], 1)
        brick.inputs['Mortar'].default_value = (.055, .045, .038, 1)
        brick.inputs['Scale'].default_value = 4.0
        brick.inputs['Mortar Size'].default_value = .035
        brick.inputs['Mortar Smooth'].default_value = .01
        brick.inputs['Brick Width'].default_value = 1.0
        brick.inputs['Row Height'].default_value = .32
        links.new(mapping.outputs['Vector'], brick.inputs['Vector'])
        links.new(brick.outputs['Color'], bs.inputs['Base Color'])
        links.new(brick.outputs['Fac'], bs.inputs['Roughness'])
    elif name in ('concrete', 'concreteDark', 'steel', 'rust', 'black', 'wood', 'fabric', 'charcoal', 'rug', 'rugLight'):
        if name == 'wood':
            mapping.inputs['Scale'].default_value = (7.0, 1.4, 1.4)
            noise.inputs['Scale'].default_value = 5.0
            noise.inputs['Distortion'].default_value = 2.0
        elif name in ('steel', 'rust', 'black'):
            mapping.inputs['Scale'].default_value = (2.0, 18.0, 2.0)
            noise.inputs['Scale'].default_value = 5.5
        elif name in ('fabric', 'charcoal', 'rug', 'rugLight'):
            noise.inputs['Scale'].default_value = 42.0
            noise.inputs['Detail'].default_value = 2.0
        links.new(ramp.outputs['Color'], bs.inputs['Base Color'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .12 if name in ('steel', 'black') else .22
        bump.inputs['Distance'].default_value = .08
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m

for name, spec in recipe['materials'].items():
    materials[name] = procedural_material(name, spec)

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

# Mirror the recipe's warm task lights. Engine (x,y,z) maps to Blender
# (x,-z,y); modest powers preserve the cool-daylight / amber-interior balance.
for index, light in enumerate(recipe.get('lights', [])):
    x, y, z = light['position']
    bpy.ops.object.light_add(type='POINT', location=(x, -z, y))
    lamp = bpy.context.object
    lamp.name = light.get('name', f'Portal task light {index + 1}')
    packed = light['color']
    lamp.data.color = tuple(((packed >> shift) & 255) / 255 for shift in (16, 8, 0))
    lamp.data.energy = light['intensity'] * 42
    lamp.data.shadow_soft_size = .7
    lamp.data.cutoff_distance = light['range']

# Broad neutral window illumination stands in for exterior daylight in the
# isolated Blender review scene; it is deliberately non-cyan.
bpy.ops.object.light_add(type='AREA', location=(-15, -1, 6.5))
daylight = bpy.context.object
daylight.name = 'Neutral factory-window daylight'
daylight.data.energy = 1050
daylight.data.color = (.82, .88, 1.0)
daylight.data.shape = 'RECTANGLE'
daylight.data.size = 10
point_at(daylight, (-3, -2, 3.4))

# Wide eye-height view from the open front floor toward the stair, lounge, and
# glass-fronted mezzanine computer room; no foreground appliance blocks it.
bpy.ops.object.camera_add(location=(13.5, -1.5, 2.15))
cam = bpy.context.object
cam.name = 'Interior review camera'
point_at(cam, (-2.5, -9.5, 3.0))
cam.data.lens = 27
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
