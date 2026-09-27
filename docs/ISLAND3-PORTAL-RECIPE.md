# Island 3 Warehouse Loft Portal

## Spatial plan

The portal is a remote, hidden-until-entered interior using local Y-up metre coordinates. Arrival is at `[0, 1, 0]` in a clear loading vestibule. The warehouse shell occupies approximately x `-16..16`, z `-12..18`, with the main ground floor at y `0`. The lounge is west/south at `[-9, 0, 4]`; kitchen is `[5, 0, 5]`; dining is `[7, 0, -5]`; the retro-computer room is north/east at `[9, 0, 13]`. The corrected 4 m-wide stair flight is centred at x `3` (x `1..5`), wholly east of the mezzanine edge, and rises from z `1.45` toward z `9.9` with individual risers below 0.35 m. Its landing is centred at `[1.5, 3.42, 10.25]` and bridges west to the mezzanine condo at `[-7, 3.5, 10]`, preserving open headroom above the entire flight. The return portal is beside the arrival vestibule at `[-4, 0, 0]`, leaving a clear route from every zone.

The exterior signed walk-up portal is placed on Island 3 away from the helipad, near the warehouse-facing route. Entry and exit use E, a cooldown, explicit prompts, and a safe outside return position. The interior group remains at remote above-sea-level coordinates until entry.

## Construction brief

Build a non-sparse brick warehouse with concrete slab, exposed steel, factory windows, restrained graffiti, warm lighting, and furniture grouped by material for low draw-call cost. Include a lounge with sofa, rug, coffee table and plants; a modern kitchen with island, cabinets and appliances; dining table and chairs; and a curated retro room with desks, shelves, identifiable CRT monitors, keyboards and peripherals. Geometry is original procedural content only.

The recipe is the single source for engine and Blender geometry. Materials use integer RGB colors, roughness, metalness, and optional emissive values. Objects use positive `[x,y,z]` sizes, local Y-up positions and radians. Zones are arrival, lounge, kitchen, dining, retro and mezzanine. Floors and routes are collider-backed; no arrival point is inside a wall or prop.

## Traversal and verification

Planned deterministic checks: spawn at arrival; walk to lounge, kitchen and dining; climb every stair riser; cross the mezzanine; enter the retro room; return to ground floor; reach the return portal; exit and confirm the exterior position is safe. Confirm E prompts and cooldown behavior. Browser traversal and visual quality are reviewer responsibilities; this document does not claim browser evidence or native Computer Use qualification. The concept image was not supplied, so no image match is claimed.

The Blender command is:

```sh
blender --background --python tools/blender/build-portal-interior.py -- /absolute/portal-recipe.json /absolute/output-folder
```

It must save `portal-interior.blend` before rendering, export `portal-interior.glb`, and attempt `portal-interior.png`. Blender converts engine Y-up coordinates to Blender Z-up.

## Budgets, limitations and reusable procedure

Keep the recipe under the task's 800 changed-line budget and use merged meshes by material at runtime. The refined recipe intentionally contains 1,227 authored objects and 17 materials: most objects are inexpensive repeated face bricks, keycaps, mullions, furniture details, and fixtures. Blender preserves those authored objects for review and reuse, while the engine batches visible geometry by material. The deterministic exporter cannot prove browser traversal, collision feel, lighting quality, or a concept-image match.

Reusable procedure: read the governed engine APIs; write this spatial plan first; author the recipe; implement the portal controller and integration; generate Blender outputs from the exact recipe; run the independent verifier; inspect reported structural failures; apply only focused corrections; record actual checks and limitations. Do not alter unrelated files, credentials, production, or deployment state.

## Lessons and evidence

Use walkable collider slabs for floors and landings, solid wall colliders only where needed, and keep decorative meshes separate from navigation geometry. A measured browser traversal of the earlier layout reached local `[0, 2.03, 5.7]` and then remained blocked because the x-centred flight ran beneath the mezzanine edge. The correction moves the complete flight and rails to x `1..5`, outside that edge, while a landing spanning x `-1..4` bridges its top to the mezzanine. Stair risers remain 0.25 m apart vertically and connect continuously to the y 3.42 landing and y 3.5 mezzanine; this correction still requires genuine browser re-verification and is not claimed as a traversal pass. The arrival/return points must be checked against colliders. Runtime recipe geometry is baked and merged into one mesh per material while colliders retain recipe dimensions. The exterior proximity check uses terrain height, and exit restores the exact pre-entry position and yaw.

The refinement corrected Blender primitive dimensions, sphere scaling, right-handed Y-up to Z-up rotation conversion, and the interior camera/light composition. It also added full-height masonry with staggered face-brick relief, factory glazing and mullions, detailed furniture, conventional 0.89 m kitchen worktops, CRT bezels/feet/keycaps, decor, graffiti motifs, and warm fixtures. The exporter numerically validates generated bounds for every recipe object before saving. The governed immutable check passed on 2026-09-27: the game production build completed, Blender validated and exported 1,227 objects using 17 materials, saved the editable source, produced a 2,173,720-byte GLB, and rendered the review PNG. These are structural/export results, not proof of visual acceptance or navigability. Genuine browser traversal, collision feel, readable portal presentation, and visual review remain for reviewer assessment; no browser screenshot, concept-image match, or native Computer Use qualification is claimed.
