#!/usr/bin/env python3
"""Deterministically prepare Building 002 in Blender 4.5.9.

Run only through Blender; arguments following ``--`` are parsed here. The source
file is hash-checked before Blender opens it and is never written by this script.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

import bpy

EXPECTED_SHA256 = "caa62559dc36b70ebf5f4d2b8b3fe8e3d3b55ff2d45e829aa0293239b11b9d81"
EXCLUDED_OBJECTS = {"SmallGateVar1", "SmallGateVar2", "SmallGateVar3"}
PLANNING_ZONES = {
    "mezzanine": ((0.0, 0.0, 4.5), (8.0, 5.0, 0.5)),
    "stairs": ((-6.0, 0.0, 2.0), (2.0, 5.0, 4.0)),
    "living": ((5.0, 7.0, 1.5), (6.0, 5.0, 3.0)),
    "retro-computer": ((3.0, 4.0, 1.2), (2.0, 2.0, 2.4)),
    "utilities": ((-7.0, 7.0, 1.5), (4.0, 4.0, 3.0)),
    "portal": ((0.0, -8.0, 2.0), (4.0, 1.0, 4.0)),
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--working", required=True, type=Path)
    parser.add_argument("--glb", required=True, type=Path)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def validate_paths(source, working, glb):
    source = source.resolve()
    working = working.resolve()
    glb = glb.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    actual = digest(source)
    if actual != EXPECTED_SHA256:
        raise RuntimeError(f"source SHA-256 mismatch: expected {EXPECTED_SHA256}, got {actual}")
    if source in (working, glb) or working == glb:
        raise ValueError("source, working blend, and GLB paths must be distinct")
    repository = Path(__file__).resolve().parents[2]
    for output in (working, glb):
        if output == repository or repository in output.parents:
            raise ValueError(f"output must be outside the repository: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
    return source, working, glb, actual


def unlink_everywhere(obj):
    for collection in tuple(obj.users_collection):
        collection.objects.unlink(obj)


def make_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is not None:
        raise RuntimeError(f"reserved collection already exists: {name}")
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def preserve_source_and_duplicate_runtime():
    source_objects = sorted(bpy.context.scene.objects, key=lambda item: item.name)
    pristine = make_collection("SOURCE_PRISTINE")
    runtime = make_collection("RUNTIME_EXPORT")
    planning = make_collection("PLANNING_MARKERS_NON_RUNTIME")

    for obj in source_objects:
        unlink_everywhere(obj)
        pristine.objects.link(obj)
        obj.hide_render = True

    runtime_objects = []
    excluded = []
    for obj in source_objects:
        if obj.name in EXCLUDED_OBJECTS:
            excluded.append(obj.name)
            continue
        duplicate = obj.copy()
        if obj.data is not None:
            duplicate.data = obj.data.copy()
        duplicate.name = f"RUNTIME_{obj.name}"
        duplicate.hide_render = False
        runtime.objects.link(duplicate)
        runtime_objects.append(duplicate)

    for zone, (location, dimensions) in PLANNING_ZONES.items():
        marker = bpy.data.objects.new(f"PLAN_{zone}", None)
        marker.empty_display_type = "CUBE"
        marker.empty_display_size = 1.0
        marker.location = location
        marker.scale = tuple(value / 2.0 for value in dimensions)
        marker["planning_zone"] = zone
        marker["non_runtime"] = True
        planning.objects.link(marker)

    pristine.hide_render = True
    planning.hide_render = True
    return runtime_objects, sorted(excluded), sorted(PLANNING_ZONES)


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def main():
    args = parse_args()
    source, working, glb, source_hash = validate_paths(args.source, args.working, args.glb)

    # Opening happens only after the byte-level source check. Save a distinct copy
    # before any datablock or scene mutation; never save to the source path.
    bpy.ops.wm.open_mainfile(filepath=os.fspath(source))
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(working), copy=False, check_existing=False)

    runtime_objects, excluded, zones = preserve_source_and_duplicate_runtime()
    if set(excluded) != EXCLUDED_OBJECTS:
        missing = sorted(EXCLUDED_OBJECTS.difference(excluded))
        raise RuntimeError(f"expected excluded helper objects not found: {missing}")

    select_only(runtime_objects)
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(glb),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
        check_existing=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(working), copy=False, check_existing=False)

    result = {
        "source": os.fspath(source),
        "source_sha256": source_hash,
        "working_blend": os.fspath(working),
        "glb": os.fspath(glb),
        "runtime_object_count": len(runtime_objects),
        "excluded_objects": excluded,
        "planning_zones": zones,
        "animations_exported": False,
        "cameras_exported": False,
        "lights_exported": False,
        "compression_required": False,
    }
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
