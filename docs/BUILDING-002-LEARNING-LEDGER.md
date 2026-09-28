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

## Runtime integration attempt and Codex correction

| Agent Control attempted | Result | Codex correction | Generalisable lesson |
| --- | --- | --- | --- |
| Runtime task configured with 900 changed lines, 160,000 bytes and a 600-second verifier | Startup rejected `coding_budget_invalid` and `coding_verifier_invalid` | Reduced to the enforced 800-line, 100,000-byte and 300-second ceilings | Generate task budgets from controller limits before starting a service |
| Static GLB loader, placement, collision and documentation in one 24-turn task | `coding_turn_budget_exhausted`; no file changed | Implemented the bounded loader and integration in the prepared targets, then ran the independent build and browser qualification | Split static-loader authoring from placement/collision; preserve zero-write failures |
| First GLB export with original packed texture sizes | Valid 200,549,608-byte GLB failed the runtime-size gate | Agent Control authored runtime-only 1024-pixel image copies; Codex reran Blender and measured a 40,703,788-byte GLB | Measure the first export, preserve it, then optimize duplicated runtime images without altering the archival source |
| Ubuntu GPU evidence capture | Existing ocean/post passes exceeded the Quadro P5000's WebGPU storage/sampled-texture limits and the device was lost | Retained the failed capture and ran the same scene on Windows Edge WebGPU, where both buildings loaded and evidence completed | Video-capture hardware is part of qualification; never convert a device-loss run into a pass |

The runtime correction added `AbandonedWarehouse.js`, instantiated it beside the existing `PortalInterior`, reserved its tree footprint, added an entrance route and a conservative collision shell. It did not modify Building #001. Future Agent Control tasks should be staged as: (1) static asset loader, (2) placement and route, (3) collision, and (4) browser evidence and documentation, each with its own verifier.
