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
    parser.add_argument(
        "--max-texture-size",
        type=int,
        default=1024,
        help="maximum width or height for runtime texture copies (default: 1024)",
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    if args.max_texture_size < 1:
        parser.error("--max-texture-size must be a positive integer")
    return args


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


def image_dimensions(image):
    return int(image.size[0]), int(image.size[1])


def scaled_dimensions(width, height, maximum):
    largest = max(width, height)
    if largest <= maximum:
        return width, height
    scale = maximum / largest
    return max(1, int(width * scale)), max(1, int(height * scale))


def copy_runtime_material(source_material, material_cache, image_cache, maximum):
    if source_material is None:
        return None
    cached = material_cache.get(source_material)
    if cached is not None:
        return cached

    runtime_material = source_material.copy()
    runtime_material.name = f"RUNTIME_{source_material.name}"
    material_cache[source_material] = runtime_material
    if runtime_material.node_tree is None:
        return runtime_material

    for node in runtime_material.node_tree.nodes:
        source_image = getattr(node, "image", None)
        if source_image is None:
            continue
        runtime_image = image_cache.get(source_image)
        if runtime_image is None:
            runtime_image = source_image.copy()
            runtime_image.name = f"RUNTIME_{source_image.name}"
            width, height = image_dimensions(source_image)
            target_width, target_height = scaled_dimensions(width, height, maximum)
            if (target_width, target_height) != (width, height):
                runtime_image.scale(target_width, target_height)
            image_cache[source_image] = runtime_image
        node.image = runtime_image
    return runtime_material


def preserve_source_and_duplicate_runtime(max_texture_size):
    source_objects = sorted(bpy.context.scene.objects, key=lambda item: item.name)
    pristine = make_collection("SOURCE_PRISTINE")
    runtime = make_collection("RUNTIME_EXPORT")
    planning = make_collection("PLANNING_MARKERS_NON_RUNTIME")

    for obj in source_objects:
        unlink_everywhere(obj)
        pristine.objects.link(obj)
        obj.hide_render = True

    source_images = tuple(bpy.data.images)
    source_texture_sizes = [image_dimensions(image) for image in source_images]
    material_cache = {}
    image_cache = {}
    runtime_objects = []
    excluded = []
    for obj in source_objects:
        if obj.name in EXCLUDED_OBJECTS:
            excluded.append(obj.name)
            continue
        duplicate = obj.copy()
        if obj.data is not None:
            duplicate.data = obj.data.copy()
            for slot in duplicate.material_slots:
                slot.material = copy_runtime_material(
                    slot.material, material_cache, image_cache, max_texture_size
                )
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
    runtime_texture_sizes = [image_dimensions(image) for image in image_cache.values()]
    texture_metrics = {
        "source_texture_count": len(source_images),
        "source_texture_max_width": max((width for width, _ in source_texture_sizes), default=0),
        "source_texture_max_height": max((height for _, height in source_texture_sizes), default=0),
        "source_texture_max_dimension": max(
            (max(width, height) for width, height in source_texture_sizes), default=0
        ),
        "runtime_texture_count": len(runtime_texture_sizes),
        "runtime_texture_max_width": max(
            (width for width, _ in runtime_texture_sizes), default=0
        ),
        "runtime_texture_max_height": max(
            (height for _, height in runtime_texture_sizes), default=0
        ),
        "runtime_texture_max_dimension": max(
            (max(width, height) for width, height in runtime_texture_sizes), default=0
        ),
    }
    return (
        runtime_objects,
        sorted(excluded),
        sorted(PLANNING_ZONES),
        texture_metrics,
    )


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

    runtime_objects, excluded, zones, texture_metrics = (
        preserve_source_and_duplicate_runtime(args.max_texture_size)
    )
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
        "max_texture_size": args.max_texture_size,
        **texture_metrics,
        "output_byte_size": glb.stat().st_size,
        "animations_exported": False,
        "cameras_exported": False,
        "lights_exported": False,
        "compression_required": False,
    }
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
