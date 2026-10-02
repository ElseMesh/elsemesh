"""Author a bounded North Sea port entrance module with Blender/CUDA.

Run with: blender -b --factory-startup --python this_file -- OUTPUT_DIR
The result is a game asset, neutral GPU review render and hashed manifest.
"""

import hashlib
import json
import math
import pathlib
import sys
import time

import bpy
from mathutils import Vector


started = time.monotonic()
output = pathlib.Path(sys.argv[-1]).resolve()
output.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def sha(file):
    return hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()


def surface(name, rgb, roughness, metallic=0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1)
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return item


concrete = surface("salt-stained concrete", (.31, .33, .32), .94)
sheet = surface("weathered green-grey corrugated sheet", (.19, .24, .23), .75, .28)
steel = surface("old galvanised steel", (.30, .34, .34), .67, .6)
rubber = surface("dark industrial trim", (.055, .066, .065), .86)
glass = surface("blue-grey security glazing", (.075, .13, .15), .17)
yellow = surface("worn safety yellow", (.55, .38, .085), .74)
red = surface("barrier warning red", (.48, .075, .055), .63)
lamp = surface("warm security light lens", (.9, .68, .32), .35)
white = surface("weathered sign white", (.63, .66, .61), .79)
asphalt = surface("patched port asphalt", (.105, .116, .115), .98)
paint = surface("faded road paint", (.48, .51, .47), .93)
dark_steel = surface("mesh wire oxidised steel", (.16, .19, .19), .82, .35)


def box(name, at, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("small fabricated edge radius", "BEVEL")
        mod.width = bevel
        mod.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.modifiers.new("weighted face normals", "WEIGHTED_NORMAL")
    return obj


def post(name, at, radius, depth, mat, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=at)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def sign_text(name, words, at, size, mat):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = words
    curve.size = size
    curve.extrude = .002
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = (1.5708, 0, 0)
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


# Main lane is local X=0; the booth sits at X=-4.8. Blender Z is up.
# The thin asphalt apron is a stitchable road surface, not a display plinth.
box("road asphalt module", (0, 0, -.085), (17.6, 12.4, .16), asphalt)
for y in (-3.8, 3.9):
    box("asphalt repair seam", (2.1, y, -.001), (10.8, .018, .003), rubber)
for x in (-2.35, 7.85):
    box("faded lane edge", (x, 0, .001), (.09, 11.1, .006), paint)
for y in (-5.05, -2.5, 0, 2.5, 5.05):
    box("faded dashed centre line", (2.7, y, .002), (.09, 1.25, .006), paint)
box("checkpoint halt line", (2.7, -2.8, .003), (10.1, .16, .006), paint)
for x in (-7.8, -3.07):
    box("booth footway kerb", (x, .58, .11), (.18, 5.7, .23), concrete)
for y in (-4.8, 4.9):
    box("storm drain grate", (-2.15, y, .008), (.33, .67, .025), rubber)
box("booth concrete plinth", (-5.05, .7, .18), (4.2, 5.1, .34), concrete)
box("security booth body", (-5.05, .7, 1.86), (3.75, 4.65, 3.1), sheet, .055)
box("booth low canopy", (-5.05, .7, 3.54), (4.45, 5.4, .27), steel, .05)
box("booth roof drain", (-5.05, -1.97, 3.44), (4.3, .12, .15), rubber)
for side in (-1, 1):
    box("security booth side window", (-5.05 + side * 1.9, -.1, 2.23), (.035, 1.9, 1.05), glass)
box("security booth front window", (-5.05, -1.65, 2.23), (2.65, .035, 1.05), glass)
box("security booth rear door", (-5.05, 3.05, 1.57), (1.05, .055, 2.15), rubber)
box("security booth door light", (-5.05, 3.09, 2.97), (.38, .08, .18), lamp)
box("door push plate", (-4.66, 3.12, 1.45), (.06, .02, .18), steel)
box("booth service vent", (-5.05, 3.06, .75), (.75, .065, .45), rubber)
box("booth rainwater downpipe", (-7.01, 2.85, 1.74), (.075, .075, 3.3), steel)
sign_text("security booth label", "GATE 2  |  SECURITY", (-5.05, -1.691, 3.09), .22, white)
for index in range(18):
    x = -6.83 + index * .21
    box("booth vertical pressed-metal rib", (x, 3.04, 1.77), (.022, .055, 2.83), steel)

# Container-port checkpoint gantry spans the heavy-vehicle lane.
for x in (-2.05, 7.45):
    post("checkpoint crash-protected column", (x, -.4, 3.38), .18, 6.75, steel)
    box("column base shoe", (x, -.4, .24), (.62, .62, .43), concrete, .04)
box("checkpoint truss fascia", (2.7, -.4, 6.8), (10.2, .5, .74), steel)
box("PORT AUTHORITY sign backing", (2.7, -.71, 6.8), (5.8, .11, .68), rubber)
box("PORT AUTHORITY sign face", (2.7, -.78, 6.8), (5.58, .025, .5), white)
sign_text("port authority identity", "BRACKEN QUAY  |  PORT AUTHORITY", (2.7, -.799, 6.79), .245, rubber)
for x in (-1.65, 2.7, 7.05):
    box("lane-mounted warm checkpoint lamp", (x, -.77, 6.19), (.62, .28, .16), lamp)

# Barrier controls and anti-ram furniture.
box("barrier operator cabinet", (-2.65, -1.82, .75), (.74, .71, 1.42), yellow, .06)
# Daylight operating state: the arm is raised, allowing the simulated
# traffic lane to remain open. A controlled animation is a later gate.
arm_length = 4.2
arm_angle = math.radians(65)
arm_start_x, arm_start_z = -2.65, 1.41
arm = box("raised barrier arm", (arm_start_x + math.cos(arm_angle) * arm_length / 2,
                                 -1.83, arm_start_z + math.sin(arm_angle) * arm_length / 2),
          (arm_length, .14, .16), white, .02)
arm.rotation_euler[1] = -arm_angle
for index in range(4):
    along = .58 + index * .93
    stripe = box("raised arm reflective patch", (arm_start_x + math.cos(arm_angle) * along,
                                                   -1.92, arm_start_z + math.sin(arm_angle) * along),
                 (.43, .025, .16), red)
    stripe.rotation_euler[1] = -arm_angle
for x in (-7.65, -6.9, -3.22, -2.43, 7.96, 8.66):
    post("yellow anti-ram bollard", (x, -2.73, .72), .115, 1.15, yellow)
    post("bollard black foot", (x, -2.73, .16), .17, .18, rubber)

# Short, imperfect perimeter sections: real fencing, not a solid wall.
for x in (-8.72, 8.72):
    for y in (-4.4, -2.2, 0, 2.2, 4.4):
        post("galvanised fence upright", (x, y, 1.25), .045, 2.4, steel, 8)
    for y in (-3.3, -1.1, 1.1, 3.3):
        box("fence upper rail", (x, y, 2.27), (.055, 2.16, .055), steel)
        box("fence lower rail", (x, y, .31), (.055, 2.16, .055), steel)
        for step in range(11):
            yy = y - .98 + step * .196
            box("open fence wire vertical", (x, yy, 1.29), (.012, .012, 1.88), dark_steel)
        for step in range(8):
            zz = .42 + step * .245
            box("open fence wire horizontal", (x, y, zz), (.012, 2.0, .012), dark_steel)

for item in bpy.data.materials:
    objects = [obj for obj in bpy.context.scene.objects
               if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == item]
    if len(objects) < 2:
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
asset_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(asset_objects) > 12:
    raise RuntimeError("gatehouse_material_batch_budget_exceeded")

bpy.ops.object.select_all(action="DESELECT")
for obj in asset_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = asset_objects[0]
glb = output / "bracken-gatehouse.glb"
bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True)
if not glb.is_file() or glb.stat().st_size < 1024:
    raise RuntimeError("gatehouse_export_missing")

