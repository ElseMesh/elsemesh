"""Import/export ElseMesh ThruHold source JSON from Blender.

Run: blender --background scene.blend --python tools/blender/world_source.py -- import world.json
     blender --background scene.blend --python tools/blender/world_source.py -- export world.json
The source document is retained in a Blender text block named ElseMeshThruHoldSource.
"""
import json
import math
import pathlib
import sys
import bpy

PROTOCOL = "tidewater.world-source/1"
TEXT_NAME = "ElseMeshThruHoldSource"
PREVIOUS_TEXT_NAME = "ThruholdWorldSource"
LEGACY_TEXT_NAME = "TidewaterWorldSource"


def args():
    values = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(values) != 2 or values[0] not in {"import", "export"}:
        raise SystemExit("expected: import|export path.json")
    return values[0], pathlib.Path(values[1])


def validate(source):
    if source.get("protocol") != PROTOCOL:
        raise ValueError("unsupported ThruHold source protocol")
    if not str(source.get("worldId", "")).startswith("tw-world:"):
        raise ValueError("missing worldId")
    if not isinstance(source.get("objects"), list) or not isinstance(source.get("portals"), list):
        raise ValueError("objects and portals must be arrays")
    return source


def to_blender(p):
    # ElseMesh right-handed Y-up -> Blender right-handed Z-up.
    return (p[0], -p[2], p[1])


def to_world_coordinates(p):
    return (p[0], p[2], -p[1])


def metadata_items(source):
    return [("object", item) for item in source["objects"]] + [("portal", item) for item in source["portals"]]


def import_source(path):
    source = validate(json.loads(path.read_text(encoding="utf-8")))
    collection = bpy.data.collections.get("ElseMesh ThruHold Source") or bpy.data.collections.get("Thruhold World Source") or bpy.data.collections.get("Tidewater World Source")
    if collection is None:
        collection = bpy.data.collections.new("ElseMesh ThruHold Source")
        bpy.context.scene.collection.children.link(collection)
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for kind, item in metadata_items(source):
        empty = bpy.data.objects.new(item.get("label") or item["id"], None)
        collection.objects.link(empty)
        empty.empty_display_type = "CUBE" if kind == "object" else "ARROWS"
        empty.location = to_blender(item.get("transform", item.get("entry"))["position"])
        empty["thruhold_kind"] = kind
        empty["thruhold_id"] = item["id"]
        empty["thruhold_record"] = json.dumps(item, separators=(",", ":"))
        if kind == "object":
            empty.scale = item.get("scale", (1, 1, 1))
            empty.rotation_euler[2] = float(item["transform"].get("yaw", 0))
    text = bpy.data.texts.get(TEXT_NAME) or bpy.data.texts.get(PREVIOUS_TEXT_NAME) or bpy.data.texts.get(LEGACY_TEXT_NAME) or bpy.data.texts.new(TEXT_NAME)
    text.clear()
    text.write(json.dumps(source, indent=2) + "\n")
    bpy.context.scene["thruhold_world_id"] = source["worldId"]
    print("Imported %d objects and %d portals" % (len(source["objects"]), len(source["portals"])))


def export_source(path):
    text = bpy.data.texts.get(TEXT_NAME) or bpy.data.texts.get(PREVIOUS_TEXT_NAME) or bpy.data.texts.get(LEGACY_TEXT_NAME)
    if text is None:
        raise ValueError("ElseMeshThruHoldSource text block is missing; import a source file first")
    source = validate(json.loads(text.as_string()))
    objects, portals = [], []
    for obj in bpy.data.objects:
        raw = obj.get("thruhold_record") or obj.get("tidewater_record")
        if not raw:
            continue
        item = json.loads(raw)
        kind = obj.get("thruhold_kind") or obj.get("tidewater_kind")
        position = list(to_world_coordinates(obj.location))
        if kind == "object":
            item["transform"]["position"] = position
            item["transform"]["yaw"] = float(obj.rotation_euler[2])
            item["scale"] = list(obj.scale)
            objects.append(item)
        elif kind == "portal":
            item["entry"]["position"] = position
            # Preserve portal yaw from the record; Blender portal markers currently expose location only.
            portals.append(item)
    source["objects"], source["portals"] = objects, portals
    source["updatedAt"] = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z")
    validate(source)
    path.write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8")
    print("Exported %d objects and %d portals to %s" % (len(objects), len(portals), path))


mode, target = args()
if mode == "import":
    import_source(target)
else:
    export_source(target)
