"""Produce an auditable OpenX vehicle trial derivative on an admitted Blender worker.

blender -b --factory-startup --python bracken_openx_derivative.py -- SOURCE.glb OUTPUT_DIR
This does not decide licensing or final visual acceptance. The source is read-only.
"""

import hashlib
import json
import pathlib
import sys
import time

import bpy
from mathutils import Vector


started = time.monotonic()
source = pathlib.Path(sys.argv[-2]).resolve()
output = pathlib.Path(sys.argv[-1]).resolve()
if not source.is_file() or source.suffix.lower() != ".glb":
    raise RuntimeError("missing_or_invalid_openx_source")
name = source.stem.removeprefix("candidate-")
if name not in {"estate", "panel-van", "compact"}:
    raise RuntimeError("unapproved_openx_vehicle_name")
source_creators = {
    "estate": "OpenX/Vev Labs; Dogan Ulus; myedsu (CC-BY-4.0 source)",
    "panel-van": "OpenX/Vev Labs; Dogan Ulus; razor24 (CC-BY-4.0 source)",
    "compact": "OpenX/Vev Labs; Dogan Ulus; razor24 (CC-BY-4.0 source)",
}
output.mkdir(parents=True, exist_ok=True)


def digest(file):
    return hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()


def material(label, color, roughness=0.8):
    item = bpy.data.materials.new(label)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    return item


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
removed = []
for obj in list(bpy.data.objects):
    if obj.type == "MESH" and ("branding" in obj.name.lower() or "logo" in obj.name.lower()):
        removed.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(meshes) < 10 or not any("wheel" in obj.name.lower() for obj in meshes):
    raise RuntimeError("openx_vehicle_geometry_or_wheels_invalid")

# Brand removal is bounded to separable geometry and logo material slots.
# Do not erase the silhouette or pretend this makes the model legally generic.
plain_badge = material("neutral vehicle badge material", (0.09, 0.10, 0.11))
for obj in meshes:
    for index, item in enumerate(obj.data.materials):
        if item and ("logo" in item.name.lower() or "branding" in item.name.lower()):
            obj.data.materials[index] = plain_badge
    if "glass" in obj.name.lower() or "window" in obj.name.lower():
        for item in obj.data.materials:
            if item and item.use_nodes:
                shader = item.node_tree.nodes.get("Principled BSDF")
                if shader:
                    shader.inputs["Roughness"].default_value = 0.28


def bounds(objects):
    points = [obj.matrix_world @ Vector(vertex) for obj in objects
              for corner in obj.bound_box for vertex in [corner]]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return low, high


low, high = bounds(meshes)
extent = high - low
if not (3.2 < extent.x < 7.5 and 1.5 < extent.y < 3.3 and 1.2 < extent.z < 3.3):
    raise RuntimeError("openx_vehicle_scale_out_of_bounds")


def export(lod):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    target = output / f"{name}-lod{lod}.glb"
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB",
                              use_selection=True, export_apply=True)
    if not target.is_file() or target.stat().st_size < 50_000:
        raise RuntimeError("openx_export_missing:" + target.name)
    return target


artifacts = [export(0)]
for level, ratio in [(1, 0.68), (2, 0.57)]:
    for obj in meshes:
        if len(obj.data.polygons) < 80:
            continue
        modifier = obj.modifiers.new(f"bounded traffic LOD{level}", "DECIMATE")
        modifier.ratio = max(ratio, 0.75) if "wheel" in obj.name.lower() else ratio
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    artifacts.append(export(level))

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
scene.cycles.samples = 12
scene.render.resolution_x = 800
scene.render.resolution_y = 500
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
centre = (low + high) / 2
span = max(extent)

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, low.z - 0.04))
ground = bpy.context.object
ground.name = "neutral-review-ground"
ground.data.materials.append(material("neutral review ground", (0.29, 0.31, 0.32)))

for direction, energy in [((1.4, -1.1, 1.7), 650), ((-1.1, 0.9, 1.2), 350)]:
    data = bpy.data.lights.new("review area light", "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = span * 2
    obj = bpy.data.objects.new("review area light", data)
    bpy.context.collection.objects.link(obj)
    obj.location = centre + Vector(tuple(value * span for value in direction))
    obj.rotation_euler = (centre - obj.location).to_track_quat("-Z", "Y").to_euler()

camera_data = bpy.data.cameras.new("neutral review camera")
camera = bpy.data.objects.new("neutral review camera", camera_data)
bpy.context.collection.objects.link(camera)
camera_data.type = "ORTHO"
camera_data.ortho_scale = span * 1.65
scene.camera = camera
for side, offset in [("front", (1.7, -1.8, 0.85)), ("rear", (-1.7, 1.8, 0.85))]:
    camera.location = centre + Vector(tuple(value * span for value in offset))
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(output / f"{name}-{side}-review.png")
    bpy.ops.render.render(write_still=True)
    artifacts.append(pathlib.Path(scene.render.filepath))

collision = output / f"{name}-collision.json"
collision.write_text(json.dumps({"schema": "bracken-quay.vehicle-collision/v1",
                                 "length_m": round(extent.x, 4),
                                 "width_m": round(extent.y, 4),
                                 "height_m": round(extent.z, 4),
                                 "wheel_objects": len([obj for obj in meshes
                                                       if "wheel" in obj.name.lower()])}, indent=2))
artifacts.append(collision)
manifest = {"schema": "bracken-quay.openx-derivative/v1", "source": source.name,
            "source_sha256": digest(source),
            "source_url": "https://github.com/vevalabs/openx-assets/releases/tag/20250821",
            "source_creator": source_creators[name],
            "declared_source_licence": "MPL-2.0 AND CC-BY-4.0",
            "source_script_sha256": digest(__file__),
            "removed_separable_branding_objects": removed,
            "gpu_devices": [device.name for device in devices],
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "artifacts": [{"name": item.name, "sha256": digest(item),
                           "bytes": item.stat().st_size} for item in artifacts]}
manifest_path = output / f"{name}-manifest.json"
manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("BRACKEN_OPENX_MANIFEST=" + str(manifest_path))
