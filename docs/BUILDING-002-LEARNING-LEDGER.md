# Building 002 learning ledger

## Governed attempt history

This ledger records the intervention evidence candidly. It does not imply that Agent Control executed Blender or a browser.

- Startup first rejected excessive request budgets of 2,400 lines and 250,000 bytes. The correction was to use bounded, policy-compliant request sizes.
- A subsequent startup was rejected because the configured verifier was missing. The correction was to configure an independent verifier before implementation continued.
- Attempt 1 failed because the new `tools/building_pipeline` parent directory did not exist.
- Attempt 2 failed after the applicable authority changed, so work did not proceed under stale authorization.
- Attempt 3 was blocked when it attempted to read an unlisted game-engine file. The correction was to keep all investigation and changes strictly within the configured pipeline, evidence, procedure, ledger, and attribution files.
- Attempt 4 authored the pipeline content, but `coding_path_denied` rejected creation of the previously nonexistent target.
- Codex then prepared placeholder targets in the allowed paths so governed authoring could continue. Agent Control replaced those placeholders with the pipeline and records in this task.

## Corrections and task split

The recovered workflow separates responsibilities explicitly. Agent Control is the governed primary author of the reusable Blender batch pipeline, source asset report, import procedure, learning ledger, and attribution. It does not read game-engine files, implement runtime JavaScript, publish, push, deploy, commit, or modify the immutable source. Codex prepared the placeholder paths after the governed path-creation failure and is assigned the later execution and visual-qualification work.

The pipeline now checks the immutable source SHA-256 before Blender opens it, immediately saves a distinct working file outside the repository, preserves a `SOURCE_PRISTINE` collection, makes independent runtime duplicates, excludes only the three documented disconnected helpers, adds removable non-runtime planning markers, and requests an embedded GLB without animations, cameras, lights, or required compression extensions. Documentation distinguishes established inventory from assumptions and calls out unverified collision, navigation, scale, orientation, and material-translation limits.

## Runtime texture optimization refinement

Codex executed the first Agent Control pipeline successfully: the extension-free GLB contained 34 runtime objects, 29 meshes, 13 materials, 35 images, and approximately 150,259 indexed triangles. Its working blend measured 162,510,223 bytes, but its GLB measured 200,549,608 bytes and failed the repository and browser-runtime performance gate. Agent Control therefore refined the reusable pipeline with a deterministic `--max-texture-size` option defaulting to 1024 pixels. Runtime duplicates now use cached material and image copies, and only oversized runtime image copies are scaled with their aspect ratio preserved; `SOURCE_PRISTINE`, its material links, and original packed image datablocks remain unchanged. The pre-refinement measurements remain evidence, and no smaller output is claimed here.

## Evidence boundary and follow-up

Agent Control authored this repository refinement and runs only the configured repository verifier at the declared acceptance boundary. It has not run Blender for the refined pipeline, inspected the refined generated outputs, or claimed a reduced output size or visual approval. Codex must run the exact documented Blender 4.5.9 command, retain the compact JSON result including texture metrics and output byte size, inspect the working `.blend` and GLB, record output hashes and observations, and resolve any visual or structural deviations before a separate runtime integration task.
