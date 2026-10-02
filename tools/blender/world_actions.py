"""Apply a constrained, data-only editing plan in an isolated Blender copy.

The plan format accepts stable-ID asset placement and portal operations. It never
evaluates Python, expressions, file paths, shell commands, or Blender operator names.
Run from Blender with:
  blender working-copy.blend --background --python tools/blender/world_actions.py -- \
    --plan plan.json --source world-source.json --assets assets/ \
    --out-source candidate.world-source.json --out-blend candidate.blend
"""
import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
import os
import tempfile

PROTOCOL = "elsemesh.blender-actions/1"
MAX_PLAN_BYTES = 16 * 1024 * 1024
MAX_ASSET_BYTES = 128 * 1024 * 1024
MAX_ACTIONS = 256
OBJECT_ID = re.compile(r"^tw-object:[\w.-]{1,128}$")
PORTAL_ID = re.compile(r"^tw-portal:[\w.-]{1,128}$")
ASSET_ID = re.compile(r"^sha256:[0-9a-f]{64}$")
OBJECT_FIELDS = {"label", "priority", "streamingBounds", "transform", "scale", "collision"}
PORTAL_FIELDS = {"destinationWorldId", "destinationPeerId", "destinationGateway", "entry", "exit", "openView", "enabled", "visual"}
PRIORITIES = {"portal-preview", "visible", "nearby", "background"}


def read_bytes(path, maximum):
    path = pathlib.Path(path)
    if not path.is_file() or path.stat().st_size > maximum:
        raise ValueError("input must be a regular file within its size limit")
    data = path.read_bytes()
    if len(data) > maximum:
        raise ValueError("input grew beyond its size limit while being read")
    return data


def vector(value, name, maximum=1000000):
    if not isinstance(value, list) or len(value) != 3 or any(not finite_number(x) or abs(x) > maximum for x in value):
        raise ValueError("%s must be a bounded finite 3-vector" % name)


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def require_keys(record, required, allowed, name):
    if not isinstance(record, dict) or not set(required).issubset(record) or not set(record).issubset(allowed):
        raise ValueError("invalid %s fields" % name)


def validate_source(source):
    if not isinstance(source, dict) or source.get("protocol") != "tidewater.world-source/1":
        raise ValueError("unsupported world source protocol")
    if not isinstance(source.get("objects"), list) or not isinstance(source.get("portals"), list):
        raise ValueError("source objects and portals must be arrays")
    seen = set()
    for record in source["objects"]:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not OBJECT_ID.fullmatch(record["id"]) or record["id"] in seen:
            raise ValueError("invalid or duplicate object ID")
        seen.add(record["id"])
        if not ASSET_ID.fullmatch(record.get("assetId") or ""):
            raise ValueError("object %s requires an imported content-addressed asset" % record["id"])
        if record.get("priority", "visible") not in PRIORITIES:
            raise ValueError("invalid object streaming priority")
        if record.get("kind") != "asset-instance":
            raise ValueError("unsupported object kind")
        transform = record.get("transform")
        if not isinstance(transform, dict) or not finite_number(transform.get("yaw")):
            raise ValueError("object %s has an invalid transform" % record["id"])
        vector(transform.get("position"), "object position")
        vector(record.get("scale"), "object scale")
        if any(scale <= 0 or scale > 1000 for scale in record["scale"]):
            raise ValueError("object scale is outside the supported range")
        collision = record.get("collision")
        if not isinstance(collision, dict) or not isinstance(collision.get("enabled"), bool):
            raise ValueError("object %s requires collision intent" % record["id"])
        if collision["enabled"]:
            shape = collision.get("shape")
            if shape == "box":
                vector(collision.get("center"), "collision center")
                vector(collision.get("halfExtents"), "collision half extents")
                if any(x <= 0 or x > 1000 for x in collision["halfExtents"]):
                    raise ValueError("collision half extents are outside the supported range")
            elif shape == "compound":
                boxes = collision.get("boxes")
                if not isinstance(boxes, list) or not 1 <= len(boxes) <= 2048:
                    raise ValueError("compound collision requires 1 to 2048 boxes")
                for box in boxes:
                    if not isinstance(box, dict):
                        raise ValueError("compound collision box must be an object")
                    vector(box.get("center"), "compound collision center")
                    vector(box.get("halfExtents"), "compound collision half extents")
                    if any(x <= 0 or x > 1000 for x in box["halfExtents"]):
                        raise ValueError("compound collision half extents are outside the supported range")
                    if not finite_number(box.get("yaw")) or abs(box["yaw"]) > 360:
                        raise ValueError("compound collision yaw is outside the supported range")
                    if not isinstance(box.get("walkable"), bool) or not isinstance(box.get("solid"), bool):
                        raise ValueError("compound collision requires walkable and solid flags")
            elif shape == "heightfield":
                if collision.get("walkable") is not True or collision.get("solid") is not True:
                    raise ValueError("heightfield collision must be walkable and solid")
            else:
                raise ValueError("unsupported enabled collision shape")
    for record in source["portals"]:
        if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not PORTAL_ID.fullmatch(record["id"]) or record["id"] in seen:
            raise ValueError("invalid or duplicate portal ID")
        seen.add(record["id"])
        for key in ("entry", "exit"):
            point = record.get(key)
            if not isinstance(point, dict) or not finite_number(point.get("yaw")):
                raise ValueError("portal %s has an invalid %s transform" % (record["id"], key))
            vector(point.get("position"), "portal %s position" % key)
        if not isinstance(record.get("destinationWorldId"), str) or not record["destinationWorldId"].startswith("tw-world:"):
            raise ValueError("portal %s requires a destination world" % record["id"])
        if not isinstance(record.get("openView"), bool) or not isinstance(record.get("enabled"), bool):
            raise ValueError("portal %s requires boolean openView and enabled" % record["id"])
        visual = record.get("visual")
        if visual is not None and (not isinstance(visual, str) or visual not in {"timber", "stone", "metal"}):
            raise ValueError("portal %s visual must be timber, stone, or metal" % record["id"])
    return source


