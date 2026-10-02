# Generated ivy texture provenance

Generated 2026-09-30 through the built-in OpenAI image-generation tool, with
`transparent_background: true`. No reference image supplied. Original file:
`exec-d4811d30-d7b6-442c-b137-cbc9250a2a9d.png`.

Retained as `ivy-leaf-source.png`, SHA-256
`1087adf5a5613983eb2399e7dc8df4ff03b698bbb9712513342e696e8f750600`.

Exact prompt:

> Create a production game botanical albedo texture: one single juvenile English ivy leaf Hedera helix, five naturally shaped lobes, dark muted medium green with delicate pale branching veins, subtly mottled organic surface, realistic botanical macro photographic detail, not illustration. Straight-on orthographic top surface, flat even diffuse illumination, no cast shadow, no highlights baked in, no depth of field. Leaf centered, tip straight up, short petiole downward, whole leaf occupies 88 percent of square canvas, generous clear transparent margin on all sides. True transparent background and sharp natural alpha edge, no white border, no background, no text, no other leaves or objects. This is a texture for restrained realistic weathered North Sea port ivy, not neon or glossy toy foliage.

This is generated artwork, not a photograph and not a CC0 third-party asset.
No IvyGen bundled textures were used. Blender scales the image to 512 × 512
and embeds it in both trial GLBs. Their leaf alpha is a 0.5 cutout, not
translucent blending. Generation cost UNKNOWN.

## Geometry tools and code licences

Growth used [IvyGen](https://github.com/PyrokinesisStudio/ivy_generator/tree/2ab4d81244999ec350193edad1000abd66b99774)
at revision `2ab4d81244999ec350193edad1000abd66b99774`. The imported
`add_curve_ivygen.py` credits **testscreenings, PKHG and TrumanBlending** and
declares **GPL-2.0-or-later**. Other files in that upstream repository have
different terms; its CC0 texture/icon notice does not cover this Python file.
The add-on is an external build input and is not bundled in the browser game.

The project's [compatibility and export script](../../../../tools/ivy_trial.py)
also declares GPL-2.0-or-later, separately from the game code's MIT licence.
It imports the growth module, adapts Blender collision and adhesion calls,
authors leaf cards and materials, and exports the runtime GLBs. Reproduction
requires the upstream revision, this script, the retained leaf image and Blender.

The generated meshes contain geometry, material data and the leaf texture;
they do not contain the IvyGen Python implementation. This provenance records
the generator's code licence separately from the generated artwork and does
not label every asset CC0 or every generated mesh GPL merely because the
generator is GPL. Preserve these source and author notices.

Fence placement uses an explicit support guide and surface projection, with
manually guided strands. The trial does not establish automatic growth around
every wire. It remains off by default, with sparse coverage and attachment
limitations. Private development receipts and review images are not included
in this public snapshot.
