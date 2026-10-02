#!/usr/bin/env python3
"""Exercise the typed action runner inside Blender with a checked-in GLB."""
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ACTION_RUNNER = ROOT / "tools/blender/world_actions.py"
SOURCE_PATH = ROOT / "worlds/island/world-source.json"
OBJECT_ID = "tw-object:blender-runtime-check"


def temporary_root():
    prefix = os.environ.get("PREFIX", "")
    candidate = pathlib.Path(prefix) / "tmp" if prefix.startswith("/data/data/") else pathlib.Path("/var/tmp")
    candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def run(command, environment):
    result = subprocess.run(command, cwd=ROOT, env=environment, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError("command failed: %s\n%s%s" % (" ".join(map(str, command)), result.stdout, result.stderr))
    return result.stdout + result.stderr


def main():
    blender = os.environ.get("BLENDER_EXECUTABLE") or shutil.which("blender")
    if not blender:
        raise SystemExit("Blender not found; set BLENDER_EXECUTABLE to a Blender executable")
    blender = str(pathlib.Path(blender).resolve())
    source_bytes = SOURCE_PATH.read_bytes()
    source = json.loads(source_bytes)
    if any(record["id"] == OBJECT_ID for record in source["objects"]):
        raise SystemExit("runtime-check object ID already exists in the example source")
    asset_id = next(record["assetId"] for record in source["objects"] if record["id"].startswith("tw-object:scanned-debris-"))
    asset_path = ROOT / "worlds/island/assets" / asset_id.removeprefix("sha256:")
    plan = {
        "protocol": "elsemesh.blender-actions/1",
        "sourceHash": "sha256:" + hashlib.sha256(source_bytes).hexdigest(),
        "actions": [{
            "op": "object.add",
            "object": {
                "id": OBJECT_ID,
                "kind": "asset-instance",
                "label": "Blender runtime check",
                "assetId": asset_id,
                "priority": "visible",
                "transform": {"position": [0, 0, 0], "yaw": 0},
                "scale": [1, 1, 1],
                "collision": {"shape": "none", "enabled": False},
            },
        }],
    }

    with tempfile.TemporaryDirectory(prefix="elsemesh-blender-actions-", dir=temporary_root()) as temporary:
        work = pathlib.Path(temporary)
        plan_path = work / "plan.json"
        candidate_source = work / "candidate.world-source.json"
        candidate_blend = work / "candidate.blend"
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
        environment = os.environ.copy()
        environment.update({
            "BLENDER_USER_CONFIG": str(work / "config"),
            "BLENDER_USER_SCRIPTS": str(work / "scripts"),
            "BLENDER_USER_DATAFILES": str(work / "datafiles"),
            "PYTHONDONTWRITEBYTECODE": "1",
        })
        run([
            blender, "--background", "--factory-startup", "--python", str(ACTION_RUNNER), "--",
            "--plan", str(plan_path), "--source", str(SOURCE_PATH),
            "--assets", str(asset_path.parent), "--out-source", str(candidate_source),
            "--out-blend", str(candidate_blend),
        ], environment)

        candidate = json.loads(candidate_source.read_text(encoding="utf-8"))
        if not any(record["id"] == OBJECT_ID for record in candidate["objects"]):
            raise RuntimeError("candidate source is missing the new stable-ID object")
        if candidate_blend.stat().st_size < 100_000:
            raise RuntimeError("candidate Blender file is unexpectedly small")
        expression = "import bpy; assert any(o.get('elsemesh_action_id') == '%s' for o in bpy.data.objects); print('reopened-world-action-ok')" % OBJECT_ID
        output = run([blender, "--background", "--factory-startup", str(candidate_blend), "--python-expr", expression], environment)
        if "reopened-world-action-ok" not in output:
            raise RuntimeError("reopened Blender file did not confirm the stable-ID object")
        print("Blender runtime action passed: imported hash-verified GLB, wrote source and .blend candidates, reopened stable-ID object")


if __name__ == "__main__":
    main()
