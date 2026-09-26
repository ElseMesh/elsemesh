"""Build the first UNDERNEATH cave in the imported Burning Horizons scene.

Open artifacts/blender/Burning-Horizons.blend, then run this file from Blender's
Python Console (exec(compile(open(path).read(), path, 'exec'))).
Coordinates in underneath-layout.json use the game's X/Y/Z axes.
"""
import bpy
import json
import math
import os
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
with open(os.path.join(HERE, "underneath-layout.json"), encoding="utf8") as f:
    L = json.load(f)

parent = bpy.data.collections.get("BH_Caves")
if parent is None or bpy.data.objects.get("BH_Terrain") is None:
    raise RuntimeError("Import the Burning Horizons world before building UNDERNEATH")

for obj in list(bpy.data.objects):
    if obj.name.startswith("UN_"):
        bpy.data.objects.remove(obj, do_unlink=True)
for col in list(bpy.data.collections):
    if col.name.startswith("UN_"):
        bpy.data.collections.remove(col)

def collection(name):
    col = bpy.data.collections.new("UN_" + name)
    parent.children.link(col)
    return col

sea = collection("01_Sea_Entrance")
landing = collection("02_Landing")
passages = collection("03_Passages")
rooms = collection("04_Chambers")
doorcol = collection("05_Door")
details = collection("06_Rock_Details")