gpu = bpy.context.preferences.addons["cycles"].preferences
gpu.compute_device_type = "CUDA"
gpu.get_devices()
devices = [item for item in gpu.devices if item.type == "CUDA" and "Quadro" in item.name]
if not devices:
    raise RuntimeError("quadro_cuda_device_unavailable")
for item in gpu.devices:
    item.use = item in devices
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
scene.cycles.samples = 16
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, -.025))
bpy.context.object.data.materials.append(surface("neutral review ground", (.29, .3, .3), 1))


def light(at, power, size):
    data = bpy.data.lights.new("neutral area", "AREA")
    data.energy = power
    data.size = size
    obj = bpy.data.objects.new("neutral area", data)
    bpy.context.collection.objects.link(obj)
    obj.location = at
    obj.rotation_euler = (Vector((0, 0, 2)) - obj.location).to_track_quat("-Z", "Y").to_euler()


light(Vector((10, -12, 18)), 2200, 12)
light(Vector((-11, 8, 12)), 1200, 10)
camera_data = bpy.data.cameras.new("port approach neutral camera")
camera = bpy.data.objects.new("port approach neutral camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (18, -24, 15)
camera.rotation_euler = (Vector((0, 0, 2)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 27
scene.camera = camera
scene.render.filepath = str(output / "bracken-gatehouse-neutral.png")
bpy.ops.render.render(write_still=True)

manifest = {"schema": "bracken-quay.gatehouse/v1", "source_script_sha256": sha(__file__),
            "gpu_devices": [item.name for item in devices], "mesh_batches": len(asset_objects),
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "artifacts": [{"name": item.name, "sha256": sha(item), "bytes": item.stat().st_size}
                          for item in (glb, pathlib.Path(scene.render.filepath))]}
target = output / "bracken-gatehouse-manifest.json"
target.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("BRACKEN_GATEHOUSE_MANIFEST=" + str(target))
