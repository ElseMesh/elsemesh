# Island 3 Warehouse Loft Portal

## Spatial plan

The portal is a remote, hidden-until-entered interior using local Y-up metre coordinates. Arrival is `[0,1,0]` in a clear loading vestibule; the shell spans roughly x `-16..16`, z `-12..18`. The lounge, kitchen, dining, retro and mezzanine zone markers remain part of the deterministic recipe. The stair flight stays centred at x `3`, with the proven route x3,z0.5 -> x3,z10.9 -> x-3,z10.9. Its landing remains `[1.5,3.42,10.9]`, size `[5,.22,1.7]`, and the mezzanine remains x `[-14,0]`, z `[6,14]`. The separate ground route x12,z0 -> x12,z10.5 -> x8,z10.5 remains clear.

The upper glass computer room occupies approximately x `-13..-2`, z `7.3..13.5`, y `3.61..7.2`. Its east side leaves an open doorway at z `10.9`, so the landing route enters without crossing glazing or furniture. Solid boundary records remain collider-backed even where their visible treatment is clear glass with slender steel rails. The return portal remains beside the arrival area.

The exterior signed walk-up portal is on Island 3 away from the helipad. Entry and exit use E, a cooldown and clear prompts, and exit restores the saved outside position safely. The remote interior group and its colliders remain disabled until entry.

## Reference-informed construction

The supplied warehouse concept is preserved unchanged as governed visual evidence. This implementation was authored from the request's textual reference analysis; it does not claim this worker inspected the PNG natively. The candidate matches the described tall aged masonry shell, fine-grid neutral factory windows, dark columns and roof trusses, worn concrete, a glass-fronted mezzanine computer room, warm lounge/kitchen/dining pools, cream and charcoal furnishings, layered rugs, shelves, small retro props, and leafy/trailing plants. Remaining differences are procedural simplification, limited runtime shadowing, and lower prop/material fidelity than a hand-authored photoreal scene.

`PortalInteriorRecipe.js` is the shared deterministic authority for runtime and Blender. It exports `{materials, objects, zones, lights}`; objects use positive sizes, Y-up metre positions and radian rotations. Runtime geometry is merged by material, while collision dimensions remain authored separately. Glazing is a separate transparent batch with depth writing disabled. The original outdoor world, global time, sun and unrelated lights are untouched.

## Material and light conventions

Aged brick is produced in metre space at 0.25 m brick width and 0.08 m course height with 0.006 m mortar, staggered courses, tonal variation and subtle bump. Runtime projection selects the horizontal coordinate from the dominant wall normal so x-facing and z-facing walls both retain courses; Blender uses Geometry Position/Object coordinates with the same dimensions. Concrete uses smoothly interpolated deterministic noise and restrained irregular damp patches rather than hard grid cells. Steel receives fine scratch/rust variation; wood uses directional grain; fabric receives a subtle weave. These effects use runtime `in.P`/`in.N` and `s.albedo`, `s.roughness`, `s.normal`, `s.ao`/`s.emissive` as applicable, and Blender node equivalents. No external textures or downloads are required. Portal materials opt out of inappropriate underwater lighting.

The recipe contains eight warm fixtures with explicit position, packed RGB color, intensity and range. Runtime registers them once with `app.localLights`, deterministic phases, and toggles each source's `enabled` state on interior entry/exit; the manager has no removal API and disabled records are skipped. Because standard local-light evaluation is gated by the global night ramp, portal-only material surfaces also add a modest analytical warm diffuse fill from the same eight fixtures. This preserves restrained daytime pools without changing global time or other lighting. The approximation has no local shadows and is intentionally low enough to avoid excessive double brightness when the registered night lights become active. Blender mirrors the eight point lights and adds a broad neutral factory-window area light for the isolated review scene.

## Traversal and verification

Deterministic traversal targets are: spawn at arrival; visit lounge, kitchen and dining; follow x3,z0.5 -> x3,z10.9 -> x-3,z10.9; enter the computer-room doorway at x-2,z10.9; return down the same route; follow the clear ground route through x12,z0, x12,z10.5 and x8,z10.5; reach the return portal; exit and confirm the exterior state is restored. Stair risers remain below 0.35 m with open headroom. These are authored and previously scripted traversal constraints, not a claim of new manual browser evidence.

The Blender command is:

```sh
blender --background --python tools/blender/build-portal-interior.py -- /absolute/portal-recipe.json /absolute/output-folder
```

The script consumes that exact recipe, validates dimensions, converts engine `(x,y,z)` to Blender `(x,-z,y)`, saves `portal-interior.blend` before rendering, exports `portal-interior.glb`, and attempts `portal-interior.png`. Its wide eye-height camera looks from the open floor toward the stair, lounge and glass computer room without a foreground appliance blocking the view.

## Budgets, limitations and reusable procedure

The recipe stays far below 12,000 objects and runtime stays below 45 material batches. Repeated detail is authored procedurally and merged by material rather than emitted as thousands of metre-wide brick boxes or draw calls. Blender preserves recipe objects for review and applies small bevels where practical; export cannot reproduce every runtime analytical-surface nuance exactly. Transparent sorting, procedural normal response, collision feel, daylight/night balance and visual similarity still require reviewer inspection. Structural export success alone is not visual acceptance.

Reusable procedure: preserve the supplied reference; update the spatial plan before geometry; keep the recipe authoritative; implement portal-scoped materials, lights and lifecycle; generate Blender outputs from the exact JSON; run the immutable acceptance checks; inspect their actual output; then hand visual and traversal findings to review/refine. Do not push, deploy, access credentials, alter global lighting, or modify unrelated files.

## Recorded corrections and evidence

Earlier browser review exposed oversized orange brick blocks, cyan opaque windows, white flat concrete, opaque sheet guards, weak trusses and an unconvincing upper room. This pass replaces those treatments with metre-scaled procedural masonry, neutral transparent glazing and fine mullions, mottled grey-brown concrete, glass-and-steel guards, denser blackened structure, and a furnished glass computer room. It also replaces emissive-only fixture claims with actual scoped local-light records plus the documented daytime approximation.

Previous scripted `Player.updateWalk` evidence passed E entry and the route through local x3,z0.5, x3,z10.9 and x-3,z10.9, then returned to x-4,z0 and restored world `[100,7.412824749946594,580]`, with target errors below 0.11 m. That evidence motivated preserving the exact flight, landing, doorway and boundary collider layout. It was scripted reviewer evidence, not manual human testing or native Agent Control Computer Use. New immutable build/Blender results must be recorded only after `coding.test` returns; this document makes no advance claim that the current candidate passes.
