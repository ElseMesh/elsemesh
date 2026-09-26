"""Build a skinned, animated GLB from an inspected KIRI OBJ/GLB scan.

Run with Blender in background mode:
  blender -b -t 4 --python build_character.py -- SOURCE CONFIG OUTPUT_DIR

The config must identify any deliberately removed disconnected component by
rank and face count. The original imported object is retained in the .blend.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def arguments():
    if "--" not in sys.argv:
        raise SystemExit("Expected -- SOURCE CONFIG OUTPUT_DIR")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise SystemExit("Expected SOURCE CONFIG OUTPUT_DIR")
    source = Path(values[0]).resolve(strict=True)
    config_path = Path(values[1]).resolve(strict=True)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("animation_donor"):
        config["animation_donor_path"] = str((config_path.parent / config["animation_donor"]).resolve(strict=True))
    out = Path(values[2]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    return source, config, out


def import_source(source):
    if source.suffix.lower() == ".obj":
        bpy.ops.wm.obj_import(filepath=str(source), forward_axis="NEGATIVE_Z", up_axis="Y")
    elif source.suffix.lower() in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(source))
    else:
        raise ValueError(f"Unsupported source: {source.suffix}")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise ValueError(f"This build accepts exactly one mesh; found {len(meshes)}")
    return meshes[0]


def components(mesh):
    parent = list(range(len(mesh.vertices)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for edge in mesh.edges:
        a, b = edge.vertices
        ra, rb = root(a), root(b)
        if ra != rb:
            parent[rb] = ra
    face_count = {}
    for poly in mesh.polygons:
        key = root(poly.vertices[0])
        face_count[key] = face_count.get(key, 0) + 1
    ordered = sorted(face_count, key=lambda key: face_count[key], reverse=True)
    rank = {key: i + 1 for i, key in enumerate(ordered)}
    return [rank.get(root(v.index), 0) for v in mesh.vertices], [face_count[key] for key in ordered]


def duplicate_and_clean(source, config):
    source_collection = bpy.data.collections.new("KIRI_SOURCE_UNTOUCHED")
    bpy.context.scene.collection.children.link(source_collection)
    for collection in list(source.users_collection):
        collection.objects.unlink(source)
    source_collection.objects.link(source)
    source.name = "Pristine_KIRI_source"
    work = source.copy()
    work.data = source.data.copy()
    bpy.context.scene.collection.objects.link(work)
    work.name = "Scanned_explorer"
    source.hide_render = True
    source.hide_set(True)

    ranks, counts = components(work.data)
    requested = config.get("remove_components", [])
    for removal in requested:
        rank = removal["rank"]
        expected = removal["expected_faces"]
        if rank < 1 or rank > len(counts) or counts[rank - 1] != expected:
            raise ValueError(f"Component {rank} does not match expected {expected} faces: {counts}")
    remove_ranks = {entry["rank"] for entry in requested}
    removed_vertices = sum(rank in remove_ranks for rank in ranks)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(work.data)
    bm.verts.ensure_lookup_table()
    gone = [bm.verts[i] for i, rank in enumerate(ranks) if rank in remove_ranks]
    if gone:
        bmesh.ops.delete(bm, geom=gone, context="VERTS")
    bm.to_mesh(work.data)
    bm.free()
    work.data.update()
    return work, {"components_before": counts, "removed_ranks": sorted(remove_ranks), "removed_vertices": removed_vertices}


def normalize(work, config):
    # The largest connected mesh is the person. Small detached pieces do not
    # control scale or ground placement.
    ranks, counts = components(work.data)
    points = [work.matrix_world @ vertex.co for vertex, rank in zip(work.data.vertices, ranks) if rank == 1]
    lo = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    hi = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    height = hi.z - lo.z
    if height <= 0:
        raise ValueError("Invalid body height")
    scale = config.get("target_height_m", 1.78) / height
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    rotation = Matrix.Rotation(math.radians(config.get("rotate_z_degrees", -90)), 3, "Z")
    for vertex in work.data.vertices:
        vertex.co = rotation @ ((work.matrix_world @ vertex.co - center) * scale)
    work.matrix_world = Matrix.Identity(4)
    work.data.update()
    return {"source_body_height": height, "target_height": config.get("target_height_m", 1.78), "scale_factor": scale,
            "source_body_bounds_min": list(lo), "source_body_bounds_max": list(hi), "components_after": counts}


def runtime_materials(work, texture_size):
    copied = {}
    for slot in work.material_slots:
        if not slot.material:
            continue
        old = slot.material
        if old not in copied:
            material = old.copy()
            material.name = f"Game_{old.name}"
            for node in material.node_tree.nodes if material.use_nodes else []:
                if node.type == "TEX_IMAGE" and node.image:
                    image = node.image.copy()
                    image.name = f"Game_{node.image.name}"
                    if max(image.size) > texture_size:
                        image.scale(texture_size, texture_size)
                    image.pack()
                    node.image = image
            copied[old] = material
        slot.material = copied[old]


def decimate(work, target_triangles):
    original = sum(len(poly.vertices) - 2 for poly in work.data.polygons)
    if target_triangles >= original:
        return original
    bpy.ops.object.select_all(action="DESELECT")
    work.hide_set(False)
    work.select_set(True)
    bpy.context.view_layer.objects.active = work
    modifier = work.modifiers.new("Game_triangle_budget", "DECIMATE")
    modifier.ratio = target_triangles / original
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return original


def make_armature(config):
    arm_data = bpy.data.armatures.new("Scanned_explorer_humanoid")
    arm = bpy.data.objects.new("Scanned_explorer_humanoid", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None, connected=False):
        item = arm_data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        if parent:
            item.parent = arm_data.edit_bones[parent]
            item.use_connect = connected
        return item

    bone("Hips", (0, 0, 0.89), (0, 0, 1.02))
    bone("Spine", (0, 0, 1.02), (0, 0, 1.28), "Hips", True)
    bone("Chest", (0, 0, 1.28), (0, 0, 1.48), "Spine", True)
    bone("Neck", (0, 0, 1.48), (0, 0, 1.57), "Chest", True)
    bone("Head", (0, 0, 1.57), (0, 0, 1.76), "Neck", True)
    for side, sign in (("L", 1), ("R", -1)):
        bone(f"{side}_UpperArm", (sign * 0.23, 0, 1.43), (sign * 0.29, 0, 1.14), "Chest")
        bone(f"{side}_Forearm", (sign * 0.29, 0, 1.14), (sign * 0.33, 0, 0.89), f"{side}_UpperArm", True)
        bone(f"{side}_Hand", (sign * 0.33, 0, 0.89), (sign * 0.34, 0, 0.72), f"{side}_Forearm", True)
        bone(f"{side}_Thigh", (sign * 0.11, 0, 0.91), (sign * 0.12, 0, 0.52), "Hips")
        bone(f"{side}_Shin", (sign * 0.12, 0, 0.52), (sign * 0.12, 0, 0.12), f"{side}_Thigh", True)
        bone(f"{side}_Foot", (sign * 0.12, 0, 0.12), (sign * 0.12, -0.14, 0.07), f"{side}_Shin", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind(work, arm):
    bpy.ops.object.select_all(action="DESELECT")
    work.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    groups = {group.name for group in work.vertex_groups}
    missing = [bone.name for bone in arm.data.bones if bone.name not in groups]
    if missing:
        raise ValueError(f"Auto weights did not create groups: {missing}")
    weighted = [vertex for vertex in work.data.vertices if vertex.groups]
    unweighted = [vertex for vertex in work.data.vertices if not vertex.groups]
    if unweighted:
        # Bone heat can miss tiny disconnected details. Copy the nearest
        # existing skin weights, without moving or deleting those vertices.
        from mathutils.kdtree import KDTree
        tree = KDTree(len(weighted))
        for vertex in weighted:
            tree.insert(vertex.co, vertex.index)
        tree.balance()
        for vertex in unweighted:
            _, neighbor_index, _ = tree.find(vertex.co)
            neighbor = work.data.vertices[neighbor_index]
            for assignment in neighbor.groups:
                work.vertex_groups[assignment.group].add([vertex.index], assignment.weight, "REPLACE")
    if any(not vertex.groups for vertex in work.data.vertices):
        raise ValueError("Some scan vertices remain unweighted")
    # Bone heat over-associates arms hanging close to the torso. Reinforce the
    # two side bands with an anatomical shoulder/elbow/wrist gradient; retain
    # smooth torso blending at the inner edge and shoulder.
    arm_refined = 0
    by_name = {group.name: group.index for group in work.vertex_groups}
    for vertex in work.data.vertices:
        x, _, z = vertex.co
        side = "L" if x >= 0 else "R"
        lateral = min(1.0, max(0.0, (abs(x) - 0.20) / 0.07))
        low_gate = min(1.0, max(0.0, (z - 0.67) / 0.1))
        high_gate = min(1.0, max(0.0, (1.52 - z) / 0.1))
        amount = lateral * low_gate * high_gate * 0.35
        if amount < 0.01:
            continue
        if z >= 1.13:
            anatomical = {f"{side}_UpperArm": 1.0}
        elif z >= 1.02:
            upper = (z - 1.02) / 0.11
            anatomical = {f"{side}_UpperArm": upper, f"{side}_Forearm": 1 - upper}
        elif z >= 0.85:
            anatomical = {f"{side}_Forearm": 1.0}
        else:
            forearm = min(1.0, max(0.0, (z - 0.72) / 0.13))
            anatomical = {f"{side}_Forearm": forearm, f"{side}_Hand": 1 - forearm}
        current = {entry.group: entry.weight for entry in vertex.groups}
        mixed = {group: weight * (1 - amount) for group, weight in current.items()}
        for name, weight in anatomical.items():
            index = by_name[name]
            mixed[index] = mixed.get(index, 0) + amount * weight
        for index in current:
            work.vertex_groups[index].remove([vertex.index])
        for index, weight in mixed.items():
            if weight > 0.0001:
                work.vertex_groups[index].add([vertex.index], weight, "REPLACE")
        arm_refined += 1
    limited = 0
    for vertex in work.data.vertices:
        assignments = sorted(((entry.group, entry.weight) for entry in vertex.groups), key=lambda pair: pair[1], reverse=True)
        if len(assignments) <= 4:
            continue
        limited += 1
        for group_index, _ in assignments[4:]:
            work.vertex_groups[group_index].remove([vertex.index])
        total = sum(weight for _, weight in assignments[:4])
        for group_index, weight in assignments[:4]:
            work.vertex_groups[group_index].add([vertex.index], weight / total, "REPLACE")
    return {"weighted_vertices": len(work.data.vertices), "bone_count": len(arm.data.bones),
            "repaired_bone_heat_misses": len(unweighted), "arm_vertices_refined": arm_refined,
            "limited_to_four_influences": limited}


def animate(arm):
    # The keyframes deform the scan around its neutral standing pose. Root
    # translation stays at zero; the game supplies world movement and heading.
    clips = {
        "idle": (48, [(0, 0), (12, 1), (24, 0), (36, -1), (48, 0)]),
        "walk": (32, [(0, 0), (8, 1), (16, 0), (24, -1), (32, 0)]),
        "run": (24, [(0, 0), (6, 1), (12, 0), (18, -1), (24, 0)]),
        "helm": (24, [(0, 0), (24, 0)]),
    }
    fps = 24
    bpy.context.scene.render.fps = fps
    arm.animation_data_create()
    for name, (end, phases) in clips.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm.animation_data.action = action
        for pose in arm.pose.bones:
            pose.rotation_mode = "XYZ"
        for frame, phase in phases:
            for side, sign in (("L", 1), ("R", -1)):
                values = {
                    f"{side}_Thigh": -1.0 if name == "helm" else (0.0 if name == "idle" else 0.34 if name == "walk" else 0.5) * phase * sign,
                    f"{side}_Shin": 1.05 if name == "helm" else (0.0 if name == "idle" else 0.18 if name == "walk" else 0.32) * max(0, -phase * sign),
                    f"{side}_Foot": -0.1 if name == "helm" else (0.0 if name == "idle" else 0.13) * max(0, phase * sign),
                    f"{side}_UpperArm": -0.16 if name == "helm" else (0.025 if name == "idle" else 0.27 if name == "walk" else 0.42) * phase * -sign,
                    f"{side}_Forearm": -0.12 if name == "helm" else (0.0 if name == "idle" else 0.12) * max(0, phase * sign),
                }
                for bone_name, angle in values.items():
                    pose = arm.pose.bones[bone_name]
                    pose.rotation_euler.x = angle
                    pose.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
            chest = arm.pose.bones["Chest"]
            chest.rotation_euler.z = (0.006 if name == "idle" else 0.035) * phase
            chest.keyframe_insert(data_path="rotation_euler", frame=frame, group="Chest")
            hips = arm.pose.bones["Hips"]
            hips.location.z = (0.008 if name == "idle" else 0.015 if name == "walk" else 0.025) * (1 - abs(phase))
            if name == "helm":
                hips.location.z = -0.28
            hips.keyframe_insert(data_path="location", frame=frame, group="Hips")
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action)
        track.mute = True
    arm.animation_data.action = None
    return {name: end / fps for name, (end, _) in clips.items()}


def retarget_locomotion(work, arm, donor_path):
    """Bake Mannequiny's hip-knee-ankle motion onto the scan's own rig."""
    with bpy.data.libraries.load(str(donor_path), link=False) as (available, loaded):
        if "root" not in available.objects or not {"walk", "run"}.issubset(available.actions):
            raise ValueError("Mannequiny donor is missing its root armature or walk/run actions")
        loaded.objects = ["root"]
        loaded.actions = ["walk", "run"]
    donor = loaded.objects[0]
    bpy.context.scene.collection.objects.link(donor)
    donor.hide_render = True
    donor.animation_data_create()
    actions = {name: action for name, action in zip(("walk", "run"), loaded.actions)}
    result = {}
    for name in ("walk", "run"):
        source_action = actions[name]
        target_action = bpy.data.actions[name]
        for curve in list(target_action.fcurves):
            target_action.fcurves.remove(curve)
        donor.animation_data.action = source_action
        arm.animation_data.action = target_action
        last = round(source_action.frame_range[1])
        knee_max = 0.0
        for frame in range(1, last + 1):
            bpy.context.scene.frame_set(1 if frame == last else frame)
            for side, suffix in (("L", "l"), ("R", "r")):
                source_thigh = donor.pose.bones[f"thigh.{suffix}"]
                source_calf = donor.pose.bones[f"calf.{suffix}"]
                thigh_vec = source_thigh.tail - source_thigh.head
                calf_vec = source_calf.tail - source_calf.head
                thigh_angle = math.atan2(thigh_vec.y, -thigh_vec.z)
                calf_angle = math.atan2(calf_vec.y, -calf_vec.z)
                # Mannequiny's long stylised stride is too wide for this
                # close-leg photogrammetry pose. Retain its contact timing,
                # but shorten the swing and preserve a readable knee flex.
                knee_angle = max(0.0, min(0.84, 0.60 * (calf_angle - thigh_angle)))
                thigh_angle *= 0.50
                knee_max = max(knee_max, knee_angle)
                values = {
                    f"{side}_Thigh": thigh_angle,
                    f"{side}_Shin": knee_angle,
                    f"{side}_Foot": -0.85 * (thigh_angle + knee_angle),
                    f"{side}_UpperArm": -0.62 * thigh_angle,
                    f"{side}_Forearm": 0.08 + 0.08 * abs(thigh_angle),
                }
                for bone_name, angle in values.items():
                    pose = arm.pose.bones[bone_name]
                    pose.rotation_euler.x = angle
                    pose.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
            # The player controller supplies horizontal movement and heading.
            # Place the actual skinned shoe geometry at water/terrain level;
            # armature foot tails do not coincide with the soles in a scan.
            hips = arm.pose.bones["Hips"]
            # This vertical bone's local Y axis is world Z; local Z moves
            # the character fore/aft and cannot correct foot clearance.
            hips.location.y = 0
            hips.location.z = 0
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = work.evaluated_get(depsgraph)
            posed_mesh = evaluated.to_mesh()
            sole = min((evaluated.matrix_world @ vertex.co).z for vertex in posed_mesh.vertices)
            evaluated.to_mesh_clear()
            hips.location.y = max(-0.45, min(0.18, 0.005 - sole))
            hips.keyframe_insert(data_path="location", frame=frame, group="Hips")
        for track in list(arm.animation_data.nla_tracks):
            if track.name == name:
                arm.animation_data.nla_tracks.remove(track)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, target_action)
        track.mute = True
        result[name] = {"source": str(donor_path), "source_frames": [1, last],
                        "duration_seconds": (last - 1) / bpy.context.scene.render.fps,
                        "max_knee_bend_degrees": round(math.degrees(knee_max), 1)}
    arm.animation_data.action = None
    bpy.data.objects.remove(donor, do_unlink=True)
    for action in actions.values():
        bpy.data.actions.remove(action, do_unlink=True)
    return result


def export(work, arm, out):
    bpy.ops.object.select_all(action="DESELECT")
    work.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    path = out / "scanned-explorer.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS",
        export_skins=True, export_yup=True, export_apply=False,
    )
    return path


def main():
    source_path, config, out = arguments()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    source = import_source(source_path)
    work, cleanup = duplicate_and_clean(source, config)
    normalized = normalize(work, config)
    original_triangles = decimate(work, config.get("target_triangles", 80000))
    runtime_materials(work, config.get("texture_size", 2048))
    arm = make_armature(config)
    bound = bind(work, arm)
    clips = animate(arm)
    donor_report = retarget_locomotion(work, arm, Path(config["animation_donor_path"])) if config.get("animation_donor_path") else None
    if donor_report:
        clips.update({name: entry["duration_seconds"] for name, entry in donor_report.items()})
    source.hide_set(True)
    source.hide_render = True
    game_triangles = sum(len(poly.vertices) - 2 for poly in work.data.polygons)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(work.data)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    bm.free()
    bpy.ops.wm.save_as_mainfile(filepath=str(out / "scanned-explorer-work.blend"))
    glb = export(work, arm, out)
    report = {"source": str(source_path), "cleanup": cleanup, "normalization": normalized,
              "original_triangles": original_triangles, "game_triangles": game_triangles,
              "game_vertices": len(work.data.vertices), "textures_max_dimension": config.get("texture_size", 2048),
              "game_materials": len({slot.material.name for slot in work.material_slots if slot.material}),
              "game_uv_layers": [layer.name for layer in work.data.uv_layers],
              "game_non_manifold_edges": non_manifold,
              "armature": bound, "clips_seconds": clips, "animation_donor": donor_report,
              "glb": str(glb), "glb_bytes": glb.stat().st_size}
    (out / "build-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
