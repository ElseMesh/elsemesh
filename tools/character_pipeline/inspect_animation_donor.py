"""Record armatures, meshes, and actions in an animation donor .blend.

blender -b DONOR.blend --python inspect_animation_donor.py -- REPORT.json
"""

import json
import sys
from pathlib import Path

import bpy


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) != 1:
        raise SystemExit("Expected -- REPORT.json")
    report = {
        "blend": bpy.data.filepath,
        "fps": bpy.context.scene.render.fps,
        "objects": [],
        "actions": [],
    }
    for obj in bpy.data.objects:
        if obj.type not in {"MESH", "ARMATURE"}:
            continue
        item = {"name": obj.name, "type": obj.type, "parent": obj.parent.name if obj.parent else None,
                "location": list(obj.location), "rotation": list(obj.rotation_euler), "scale": list(obj.scale),
                "dimensions": list(obj.dimensions)}
        if obj.type == "MESH":
            item["vertices"] = len(obj.data.vertices)
            item["vertex_groups"] = [group.name for group in obj.vertex_groups]
        else:
            item["bones"] = [{"name": bone.name, "parent": bone.parent.name if bone.parent else None,
                              "head": list(bone.head_local), "tail": list(bone.tail_local)}
                             for bone in obj.data.bones]
            item["nla"] = [{"name": track.name,
                            "strips": [{"name": strip.name, "action": strip.action.name if strip.action else None}
                                       for strip in track.strips]}
                           for track in obj.animation_data.nla_tracks] if obj.animation_data else []
        report["objects"].append(item)
    for action in bpy.data.actions:
        report["actions"].append({"name": action.name, "frame_range": list(action.frame_range),
                                  "slot_count": len(action.slots) if hasattr(action, "slots") else None,
                                  "fcurve_count": len(action.fcurves) if hasattr(action, "fcurves") else None})
    path = Path(args[0])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"objects": len(report["objects"]), "actions": [a["name"] for a in report["actions"]],
                      "report": str(path)}))


if __name__ == "__main__":
    main()
