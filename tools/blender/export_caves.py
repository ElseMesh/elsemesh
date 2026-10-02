import bpy, os, sys, shutil

def arg(name, default=None):
    if "--" not in sys.argv: return default
    args = sys.argv[sys.argv.index("--")+1:]
    try: return args[args.index(name)+1]
    except (ValueError, IndexError): return default

out = os.path.abspath(arg("--out", os.path.join(os.getcwd(), "public", "models", "world", "caves.glb")))
collection_name = arg("--collection", "ELSEMESH_Caves")
collection = bpy.data.collections.get(collection_name)
if not collection:
    raise RuntimeError(f"Collection {collection_name!r} not found")

for o in bpy.context.selected_objects:
    o.select_set(False)
selected = []
for o in collection.all_objects:
    if o.type in {"MESH", "CURVE"}:
        o.select_set(True)
        selected.append(o)
if not selected:
    raise RuntimeError(f"No exportable objects in {collection_name}")

bpy.context.view_layer.objects.active = selected[0]
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out, export_format="GLB", use_selection=True,
    export_apply=True, export_yup=True,
)
print(f"Exported {len(selected)} objects to {out}")
layout = os.path.join(os.path.dirname(__file__), "underneath-layout.json")
if os.path.exists(layout):
    manifest = os.path.join(os.path.dirname(out), "caves.json")
    shutil.copyfile(layout, manifest)
    print("Exported cave layout to", manifest)
