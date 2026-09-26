"""Print useful bone-weight coverage from a built character .blend."""
import json
import sys

import bpy

bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index("--") + 1])
mesh = bpy.data.objects["Scanned_explorer"]
groups = {group.index: group.name for group in mesh.vertex_groups}
report = {name: {"above_quarter": 0, "above_half": 0, "bounds_min": [float("inf")] * 3,
                 "bounds_max": [-float("inf")] * 3} for name in groups.values()}
for vertex in mesh.data.vertices:
    for assignment in vertex.groups:
        entry = report[groups[assignment.group]]
        if assignment.weight > 0.25:
            entry["above_quarter"] += 1
        if assignment.weight > 0.5:
            entry["above_half"] += 1
            for axis in range(3):
                entry["bounds_min"][axis] = min(entry["bounds_min"][axis], vertex.co[axis])
                entry["bounds_max"][axis] = max(entry["bounds_max"][axis], vertex.co[axis])
print(json.dumps(report, indent=2))
