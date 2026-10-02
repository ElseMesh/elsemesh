# ElseMesh AI edit tasks and Blender worker

This is the first executable boundary for the separate AI editing service. It lets an owner prepare a deliberately scoped world snapshot, have an assistant return a typed `elsemesh.blender-actions/1` plan, and run that plan in a resource-limited Blender process. It does not give the assistant a world-owner key, an account key, a publication API, or arbitrary Python execution.

The task directory is the complete file allow-list exposed to the worker. It contains:

- `task.json`: protocol, instruction, exact source and Blender hashes, editable object and portal IDs, and the asset allow-list.
- `world-source.json`: the exact authoring source snapshot named by `sourceHash`.
- `scene.blend`: the copied Blender scene named by `blendHash`.
- `assets/<sha256>`: only assets the owner selected for this task.
- `plan.json`: the assistant's typed action plan, added after task creation.

The owner creates the task explicitly:

```sh
node tools/create-ai-edit-task.mjs \
  --source worlds/island/world-source.json \
  --blend /path/to/owner-reviewed-island.blend \
  --assets worlds/island/assets \
  --instruction 'Add a small timber fish-cleaning table beside the selected work area.' \
  --include-object tw-object:example-work-area \
  --out-task /var/tmp/elsemesh-fish-table-task
```

Use `--include-portal <id>` to permit edits to an existing portal, and `--include-asset sha256:<64 lowercase hex digits>` to permit placing an existing asset. The bundle contains no asset files unless selected by those options. New geometry can use the bounded primitive presets supported by `mesh.create`. The full Blender file and source document are copied into the task, so share the task only with an assistant authorized to see that world. The action allow-list prevents that assistant from updating or removing unselected objects and portals.

The assistant writes a `plan.json` with the exact `sourceHash` from `task.json` and only typed operations supported by `tools/blender/world_actions.py`. The worker checks the task and plan hashes, file types, hard links, symlinks, asset hashes, selected object/portal IDs, and package limits before starting Blender.

Run the worker on Linux with Bubblewrap, `prlimit`, and a packaged Blender installation under `/usr`:

```sh
node tools/run-ai-edit-worker.mjs \
  --task /var/tmp/elsemesh-fish-table-task \
  --out /var/tmp/elsemesh-fish-table-candidate
```

The worker fails closed if its sandbox prerequisites are unavailable. It launches Blender with a private network and process namespace, a clean environment, the task mounted read-only, only the candidate output mounted writable, and fixed CPU-time, address-space, file-size, process-count, descriptor, output-size, and wall-clock limits. The only extra files visible to the process are the read-only operating-system runtime and the trusted Blender action runner. User home directories, world-node profiles, signing keys, account credentials, and network access are not mounted into the worker.

Successful output contains an unsigned candidate source, a candidate `.blend`, any newly generated content-addressed GLBs, and `review.json`. The report lists changed object, portal, and world fields. An owner must inspect the source diff, reopen/render the Blender scene, and verify generated asset hashes. To publish, merge required original and generated assets into a reviewed package and use the separate owner-only publication flow against the exact base-source snapshot. Running the worker never signs or publishes anything.

## Current boundary

This worker supplies a provider-neutral task and execution format that Blender-capable assistants can use. Model selection, paid-service credentials, remote task hosting, an owner-facing visual review UI, and automated training-data collection are separate service work and are not implemented here. The worker currently requires Linux user namespaces and a Blender package under `/usr`; it is not a Termux execution path. The source and world-node formats remain usable without this worker.
