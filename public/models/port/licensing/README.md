# Vehicle source availability

OpenX-derived candidate, estate, panel-van and compact assets retain
MPL-2.0 AND CC-BY-4.0. The game code's MIT licence does not replace these terms.
Full licence texts are in licenses/. Original copyright notices and metadata
are preserved in openx-source/ alongside the upstream editable Blender scenes,
the exact GLB inputs and the local Blender derivative script.

Modifications include removal of selected separate branding meshes, glass
adjustments, bounded decimation and GLB export. See ../CREDITS.md for creators,
upstream links and modification notices. These assets are provided without
warranty under their respective licences. No creator/manufacturer endorsement
is claimed. Licence grants do not establish trademark/design clearance.

This source package is intended to accompany the distributed assets at
models/port/licensing/. Preserve that path in the browser build and GitHub tree.
Do not describe an upstream link alone as availability of our modified source.

Technical source validation (2026-10-02): all three editable scenes opened in
Blender 4.5.9 LTS with script auto-execution disabled. They contain their meshes
and materials, no linked libraries, and no external texture dependencies.
The compact scene retains two weak references to an old copybuffer path;
these are append-origin metadata on embedded meshes, not linked dependencies.
All candidate inputs and the packaged script match the original derivative
manifests, as do the distributed OpenX runtime derivatives.

A CPU-only run of the exact script portion before GPU review reproduced all
nine LOD exports. All three LOD0 hashes matched the original files exactly;
the six decimated LOD1/2 outputs were not byte-identical. The reason for that
variability was not established. The source package therefore provides the
editable source and transformation inputs/program, while bitwise reproduction
of simplified LODs remains unproven. The full original script requests a CUDA
Quadro only after GLB export, for review renders; those renders were not run
during this validation. This is technical source validation, not independent
legal, trademark, visual or gameplay clearance.

The MMCWorks assets use CC BY 4.0 according to retained acquisition evidence;
CC BY does not require editable source distribution. Attribution, source link,
licence link and changes are recorded in ../CREDITS.md. Preserve the licence
text and disclaimer. No source archive is included for MMCWorks.

The separate DeLorean model is not part of this public distribution.
