"""Import an untouched scan and record geometry, material, rig and view evidence.

Run with Blender in background mode:
  blender -b -t 4 --python inspect_scan.py -- SOURCE_FILE OUTPUT_DIR

The source file is read only. All output is written under OUTPUT_DIR.
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


def args():
    if "--" not in sys.argv:
        raise SystemExit("Expected -- SOURCE_FILE OUTPUT_DIR")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise SystemExit("Expected exactly SOURCE_FILE OUTPUT_DIR")
    source = Path(values[0]).resolve(strict=True)
    out = Path(values[1]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    return source, out


def import_scan(source):
    ext = source.suffix.lower()
    if ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(source), forward_axis="NEGATIVE_Z", up_axis="Y")
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(source))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source))
    else:
        raise ValueError(f"Unsupported scan format: {ext}")


def mesh_report(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundaries = sum(1 for e in bm.edges if e.is_boundary)
    non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    bm.free()
    parents = list(range(len(mesh.vertices)))

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for edge in mesh.edges:
        a, b = edge.vertices
        ra, rb = root(a), root(b)
        if ra != rb:
            parents[rb] = ra
    groups = {}
    for vertex in mesh.vertices:
        key = root(vertex.index)
        group = groups.setdefault(key, {"vertices": 0, "faces": 0, "min": [math.inf] * 3, "max": [-math.inf] * 3})
        group["vertices"] += 1
        for i in range(3):
            group["min"][i] = min(group["min"][i], vertex.co[i])
            group["max"][i] = max(group["max"][i], vertex.co[i])
    for polygon in mesh.polygons:
        groups[root(polygon.vertices[0])]["faces"] += 1
    sorted_groups = sorted(groups.values(), key=lambda group: group["faces"], reverse=True)
    edge_lengths = sorted(
        (mesh.vertices[e.vertices[0]].co - mesh.vertices[e.vertices[1]].co).length for e in mesh.edges
    )
    n = len(edge_lengths)
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "polygons": len(mesh.polygons),
        "triangles": sum(max(0, len(p.vertices) - 2) for p in mesh.polygons),
        "uv_layers": [layer.name for layer in mesh.uv_layers],
        "boundary_edges": boundaries,
        "non_manifold_edges": non_manifold,
        "loose_vertices": loose,
        "connected_component_count": len(sorted_groups),
        "largest_components": sorted_groups[:20],
        "small_component_count_under_100_faces": sum(group["faces"] < 100 for group in sorted_groups),
        "small_component_face_total_under_100_faces": sum(group["faces"] for group in sorted_groups if group["faces"] < 100),
        "edge_length_quantiles": {str(q): edge_lengths[min(n - 1, int((n - 1) * q))] for q in (0.5, 0.9, 0.99, 0.999, 1.0)},
        "edges_longer_than_0_1m": sum(length > 0.1 for length in edge_lengths),
        "edges_longer_than_0_25m": sum(length > 0.25 for length in edge_lengths),
        "edges_longer_than_0_5m": sum(length > 0.5 for length in edge_lengths),
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "modifiers": [modifier.type for modifier in obj.modifiers],
        "dimensions": list(obj.dimensions),
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
    }


def texture_report(materials):
    textures = {}
    channels = {}
    for material in materials:
        if not material or not material.use_nodes:
            continue
        entries = []
        for node in material.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            image = node.image
            textures[image.name] = {
                "size": list(image.size),
                "format": image.file_format,
                "filepath": bpy.path.abspath(image.filepath),
                "channels": image.channels,
            }
            outputs = []
            for socket in node.outputs:
                for link in socket.links:
                    outputs.append(f"{link.to_node.name}.{link.to_socket.name}")
            entries.append({"image": image.name, "links": outputs})
        channels[material.name] = entries
    return textures, channels


def bounds(objects):
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = [min(point[i] for point in corners) for i in range(3)]
    high = [max(point[i] for point in corners) for i in range(3)]
    return low, high


def render_evidence(meshes, low, high, out):
    center = Vector([(low[i] + high[i]) / 2 for i in range(3)])
    size = max(high[i] - low[i] for i in range(3))
    if size <= 0:
        size = 1
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.color = (0.16, 0.16, 0.16)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.7, 0.76, 0.84, 1)
    background.inputs["Strength"].default_value = 1.4
    scene.view_settings.view_transform = "Standard"
    lamp_data = bpy.data.lights.new("Evidence_area", "AREA")
    lamp = bpy.data.objects.new("Evidence_area", lamp_data)
    scene.collection.objects.link(lamp)
    lamp.location = center + Vector((size, -size, size))
    lamp.rotation_euler = (center - lamp.location).to_track_quat("-Z", "Y").to_euler()
    lamp_data.energy = 1800
    lamp_data.shape = "DISK"
    lamp_data.size = size * 2
    camera_data = bpy.data.cameras.new("Evidence_camera")
    camera = bpy.data.objects.new("Evidence_camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = size * 1.65
    for name, direction in (
        ("front", Vector((0, -1, 0))),
        ("rear", Vector((0, 1, 0))),
        ("left", Vector((-1, 0, 0))),
        ("right", Vector((1, 0, 0))),
        ("three_quarter", Vector((1, -1, 0.45))),
    ):
        camera.location = center + direction.normalized() * size * 2.6
        camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(out / f"untouched-{name}.png")
        bpy.ops.render.render(write_still=True)
    # Wireframe evidence uses disposable duplicates; the imported source stays pristine.
    copies = []
    for obj in meshes:
        duplicate = obj.copy()
        duplicate.data = obj.data.copy()
        scene.collection.objects.link(duplicate)
        duplicate.modifiers.new("Evidence_wire", "WIREFRAME").thickness = size * 0.0015
        copies.append(duplicate)
        obj.hide_render = True
    camera.location = center + Vector((1, -1, 0.45)).normalized() * size * 2.6
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(out / "untouched-wireframe.png")
    bpy.ops.render.render(write_still=True)
    for obj in meshes:
        obj.hide_render = False
    for obj in copies:
        bpy.data.objects.remove(obj, do_unlink=True)


def main():
    source, out = args()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    import_scan(source)
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if not meshes:
        raise ValueError("Import produced no meshes")
    bpy.context.view_layer.update()
    low, high = bounds(meshes)
    materials = {slot.material for obj in meshes for slot in obj.material_slots if slot.material}
    textures, channels = texture_report(materials)
    report = {
        "source": str(source),
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "format": source.suffix.lower().lstrip("."),
        "file_size_bytes": source.stat().st_size,
        "mesh_count": len(meshes),
        "meshes": [mesh_report(obj) for obj in meshes],
        "material_count": len(materials),
        "material_names": sorted(material.name for material in materials),
        "texture_count": len(textures),
        "textures": textures,
        "material_image_links": channels,
        "armature_count": len(armatures),
        "armatures": [{"name": obj.name, "bones": [
            {"name": bone.name, "parent": bone.parent.name if bone.parent else None}
            for bone in obj.data.bones]} for obj in armatures],
        "bounds_min": low,
        "bounds_max": high,
        "dimensions": [high[i] - low[i] for i in range(3)],
        "orientation_note": "View directions are Blender axes; anatomical front requires visual confirmation.",
        "animations": sorted(bpy.data.actions.keys()),
    }
    (out / "untouched-asset-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    render_evidence(meshes, low, high, out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "untouched-import.blend"))
    print(json.dumps({"mesh_count": len(meshes), "dimensions": report["dimensions"], "report": str(out / "untouched-asset-report.json")}))


if __name__ == "__main__":
    main()
