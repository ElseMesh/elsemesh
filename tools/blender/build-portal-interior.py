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
        # World-position metre projection. Select Blender Y on X-facing walls and
        # Blender X on Y-facing walls; Blender Z is height. This avoids stripes
        # on perpendicular walls while keeping the recipe's .25 x .08 m bond.
        geometry = nodes.new('ShaderNodeNewGeometry')
        pos = nodes.new('ShaderNodeSeparateXYZ')
        normal = nodes.new('ShaderNodeSeparateXYZ')
        abs_normal = nodes.new('ShaderNodeVectorMath')
        abs_normal.operation = 'ABSOLUTE'
        choose_y = nodes.new('ShaderNodeMath')
        choose_y.operation = 'GREATER_THAN'
        horizontal = nodes.new('ShaderNodeMix')
        horizontal.data_type = 'FLOAT'
        projected = nodes.new('ShaderNodeCombineXYZ')
        links.new(geometry.outputs['Position'], pos.inputs['Vector'])
        links.new(geometry.outputs['Normal'], abs_normal.inputs[0])
        links.new(abs_normal.outputs['Vector'], normal.inputs['Vector'])
        links.new(normal.outputs['X'], choose_y.inputs[0])
        links.new(normal.outputs['Y'], choose_y.inputs[1])
        links.new(choose_y.outputs[0], horizontal.inputs['Factor'])
        links.new(pos.outputs['X'], horizontal.inputs['A'])
        links.new(pos.outputs['Y'], horizontal.inputs['B'])
        links.new(horizontal.outputs['Result'], projected.inputs['X'])
        links.new(pos.outputs['Z'], projected.inputs['Y'])
        brick = nodes.new('ShaderNodeTexBrick')
        brick.offset = .5
        brick.offset_frequency = 2
        brick.squash = 1.0
        brick.inputs['Color1'].default_value = (*[c * .78 for c in rgb], 1)
        brick.inputs['Color2'].default_value = (*[min(1, c * 1.10) for c in rgb], 1)
        brick.inputs['Mortar'].default_value = (.11, .095, .08, 1)
        brick.inputs['Scale'].default_value = 1.0
        brick.inputs['Mortar Size'].default_value = spec.get('mortar', .006)
        brick.inputs['Mortar Smooth'].default_value = .002
        brick.inputs['Brick Width'].default_value = spec.get('brickSize', [.25, .08])[0]
        brick.inputs['Row Height'].default_value = spec.get('brickSize', [.25, .08])[1]
        links.new(projected.outputs['Vector'], brick.inputs['Vector'])
        links.new(brick.outputs['Color'], bs.inputs['Base Color'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .012
        links.new(brick.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bs.inputs['Normal'])
        bs.inputs['Roughness'].default_value = spec.get('roughness', .94)
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

def flat_emission(name, packed):
    rgb = tuple(((packed >> shift) & 255) / 255 for shift in (16, 8, 0))
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*rgb, 1)
    bs.inputs['Emission Color'].default_value = (*rgb, 1)
    bs.inputs['Emission Strength'].default_value = .55
    bs.inputs['Roughness'].default_value = .4
    return mat

def display_text(body, location, size, material, name):
    # Face viewers approaching from Blender +Y; local text-right maps to world -X.
    bpy.ops.object.text_add(location=location, rotation=(math.pi / 2, 0, math.pi))
    text = bpy.context.object
    text.name = name
    text.data.body = body
    text.data.align_x = 'LEFT'
    text.data.align_y = 'TOP_BASELINE'
    text.data.size = size
    text.data.space_line = 1.12
    text.data.extrude = .002
    text.data.materials.append(material)
    return text

# Original decorative recreations: wording and colours come solely from the
# shared recipe. Text/geometry is embedded in the BLEND and GLB; no PIL, ROM,
# screenshot, external font file, or operating-system asset is required.
screen_x = {'c64': -11.5, 'bbc': -8.5, 'sun': -5.5}
for spec in recipe.get('screens', []):
    sid = spec['id']
    x = screen_x[sid]
    ink = flat_emission(sid.upper() + ' display ink', spec['foreground'])
    if spec.get('windows'):
        panel = flat_emission('Sun OpenWindows panels', 0xd5dfdc)
        for name, px, pz, sx, sz in [('File Manager', -.13, 4.82, .30, .23), ('Terminal', .08, 4.72, .31, .22)]:
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x + px, -8.775, pz))
            win = bpy.context.object
            win.name = 'Sun OpenWindows ' + name
            win.scale = (sx, .003, sz)
            win.data.materials.append(panel)
        display_text('SunOS 4.1.3\nOpenWindows', (x - .22, -8.768, 4.94), .035, ink, 'SunOS display heading')
        display_text('File Manager', (x - .25, -8.762, 4.86), .022, ink, 'Sun File Manager label')
        display_text('Terminal\n$ openwin', (x, -8.756, 4.77), .022, ink, 'Sun Terminal label')
    else:
        body = '\n'.join(spec['lines'])
        display_text(body, (x - .19, -8.768, 4.92), .034, ink, sid.upper() + ' generated BASIC display')
        cursor = spec.get('cursor')
        if cursor and cursor.get('blink'):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x - .185 + cursor['column'] * .021, -8.764, 4.775 - cursor['row'] * .048))
            block = bpy.context.object
            block.name = sid.upper() + ' blinking block cursor'
            block.scale = (.017, .003, .026)
            block.data.materials.append(ink)
            # Source BLEND animates exactly .5 s on/.5 s off at 24 fps. GLB
            # retains the still-on frame because glTF has no hide-render track.
            for frame, hidden in ((1, False), (12, False), (13, True), (24, True), (25, False)):
                block.hide_render = hidden
                block.keyframe_insert(data_path='hide_render', frame=frame)

label_ink = flat_emission('Workstation nameplate lettering', 0x211d18)
for label, x in (('COMMODORE 64', -11.5), ('BBC MODEL B', -8.5), ('SUN SPARCSTATION', -5.5)):
    display_text(label, (x - .29, -7.674, 4.285), .027, label_ink, label + ' readable nameplate')

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
bpy.ops.object.camera_add(location=(-4.0, 9.5, 1.7))
cam = bpy.context.object
cam.name = 'Interior review camera'
point_at(cam, (-3.0, -9.0, 3.5))
cam.data.lens = 26
bpy.context.scene.camera = cam

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1100
scene.render.resolution_y = 900
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
