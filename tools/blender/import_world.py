import bpy, json, os, sys
from array import array

def arg(name, default=None):
    if "--" not in sys.argv: return default
    args = sys.argv[sys.argv.index("--")+1:]
    try: return args[args.index(name)+1]
    except (ValueError, IndexError): return default

root = os.path.abspath(arg("--world", os.path.join(os.getcwd(), "artifacts", "world")))
step = max(1, int(arg("--step", "4")))
with open(os.path.join(root, "terrain.json"), "r", encoding="utf8") as f:
    meta = json.load(f)
res = int(meta["resolution"])
origin = float(meta["origin"])
texel = float(meta["texel"])

heights = array("f")
with open(os.path.join(root, "heightmap.f32"), "rb") as f:
    heights.fromfile(f, res * res)

for obj in list(bpy.data.objects):
    if obj.name.startswith("ELSEMESH_"): bpy.data.objects.remove(obj, do_unlink=True)

cols = {}
for name in ("ELSEMESH_World", "ELSEMESH_Terrain", "ELSEMESH_Features", "ELSEMESH_Caves"):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(c)
    cols[name] = c
nx = (res - 1) // step + 1
ny = (res - 1) // step + 1
verts = []
faces = []
for j in range(ny):
    iz = min(j * step, res - 1)
    for i in range(nx):
        ix = min(i * step, res - 1)
        x = origin + ix * texel
        game_z = origin + iz * texel
        z = heights[iz * res + ix]
        verts.append((x, -game_z, z))

for j in range(ny - 1):
    for i in range(nx - 1):
        a = j * nx + i
        faces.append((a, a+1, a+1+nx, a+nx))

mesh = bpy.data.meshes.new("ELSEMESH_TerrainMesh")
mesh.from_pydata(verts, [], faces)
mesh.update()
terrain = bpy.data.objects.new("ELSEMESH_Terrain", mesh)
cols["ELSEMESH_Terrain"].objects.link(terrain)

mat = bpy.data.materials.new("ELSEMESH_TerrainPreview")
mat.diffuse_color = (0.16, 0.28, 0.12, 1.0)
terrain.data.materials.append(mat)
features_path = os.path.join(root, "world-features.geojson")
if os.path.exists(features_path):
    with open(features_path, "r", encoding="utf8") as f:
        geo = json.load(f)
    for feat in geo.get("features", []):
        g = feat.get("geometry", {})
        props = feat.get("properties", {})
        if g.get("type") == "LineString":
            curve = bpy.data.curves.new("ELSEMESH_Path", "CURVE")
            curve.dimensions = "3D"
            curve.bevel_depth = max(0.08, float(props.get("halfWidthMetres", 0.5)) * 0.15)
            spline = curve.splines.new("POLY")
            coords = g["coordinates"]
            spline.points.add(len(coords)-1)
            for p, (x, y) in zip(spline.points, coords):
                ix = min(res-1, max(0, round((x-origin)/texel)))
                iz = min(res-1, max(0, round(((-y)-origin)/texel)))
                p.co = (x, y, heights[iz*res+ix] + 0.15, 1)
            obj = bpy.data.objects.new(f"ELSEMESH_Path_{props.get('id','')}", curve)
            cols["ELSEMESH_Features"].objects.link(obj)

bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.context.scene["elsemesh_world"] = root
bpy.context.scene["elsemesh_import_step"] = step
print(f"ElseMesh: imported {nx}x{ny} terrain preview from {root}")
out = arg("--save", "")
if out:
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print("Saved", out)