def material(name, color, metallic=0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Roughness"].default_value = 0.92
    node.inputs["Metallic"].default_value = metallic
    mat.use_backface_culling = False
    return mat

basalt = material("UN_Basalt", (0.105, 0.125, 0.135))
wet = material("UN_Wet_Basalt", (0.075, 0.095, 0.105))
salt = material("UN_Salt_Stone", (0.26, 0.27, 0.24))
ground = material("UN_Ground", (0.17, 0.155, 0.135))
door_mat = material("UN_Door_Dark_Iron", (0.095, 0.11, 0.12), 0.7)
trim_mat = material("UN_Door_Brass", (0.43, 0.29, 0.1), 0.7)

def mesh_obj(name, verts, faces, col, mat):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("UN_" + name, mesh)
    col.objects.link(obj)
    obj.data.materials.append(mat)
    return obj

def game_to_blender(x, z, y):
    return (x, -z, y)

def tube(name, points, col, mat, ceiling_seed=0, cap_end=False):
    """An open, flat-floored shell. Each ring remains editable in the mesh."""
    sampled = []
    for a, b in zip(points, points[1:]):
        steps = max(1, math.ceil(math.dist(a[:2], b[:2]) / 2.5))
        for k in range(steps):
            t = k / steps
            sampled.append([a[i] * (1-t) + b[i] * t for i in range(5)])
    sampled.append(points[-1])
    verts = []
    profile = [(-0.82, 0), (-1.02, 0.08), (-1.06, 0.34),
               (-0.92, 0.68), (-0.58, 0.92), (0, 1.02),
               (0.58, 0.92), (0.92, 0.68), (1.06, 0.34),
               (1.02, 0.08), (0.82, 0)]
    for i, (x, z, floor, roof, width) in enumerate(sampled):
        p = sampled[max(i-1, 0)]
        q = sampled[min(i+1, len(sampled)-1)]
        dx, dz = q[0] - p[0], q[1] - p[1]
        d = math.hypot(dx, dz) or 1
        nx, nz = -dz/d, dx/d
        for j, (side, rise) in enumerate(profile):
            rough = 0 if j in (0, 10) else 0.23 * math.sin(i*1.7 + j*2.3 + ceiling_seed)
            lateral = width * side + rough
            height = floor + (roof-floor)*rise + (0 if j in (0, 10) else 0.17*math.sin(i*0.9+j*1.9))
            verts.append(game_to_blender(x+nx*lateral, z+nz*lateral, height))
    n = len(profile)
    faces = []
    for i in range(len(sampled)-1):
        for j in range(n):
            # The landing joins the south side of the inner boat cavern.
            mid_x = (sampled[i][0] + sampled[i+1][0]) / 2
            if name == "Boat_Cavern" and -310 < mid_x < -283 and j <= 3:
                continue
            if name == "Landing_Connector" and mid_x < -290 and 7 <= j <= 9:
                continue
            k = (j+1) % n
            faces.append((i*n+j, (i+1)*n+j, (i+1)*n+k, i*n+k))
    if cap_end:
        faces.append(tuple((len(sampled)-1)*n+j for j in range(n)))
    obj = mesh_obj(name, verts, faces, col, mat)
    obj["game_points"] = json.dumps(points)
    obj["inside_surface"] = True
    return obj

def trimmed(points, start=None, end=None):
    pts = [list(p) for p in points]
    if start:
        c, radius = start
        a, b = pts[0], pts[1]
        t = min(0.8, radius / (math.dist(a[:2], b[:2]) or 1))
        pts[0] = [a[i]*(1-t)+b[i]*t for i in range(5)]
    if end:
        c, radius = end
        a, b = pts[-1], pts[-2]
        t = min(0.8, radius / (math.dist(a[:2], b[:2]) or 1))
        pts[-1] = [a[i]*(1-t)+b[i]*t for i in range(5)]
    return pts

def room(name, spec, openings, col, mat):
    x, z, floor = spec["center"]
    radius, roof = spec["radius"], spec["roof"]
    sides = 48
    verts = []
    for i in range(sides):
        a = 2*math.pi*i/sides
        r = radius * (1 + 0.045*math.sin(5*a+0.7))
        for y, factor in ((floor, 1), (floor+2, 1.04), (roof-1.4, 0.87), (roof+1, 0.42)):
            verts.append(game_to_blender(x+math.cos(a)*r*factor, z+math.sin(a)*r*factor, y))
    top = len(verts)
    verts.append(game_to_blender(x, z, roof+2))
    floor_center = len(verts)
    verts.append(game_to_blender(x, z, floor))
    faces = []
    for i in range(sides):
        j = (i+1) % sides
        a = 2*math.pi*(i+0.5)/sides
        blocked = any(abs(math.atan2(math.sin(a-o), math.cos(a-o))) < 0.42 for o in openings)
        for layer in range(3):
            # Keep a rock lintel above each passage so the room stays enclosed.
            if not blocked or layer == 2:
                faces.append((i*4+layer, j*4+layer, j*4+layer+1, i*4+layer+1))
        faces.append((i*4+3, j*4+3, top))
        faces.append((floor_center, j*4, i*4))
    return mesh_obj(name, verts, faces, col, mat)

def angle_to(center, point):
    return math.atan2(point[1]-center[1], point[0]-center[0])

tube("Boat_Cavern", L["boatPath"], sea, wet, 0, cap_end=True)
tube("Landing_Connector", [
    [-304, 71, 1.2, 10.5, 5.5], [-290, 68, 1.2, 9, 5],
    [-282, 64, 3.2, 11, 4.8],
], landing, basalt, 7)
j = L["junction"]
c = L["chamber"]
for i, spec in enumerate(L["passages"]):
    points = spec["points"]
    start = (j["center"], j["radius"]-1) if points[0][:2] == j["center"][:2] else (c["center"], c["radius"]-1) if points[0][:2] == c["center"][:2] else None
    end = (j["center"], j["radius"]-1) if points[-1][:2] == j["center"][:2] else (c["center"], c["radius"]-1) if points[-1][:2] == c["center"][:2] else None
    col = sea if spec["name"] == "Descent" else passages
    mat = salt if spec["name"] == "Salt_Fissure" else basalt
    tube(spec["name"], trimmed(points, start, end), col, mat, i+1,
         cap_end=spec["name"] in {"Salt_Fissure", "Tide_Alcove"})

# The door opens into a lit boarding alcove. The waiting car can be seen from
# the cave before the player takes the short lift down to the pressure tube.
tube("Station_Approach", [[-220, -10, 1.2, 9.2, 5.0],
                          [-220, -28, 1.2, 9.2, 6.0],
                          [-220, -47, 1.2, 9.2, 5.5]],
     passages, basalt, 9, cap_end=True)

def opening_angles(spec):
    center = spec["center"]
    out = []
    for p in L["passages"]:
        pts = p["points"]
        if pts[0][:2] == center[:2]:
            out.append(angle_to(center, pts[1]))
        if pts[-1][:2] == center[:2]:
            out.append(angle_to(center, pts[-2]))
    return out

room("Four_Way_Junction", j, opening_angles(j), rooms, basalt)
room("Underneath_Hall", c, opening_angles(c), rooms, salt)

def box(name, center, size, col, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=game_to_blender(center[0], center[2], center[1]))
    obj = bpy.context.object
    obj.name = "UN_" + name
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft_Edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Weighted_Normals", "WEIGHTED_NORMAL")
    return obj

# Roof seams between the intersecting tubes and chamber arches otherwise
# reveal daylight at certain viewing angles. Both caps stay below terrain.
box("Junction_Roof_Shield", (-245, 11.5, 45), (30, 2.2, 30), rooms, basalt, 0.25)
box("Hall_Roof_Shield", (-215, 11.3, 20), (38, 2.2, 38), rooms, salt, 0.25)

lc = L["landing"]["center"]
ls = L["landing"]["size"]
box("Sheltered_Landing", (lc[0], lc[1]-ls[1]/2, lc[2]), ls, landing, ground, 0.35)
# A submerged stone ramp gives the player a shallow splash landing while the
# boat stays in the deeper channel. Its top matches CaveSystem's walkable slope.
r = L["wadingRamp"]
corners = [(r["xMin"], r["landingEdgeZ"], r["landingFloor"]),
           (r["xMax"], r["landingEdgeZ"], r["landingFloor"]),
           (r["xMax"], r["waterEdgeZ"], r["waterFloor"]),
           (r["xMin"], r["waterEdgeZ"], r["waterFloor"])]
ramp_verts = [game_to_blender(x, z, y) for x, z, y in corners]
ramp_verts += [game_to_blender(x, z, -2.6) for x, z, _ in corners]
mesh_obj("Wading_Ramp", ramp_verts,
         [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
          (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], landing, wet)
sh = L["wadingShelf"]
box("Wading_Shelf", ((sh["xMin"]+sh["xMax"])/2, (sh["floor"]-2.6)/2,
                     (sh["zMin"]+sh["zMax"])/2),
    (sh["xMax"]-sh["xMin"], sh["floor"]+2.6,
     sh["zMax"]-sh["zMin"]), landing, wet, 0.12)
# A low rock canopy bridges the side opening in the boat cavern to the foot
# passage. The sea-facing edge stays open so the boat can pull alongside.
box("Landing_Roof", (lc[0], 10, 71), (30, 1, 18), landing, basalt, 0.55)
box("Landing_South_Wall", (lc[0], 5.4, 61.5), (30, 8.4, 1), landing, basalt, 0.45)
dc = L["door"]["center"]
door_height = L["door"]["height"]
door_width = L["door"]["width"]
box("Closed_Door", (dc[0], dc[2]+door_height/2, dc[1]), (door_width, door_height, 0.65), doorcol, door_mat, 0.16)
for offset in (-door_width/2-0.3, door_width/2+0.3):
    box("Door_Jamb", (dc[0]+offset, dc[2]+door_height/2, dc[1]), (0.45, door_height+0.9, 1.2), doorcol, trim_mat, 0.08)
box("Door_Lintel", (dc[0], dc[2]+door_height+0.25, dc[1]), (door_width+1.2, 0.5, 1.2), doorcol, trim_mat, 0.06)
for i in range(5):
    box("Door_Band", (dc[0], dc[2]+0.9+i*1.35, dc[1]-0.39), (door_width-0.35, 0.13, 0.12), doorcol, trim_mat, 0.02)

# Reader and pulsing status lamps sit beside the door on the approaching side.
box("Keypad_Base", (dc[0]+4.0, 2.35, dc[1]+1.2), (0.85, 1.65, 0.32), doorcol, door_mat, 0.08)
box("Keypad_Screen", (dc[0]+4.0, 2.7, dc[1]+1.41), (0.56, 0.48, 0.08), doorcol, salt, 0.02)
for i in range(3):
    box(f"Keypad_Light_{i}", (dc[0]+3.7+i*0.3, 1.9, dc[1]+1.43),
        (0.16, 0.16, 0.08), doorcol, trim_mat, 0.02)

sp = L["stationPreview"]["center"]
box("Station_Preview_Platform", (sp[0]+4.6, 1.0, sp[2]),
    (3.4, 0.45, 29), passages, ground, 0.14)
box("Station_Preview_Guideway", (sp[0]-0.6, 0.96, sp[2]),
    (2.7, 0.35, 29), passages, trim_mat, 0.06)
box("Station_Preview_Platform_Edge", (sp[0]+2.85, 1.28, sp[2]),
    (0.32, 0.12, 28), details, salt, 0.04)
box("Station_Preview_Safety_Stripe", (sp[0]+3.25, 1.3, sp[2]),
    (0.12, 0.05, 27), details, trim_mat, 0.02)
for z in range(-44, -15, 3):
    box(f"Station_Track_Tie_{abs(z)}", (sp[0]-0.6, 1.22, z),
        (3.1, 0.14, 0.38), details, ground, 0.02)
for x in (sp[0]-1.5, sp[0]+0.3):
    box(f"Station_Track_Rail_{int(x*10)}", (x, 1.38, sp[2]),
        (0.13, 0.2, 28), details, trim_mat, 0.02)
for z in (-16, -24, -32, -40):
    box(f"Station_Ceiling_Light_{abs(z)}", (sp[0]+1.1, 8.65, z),
        (5.3, 0.18, 0.7), details, salt, 0.03)
    box(f"Station_Wall_Light_{abs(z)}", (sp[0]+7.0, 4.3, z),
        (0.15, 1.7, 0.28), details, salt, 0.02)
    for x in (sp[0]-7.4, sp[0]+7.4):
        box(f"Station_Wall_Rib_{int(x)}_{abs(z)}", (x, 4.0, z),
            (0.28, 6.0, 0.34), details, door_mat, 0.05)
box("Station_Wall_Panel_Left", (sp[0]-7.5, 3.0, sp[2]),
    (0.18, 3.6, 25), details, door_mat, 0.1)
box("Station_Wall_Panel_Right", (sp[0]+7.5, 3.0, sp[2]),
    (0.18, 3.6, 25), details, door_mat, 0.1)
for x in (sp[0]-7.7, sp[0]+7.7):
    box(f"Station_Wall_Trim_{int(x)}", (x, 4.75, sp[2]),
        (0.18, 0.16, 25), details, trim_mat, 0.03)
for z in (-22, -36):
    box(f"Station_Bench_Seat_{abs(z)}", (sp[0]+6.2, 1.92, z),
        (1.2, 0.15, 2.3), details, trim_mat, 0.08)
    for dz in (-0.8, 0.8):
        box(f"Station_Bench_Leg_{abs(z)}_{int(dz*10)}", (sp[0]+6.2, 1.57, z+dz),
            (0.15, 0.65, 0.15), details, door_mat, 0.02)
box("Station_Destination_Sign", (sp[0]+4.4, 5.9, -19.5),
    (2.7, 0.8, 0.22), details, door_mat, 0.05)
box("Station_Destination_Glow", (sp[0]+4.4, 5.9, -19.36),
    (2.3, 0.17, 0.07), details, salt, 0.01)
# Monorail car: solid lower body, dark continuous glazing, yellow doors,
# illuminated nose and a contrasting roof. It faces the approaching cave door.
carx = sp[0]-0.6
carz = sp[2]-3
box("Waiting_Train_Body", (carx, 2.75, carz),
    (4.4, 2.35, 14), details, salt, 0.32)
box("Waiting_Train_Nose_Front", (carx, 2.77, -24.92),
    (3.96, 1.85, 0.17), details, door_mat, 0.26)
box("Waiting_Train_Belt", (carx, 3.08, carz),
    (4.5, 0.35, 14.1), details, trim_mat, 0.12)
box("Waiting_Train_Roof", (carx, 5.82, carz),
    (4.5, 0.46, 14.3), details, door_mat, 0.28)
for x in (carx-2.22, carx+2.22):
    for z in (-37, -32, -27):
        box(f"Waiting_Train_Side_Window_{int(x)}_{abs(z)}", (x, 4.58, z),
            (0.07, 1.95, 3.9), details, door_mat, 0.035)
    box(f"Waiting_Train_Door_{int(x)}", (x+0.05, 2.95, -30.6),
        (0.1, 2.85, 1.45), details, trim_mat, 0.04)
for z in (-39.06, -24.94):
    box(f"Waiting_Train_Windshield_{abs(z)}", (carx, 4.55, z),
        (3.65, 1.85, 0.09), details, door_mat, 0.1)
    box(f"Waiting_Train_Nose_Band_{abs(z)}", (carx, 3.32, z),
        (4.1, 0.27, 0.12), details, trim_mat, 0.05)
    for x in (carx-1.45, carx+1.45):
        box(f"Waiting_Train_Headlight_{int(x)}_{abs(z)}", (x, 2.65, z),
            (0.58, 0.23, 0.14), details, salt, 0.08)
    box(f"Waiting_Train_Route_Display_{abs(z)}", (carx, 5.16, z),
        (1.45, 0.22, 0.13), details, salt, 0.04)

for i in range(18):
    x = -341 + (i % 6)*2.3
    z = 70 + (i // 6)*8.5
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=game_to_blender(x, z, 0.1))
    obj = bpy.context.object
    obj.name = "UN_Entrance_Rock_%02d" % i
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    details.objects.link(obj)
    obj.scale = (1.1 + (i%3)*0.35, 1.0 + (i%4)*0.25, 0.8 + (i%5)*0.3)
    obj.data.materials.append(wet)

# Small mineral formations break up the long, smooth passage shells. They sit
# against the walls so the centreline remains clear for walking and filming.
for route in [L["boatPath"], *[p["points"] for p in L["passages"] if p["name"] in {"Descent", "Basalt_Gallery", "Final_Corridor"}]]:
    for segment, (a, b) in enumerate(zip(route, route[1:])):
        x = (a[0] + b[0]) / 2
        z = (a[1] + b[1]) / 2
        floor = (a[2] + b[2]) / 2
        roof = (a[3] + b[3]) / 2
        width = (a[4] + b[4]) / 2
        length = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        nx, nz = -(b[1] - a[1]) / length, (b[0] - a[0]) / length
        for side in (-1, 1):
            px, pz = x + nx * width * 0.78 * side, z + nz * width * 0.78 * side
            depth = min(1.8, max(0.8, (roof - floor) * 0.24))
            bpy.ops.mesh.primitive_cone_add(
                vertices=7, radius1=0.05, radius2=0.6,
                depth=depth, location=game_to_blender(px, pz, roof - depth / 2))
            obj = bpy.context.object
            obj.name = f"UN_Basalt_Dripstone_{segment}_{'L' if side < 0 else 'R'}_{int(x)}"
            for old in list(obj.users_collection):
                old.objects.unlink(obj)
            details.objects.link(obj)
            obj.data.materials.append(wet)

for i, (x, z, y) in enumerate([(-312, 75, 6.0), (-278, 63, 7.2), (-252, 48, 7.2),
                               (-231, 36, 6.8), (-216, 18, 6.4), (-219, 1, 5.3)]):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.42,
                                           location=game_to_blender(x, z, y))
    obj = bpy.context.object
    obj.name = f"UN_Glow_Mineral_{i:02d}"
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    details.objects.link(obj)
    obj.scale = (0.8, 0.8, 1.35)
    obj.data.materials.append(salt)

bpy.context.scene["burning_horizons_world"] = os.path.join(ROOT, "artifacts", "world")
bpy.context.scene["underneath_layout"] = os.path.join(HERE, "underneath-layout.json")
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0
out = os.path.join(ROOT, "artifacts", "blender", "Burning-Horizons.blend")
bpy.ops.wm.save_as_mainfile(filepath=out)
print("UNDERNEATH authored in BH_Caves:", out)
