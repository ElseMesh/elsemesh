"""Extract the licensed Mannequiny armature and walk/run actions.

blender -b mannequiny-0.4.0.blend --python prepare_motion_donor.py -- OUT.blend
The original vendor file is never saved or changed.
"""

import sys
from pathlib import Path

import bpy


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) != 1:
        raise SystemExit("Expected -- OUT.blend")
    armature = bpy.data.objects.get("root")
    if not armature or armature.type != "ARMATURE":
        raise ValueError("Expected Mannequiny root armature")
    for obj in list(bpy.data.objects):
        if obj != armature:
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        if action.name not in {"walk", "run"}:
            bpy.data.actions.remove(action, do_unlink=True)
        else:
            action.use_fake_user = True
    if armature.animation_data:
        armature.animation_data.action = None
        for track in list(armature.animation_data.nla_tracks):
            armature.animation_data.nla_tracks.remove(track)
    path = Path(args[0]).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    print(f"Saved licensed motion donor: {path}")


if __name__ == "__main__":
    main()