def validate_plan(plan, source_bytes):
    source_hash = "sha256:" + hashlib.sha256(source_bytes).hexdigest()
    if not isinstance(plan, dict) or plan.get("protocol") != PROTOCOL or plan.get("sourceHash") != source_hash:
        raise ValueError("action plan does not match this world source snapshot")
    actions = plan.get("actions")
    if not isinstance(actions, list) or len(actions) > MAX_ACTIONS:
        raise ValueError("action plan has an invalid actions list")
    source = validate_source(json.loads(source_bytes, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite JSON number"))))
    source = json.loads(json.dumps(source))
    records = {record["id"]: record for record in source["objects"] + source["portals"]}
    normalized = []
    for action in actions:
        if not isinstance(action, dict) or not isinstance(action.get("op"), str):
            raise ValueError("each Blender action must be a typed object")
        op = action["op"]
        if op == "object.add":
            require_keys(action, {"op", "object"}, {"op", "object"}, op)
            record = action["object"]
            if not isinstance(record, dict) or not OBJECT_ID.fullmatch(record.get("id", "")) or record["id"] in records:
                raise ValueError("object.add requires a new stable object ID")
            validate_source({**source, "objects": [*source["objects"], record]})
            records[record["id"]] = record
            source["objects"].append(record)
            normalized.append(action)
        elif op == "object.update":
            require_keys(action, {"op", "id", "fields"}, {"op", "id", "fields"}, op)
            target = records.get(action["id"])
            fields = action["fields"]
            if target not in source["objects"] or not isinstance(fields, dict) or not fields or not set(fields).issubset(OBJECT_FIELDS):
                raise ValueError("object.update targets a source object and allows only editable fields")
            updated = {**target, **fields}
            validate_source({**source, "objects": [updated if x["id"] == target["id"] else x for x in source["objects"]]})
            target.update(fields)
            normalized.append(action)
        elif op == "object.remove":
            require_keys(action, {"op", "id"}, {"op", "id"}, op)
            if action["id"] not in records or records[action["id"]] not in source["objects"]:
                raise ValueError("object.remove requires an existing source object")
            source["objects"] = [x for x in source["objects"] if x["id"] != action["id"]]
            del records[action["id"]]
            normalized.append(action)
        elif op == "portal.add":
            require_keys(action, {"op", "portal"}, {"op", "portal"}, op)
            record = action["portal"]
            if not isinstance(record, dict) or not PORTAL_ID.fullmatch(record.get("id", "")) or record["id"] in records:
                raise ValueError("portal.add requires a new stable portal ID")
            validate_source({**source, "portals": [*source["portals"], record]})
            records[record["id"]] = record
            source["portals"].append(record)
            normalized.append(action)
        elif op == "portal.update":
            require_keys(action, {"op", "id", "fields"}, {"op", "id", "fields"}, op)
            target = records.get(action["id"])
            fields = action["fields"]
            if target not in source["portals"] or not isinstance(fields, dict) or not fields or not set(fields).issubset(PORTAL_FIELDS):
                raise ValueError("portal.update targets a source portal and allows only editable fields")
            updated = {**target, **fields}
            validate_source({**source, "portals": [updated if x["id"] == target["id"] else x for x in source["portals"]]})
            target.update(fields)
            normalized.append(action)
        elif op == "portal.remove":
            require_keys(action, {"op", "id"}, {"op", "id"}, op)
            if action["id"] not in records or records[action["id"]] not in source["portals"]:
                raise ValueError("portal.remove requires an existing source portal")
            source["portals"] = [x for x in source["portals"] if x["id"] != action["id"]]
            del records[action["id"]]
            normalized.append(action)
        else:
            raise ValueError("unsupported Blender action: %s" % op)
    return source, normalized


def blender_position(position):
    return (position[0], -position[2], position[1])


def find_preview(bpy, kind, stable_id):
    return next((obj for obj in bpy.data.objects if
                 (obj.get("elsemesh_action_kind") == kind and obj.get("elsemesh_action_id") == stable_id) or
                 (obj.get("thruhold_kind") == kind and obj.get("thruhold_id") == stable_id)), None)


def remove_preview(bpy, root):
    if root is None:
        return
    descendants = {root}
    while True:
        children = {obj for obj in bpy.data.objects if obj.parent in descendants}
        new = children - descendants
        if not new:
            break
        descendants.update(new)
    for obj in descendants:
        bpy.data.objects.remove(obj, do_unlink=True)


def apply_to_blender(actions, assets_dir):
    import bpy

    collection = bpy.data.collections.get("ElseMesh AI Preview")
    if collection is None:
        collection = bpy.data.collections.new("ElseMesh AI Preview")
        bpy.context.scene.collection.children.link(collection)
    for action in actions:
        op = action["op"]
        if op == "object.add":
            record = action["object"]
            if find_preview(bpy, "object", record["id"]) is not None:
                raise ValueError("object.add already exists in the Blender scene: " + record["id"])
            digest = record["assetId"].split(":", 1)[1]
            asset = pathlib.Path(assets_dir) / digest
            asset_bytes = read_bytes(asset, MAX_ASSET_BYTES)
            if "sha256:" + hashlib.sha256(asset_bytes).hexdigest() != record["assetId"]:
                raise ValueError("object asset is missing, oversized, or has a bad content hash")
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(asset))
            imported = [obj for obj in bpy.data.objects if obj not in before]
            if not imported:
                raise ValueError("asset import produced no Blender objects")
            root = bpy.data.objects.new(record.get("label") or record["id"], None)
            collection.objects.link(root)
            for obj in imported:
                obj.parent = root
                for old_collection in list(obj.users_collection):
                    old_collection.objects.unlink(obj)
                collection.objects.link(obj)
            root["elsemesh_action_kind"] = "object"
            root["elsemesh_action_id"] = record["id"]
            root["thruhold_kind"] = "object"
            root["thruhold_id"] = record["id"]
            root["thruhold_record"] = json.dumps(record, separators=(",", ":"))
            root.location = blender_position(record["transform"]["position"])
            root.rotation_euler[2] = float(record["transform"].get("yaw", 0))
            root.scale = record["scale"]
        elif op == "object.update":
            root = find_preview(bpy, "object", action["id"])
            if root is None:
                raise ValueError("object.update has no matching Blender source marker: " + action["id"])
            fields = action["fields"]
            if "transform" in fields:
                root.location = blender_position(fields["transform"]["position"])
                root.rotation_euler[2] = float(fields["transform"].get("yaw", 0))
            if "scale" in fields:
                root.scale = fields["scale"]
            if "label" in fields:
                root.name = fields["label"]
            try:
                record = json.loads(root.get("thruhold_record", "{}"))
            except (TypeError, json.JSONDecodeError):
                record = {}
            record.update(fields)
            root["thruhold_record"] = json.dumps(record, separators=(",", ":"))
        elif op == "object.remove":
            root = find_preview(bpy, "object", action["id"])
            if root is None:
                raise ValueError("object.remove has no matching Blender source marker: " + action["id"])
            remove_preview(bpy, root)
        elif op == "portal.add":
            record = action["portal"]
            if find_preview(bpy, "portal", record["id"]) is not None:
                raise ValueError("portal.add already exists in the Blender scene: " + record["id"])
            marker = bpy.data.objects.new(record["id"], None)
            collection.objects.link(marker)
            marker.empty_display_type = "ARROWS"
            marker.location = blender_position(record["entry"]["position"])
            marker.rotation_euler[2] = float(record["entry"].get("yaw", 0))
            marker["elsemesh_action_kind"] = "portal"
            marker["elsemesh_action_id"] = record["id"]
            marker["thruhold_kind"] = "portal"
            marker["thruhold_id"] = record["id"]
            marker["thruhold_record"] = json.dumps(record, separators=(",", ":"))
        elif op == "portal.update":
            marker = find_preview(bpy, "portal", action["id"])
            if marker is None:
                raise ValueError("portal.update has no matching Blender source marker: " + action["id"])
            fields = action["fields"]
            if "entry" in fields:
                entry = fields["entry"]
                marker.location = blender_position(entry["position"])
                marker.rotation_euler[2] = float(entry.get("yaw", 0))
            record = json.loads(marker.get("thruhold_record", "{}"))
            record.update(fields)
            marker["thruhold_record"] = json.dumps(record, separators=(",", ":"))
        elif op == "portal.remove":
            marker = find_preview(bpy, "portal", action["id"])
            if marker is None:
                raise ValueError("portal.remove has no matching Blender source marker: " + action["id"])
            remove_preview(bpy, marker)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--assets", required=True)
    parser.add_argument("--out-source", required=True)
    parser.add_argument("--out-blend", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    plan_bytes = read_bytes(args.plan, MAX_PLAN_BYTES)
    source_bytes = read_bytes(args.source, MAX_PLAN_BYTES)
    plan = json.loads(plan_bytes, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite JSON number")))
    source, actions = validate_plan(plan, source_bytes)
    output_source = pathlib.Path(args.out_source).resolve()
    output_blend = pathlib.Path(args.out_blend).resolve()
    if os.path.lexists(output_source) or os.path.lexists(output_blend):
        raise ValueError("candidate output paths must not already exist")
    if output_source == output_blend:
        raise ValueError("candidate source and Blender output paths must differ")
    bpy = sys.modules.get("bpy")
    if bpy is None:
        raise RuntimeError("This action runner must execute inside Blender")
    apply_to_blender(actions, args.assets)
    bpy.data.texts.get("ElseMeshThruHoldSource") or bpy.data.texts.new("ElseMeshThruHoldSource")
    text = bpy.data.texts["ElseMeshThruHoldSource"]
    text.clear()
    text.write(json.dumps(source, indent=2) + "\n")
    output_source.parent.mkdir(parents=True, exist_ok=True)
    output_blend.parent.mkdir(parents=True, exist_ok=True)
    source_fd, staged_source_name = tempfile.mkstemp(prefix=".elsemesh-source-", dir=output_source.parent)
    os.close(source_fd)
    blend_fd, staged_blend_name = tempfile.mkstemp(prefix=".elsemesh-blend-", suffix=".blend", dir=output_blend.parent)
    os.close(blend_fd)
    staged_blend = pathlib.Path(staged_blend_name)
    staged_blend.unlink()
    committed_blend = False
    try:
        pathlib.Path(staged_source_name).write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8", newline="\n")
        bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend))
        os.replace(staged_blend, output_blend)
        committed_blend = True
        os.replace(staged_source_name, output_source)
    except Exception:
        pathlib.Path(staged_source_name).unlink(missing_ok=True)
        staged_blend.unlink(missing_ok=True)
        if committed_blend:
            output_blend.unlink(missing_ok=True)
        raise
    print("Wrote unsigned candidate source and Blender scene; review both before publication.")


if __name__ == "__main__" and "bpy" in sys.modules:
    main()
