"""Build a bounded, attributed Bracken Quay vehicle derivative in Blender.

Run with: blender -b --factory-startup --python this_file -- SOURCE.fbx TEXTURES_DIR OUTPUT_DIR
The source is read-only. The caller owns worker admission, staging, process
authority, collection and independent verification.
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
source = pathlib.Path(sys.argv[-3]).resolve()
textures = pathlib.Path(sys.argv[-2]).resolve()
output = pathlib.Path(sys.argv[-1]).resolve()
name = source.stem.lower()
files = {
    "sedan": ("SedanYellow.png", "Wheel_A_Diffuse.png"),
    "hatchback": ("HatchbackYellow.png", "wheel_B_Diffuse.png"),
    "multivan": ("MinivanRed.png", "wheel_D_Diffuse.png"),
}
if name not in files or source.suffix.lower() != ".fbx":
    raise RuntimeError("unsupported_vehicle_source")
body_texture, wheel_texture = (textures / item for item in files[name])
for item in (source, body_texture, wheel_texture):
    if not item.is_file():
        raise RuntimeError("missing_vehicle_input:" + item.name)
output.mkdir(parents=True, exist_ok=True)


def sha256(file):
    return hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()


def material(label, color, roughness, metallic=0):
    result = bpy.data.materials.new(label)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return result


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes or not any("wheel" in obj.name.lower() for obj in meshes):
    raise RuntimeError("invalid_vehicle_geometry_or_wheels")

for item in bpy.data.materials:
    item.use_nodes = True
    nodes = item.node_tree.nodes
    nodes.clear()
    output_node = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    item.node_tree.links.new(shader.outputs["BSDF"], output_node.inputs["Surface"])
    label = item.name.lower()
    if "body" in label or "wheel" in label:
        image = nodes.new("ShaderNodeTexImage")
        image.image = bpy.data.images.load(str(body_texture if "body" in label else wheel_texture))
        image.image.pack()
        item.node_tree.links.new(image.outputs["Color"], shader.inputs["Base Color"])
        shader.inputs["Roughness"].default_value = .42 if "body" in label else .7
        shader.inputs["Metallic"].default_value = .15 if "body" in label else 0
    elif "glass" in label:
        shader.inputs["Base Color"].default_value = (.055, .075, .09, 1)
        shader.inputs["Roughness"].default_value = .13
    else:
        shader.inputs["Base Color"].default_value = (.72, .72, .7, 1)

rear_lens = material("rear red lenses", (.38, .012, .008), .22)
rubber = material("tire sidewall", (.035, .038, .04), .88)
plate_material = material("muted yellow rear plate", (.58, .52, .25), .65)

for obj in meshes:
    if "wheel" in obj.name.lower():
        obj.data.materials.append(rubber)
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        centre_y = (min(p.y for p in points) + max(p.y for p in points)) / 2
        centre_z = (min(p.z for p in points) + max(p.z for p in points)) / 2
        for polygon in obj.data.polygons:
            centre = sum((obj.matrix_world @ obj.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
            if math.hypot(centre.y - centre_y, centre.z - centre_z) > .24:
                polygon.material_index = len(obj.data.materials) - 1
    elif "body" in obj.name.lower():
        optic_slots = [i for i, item in enumerate(obj.data.materials) if "optics" in item.name.lower()]
        if optic_slots:
            obj.data.materials.append(rear_lens)
            for polygon in obj.data.polygons:
                if polygon.material_index not in optic_slots:
                    continue
                position = sum((obj.matrix_world @ obj.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
                if position.y < 1:
                    polygon.material_index = len(obj.data.materials) - 1

corners = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
low = Vector(tuple(min(p[axis] for p in corners) for axis in range(3)))
high = Vector(tuple(max(p[axis] for p in corners) for axis in range(3)))
rear_y = low.y
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, rear_y - .025, low.z + .69))
plate = bpy.context.object
plate.name = name + " fictional rear registration plate"
plate.scale = (.45, .012, .085)
plate.data.materials.append(plate_material)
meshes.append(plate)

# The FBX is Z-up, front +Y. The glTF exporter performs its standard Y-up
# conversion; the game loader must still verify the actual exported orientation.
centre_x, centre_y = (low.x + high.x) / 2, (low.y + high.y) / 2
for obj in meshes:
    obj.location.x -= centre_x
    obj.location.y -= centre_y
    obj.location.z -= low.z


def export(lod):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    target = output / f"{name}-lod{lod}.glb"
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True)
    if not target.is_file() or target.stat().st_size < 1024:
        raise RuntimeError("vehicle_export_missing:" + target.name)
    return target


lods = [export(0)]

gpu = bpy.context.preferences.addons["cycles"].preferences
gpu.compute_device_type = "CUDA"
gpu.get_devices()
devices = [device for device in gpu.devices if device.type == "CUDA" and "Quadro" in device.name]
if not devices:
    raise RuntimeError("quadro_cuda_device_unavailable")
for device in gpu.devices:
    device.use = device in devices
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
scene.cycles.samples = 20
scene.render.resolution_x = 800
scene.render.resolution_y = 500
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"

positions = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
lo = Vector(tuple(min(p[axis] for p in positions) for axis in range(3)))
hi = Vector(tuple(max(p[axis] for p in positions) for axis in range(3)))
centre = (lo + hi) / 2
span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, -.04))
bpy.context.object.data.materials.append(material("neutral ground", (.32, .33, .34), 1))


def area(location, energy, size):
    data = bpy.data.lights.new("neutral review light", "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new("neutral review light", data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (centre - location).to_track_quat("-Z", "Y").to_euler()


area(centre + Vector((span * 1.3, -span * 1.1, span * 1.7)), 650, span * 2)
area(centre + Vector((-span * .9, span, span)), 350, span * 2)
camera_data = bpy.data.cameras.new("vehicle rear three-quarter review")
camera = bpy.data.objects.new("vehicle rear three-quarter review", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = centre + Vector((span * 1.45, -span * 2.2, span * .9))
camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = span * 1.6
scene.camera = camera
scene.render.filepath = str(output / f"{name}-neutral.png")
bpy.ops.render.render(write_still=True)

for ratio in (.70, .48):
    for obj in meshes:
        if obj.type != "MESH" or obj == plate:
            continue
        decimate = obj.modifiers.new("bounded traffic LOD", "DECIMATE")
        decimate.ratio = ratio if "body" in obj.name.lower() else max(.6, ratio)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    lods.append(export(len(lods)))

collision = output / f"{name}-collision.json"
collision.write_text(json.dumps({"schema": "bracken-quay.vehicle-collision/v1", "length_m": hi.y - lo.y,
                                 "width_m": hi.x - lo.x, "height_m": hi.z - lo.z,
                                 "wheel_count": len([obj for obj in meshes if "wheel" in obj.name.lower()])}, indent=2))
artifacts = [*lods, pathlib.Path(scene.render.filepath), collision]
manifest = {"schema": "bracken-quay.vehicle-derivative/v1", "source": source.name,
            "source_sha256": sha256(source), "source_url": "https://sketchfab.com/3d-models/generic-passenger-car-pack-20f9af9b8a404d5cb022ac6fe87f21f5",
            "license": "CC-BY-4.0", "attribution": '"Generic passenger car pack" by Comrade1280',
            "texture_sha256": {item.name: sha256(item) for item in (body_texture, wheel_texture)},
            "gpu_devices": [device.name for device in devices], "elapsed_seconds": round(time.monotonic() - started, 3),
            "artifacts": [{"name": item.name, "sha256": sha256(item), "bytes": item.stat().st_size} for item in artifacts]}
(output / f"{name}-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("BRACKEN_VEHICLE_MANIFEST=" + str(output / f"{name}-manifest.json"))
