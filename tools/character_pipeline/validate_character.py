"""Render neutral and locomotion poses from a built character .blend.

  blender -b -t 4 --python validate_character.py -- BUILD_BLEND OUTPUT_DIR
"""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise SystemExit("Expected -- BUILD_BLEND OUTPUT_DIR")
    source = Path(values[0]).resolve(strict=True)
    out = Path(values[1]).resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    work = bpy.data.objects["Scanned_explorer"]
    arm = bpy.data.objects["Scanned_explorer_humanoid"]
    work.hide_set(False)
    work.hide_render = False
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.25, 0.28, 0.33, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8

    def light(name, location, power, size):
        data = bpy.data.lights.new(name, "AREA")
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 0.9)) - obj.location).to_track_quat("-Z", "Y").to_euler()
        data.energy = power
        data.shape = "DISK"
        data.size = size

    light("Key", (-2, -3, 4), 450, 3)
    light("Fill", (2, -1, 2), 180, 3)
    light("Rim", (1, 2, 3), 350, 2)
    camera_data = bpy.data.cameras.new("Validation_camera")
    camera = bpy.data.objects.new("Validation_camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2.3
    results = []
    views = [
        ("neutral-front", None, 1, Vector((0, -3.8, 1.2))),
        ("neutral-rear", None, 1, Vector((0, 3.8, 1.2))),
        ("neutral-three-quarter", None, 1, Vector((2.3, -3.8, 1.2))),
        ("walk-contact", "walk", 8, Vector((0, -3.8, 1.2))),
        ("walk-side", "walk", 24, Vector((3.8, 0, 1.2))),
        ("run-contact", "run", 6, Vector((0, -3.8, 1.2))),
        ("run-side", "run", 18, Vector((3.8, 0, 1.2))),
        ("helm-side", "helm", 1, Vector((3.8, 0, 1.2))),
    ]
    for name, action, frame, position in views:
        arm.animation_data.action = bpy.data.actions.get(action) if action else None
        scene.frame_set(frame)
        camera.location = position
        camera.rotation_euler = (Vector((0, 0, 0.88)) - position).to_track_quat("-Z", "Y").to_euler()
        path = out / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"name": name, "action": action, "frame": frame, "path": str(path)})
    for name, rotations in (
        ("deformation-upper-body", {"L_UpperArm": (0.75, 0.1, 0), "L_Forearm": (-0.6, 0, 0),
                                    "R_UpperArm": (-0.45, 0, 0), "R_Forearm": (0.5, 0, 0), "Neck": (0, 0, 0.2)}),
        ("deformation-lower-body", {"L_Thigh": (0.65, 0, 0), "L_Shin": (-0.8, 0, 0),
                                    "R_Thigh": (-0.55, 0, 0), "R_Shin": (0.55, 0, 0)}),
    ):
        arm.animation_data.action = None
        for pose in arm.pose.bones:
            pose.rotation_euler = (0, 0, 0)
            pose.location = (0, 0, 0)
        for bone_name, angles in rotations.items():
            arm.pose.bones[bone_name].rotation_euler = angles
        camera.location = Vector((2.3, -3.8, 1.2))
        camera.rotation_euler = (Vector((0, 0, 0.88)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        path = out / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"name": name, "action": None, "frame": None, "path": str(path)})
    (out / "validation-views.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results))


if __name__ == "__main__":
    main()
