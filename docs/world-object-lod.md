# Reusable world-object levels of detail

Status: signed contract and runtime switching implemented; authored world variants
and live visual validation remain outstanding.
Avatar distance LOD is implemented separately in `RemoteAvatar.js`.

## Existing renderer paths

Terrain uses CDLOD geomorphing. Procedural vegetation uses geometry levels and
impostors with dither transition bands; scanned debris, fish and reef also have
authored levels. Keep these paths and their close-range appearance.
`WorldPackage.js` currently clones one full GLB for each signed asset instance;
visibility-prioritized loading in `WorldStreaming.js` does not reduce its mesh.

## Content and streaming contract

An asset instance may declare optional signed `lods`, ordered from medium to
lowest detail, each referencing a distinct content-addressed GLB and a decreasing
`maxScreenFraction` threshold. Keep the existing `assetId` as full detail and the
collision source. Validate bounded level counts, threshold ordering, referenced
GLB types, and compatible bounds/transforms in source import, server manifests,
client verification and AI/Blender authoring. Geometry alternatives must retain
materials, UVs and silhouettes; do not drop arbitrary runtime triangles.

Separate variant assets let distant and portal views acquire small meshes first.
They also allow neighbors to cache each variant with the existing owner-scoped
permissions. Geometry variants must not change collision or gameplay authority.
A persistent instance wrapper owns its world transform; visual children may be
replaced without moving the object or rebuilding collision. Keep a usable level
while asynchronously loading its replacement; abort and reject stale loads on
handoff. Use hysteresis and transition rendering to avoid oscillation and popping.

## Camera selection

Select by projected bounds and actual view resolution, with a sustained-load
bias that recovers when rendering headroom returns. Preserve full close-range
Flip7 quality with sufficient headroom. Explicitly update before scene traversal.
`MeshRenderer.onBeforeRender` is invoked only on eligible visible meshes, so a
hidden child cannot use it to reactivate itself and groups cannot select levels
there. Portal previews must use `WorldPortalView`'s mapped destination camera and
256 by 512 target, rather than the main camera or player position.

## Verification gates

Check near/far/near selection, hysteresis, actual submitted triangle reductions,
unchanged materials/transforms/collisions, mapped portal-camera selection,
variant fetch priority, shared-resource disposal and interrupted downloads.
Compare matching near and distant views locally and on Flip7, including animated
avatars. Structural GLB checks alone are insufficient visual evidence.

## Implemented contract and runtime

`lods` contains one to three records with exactly `assetId` and
`maxScreenFraction` fields. Thresholds are finite, strictly decreasing and
between zero and one; variant IDs are distinct from each other and the base.
Streaming bounds are required. Source import and signed client/server manifest
validation enforce the contract and GLB references. The converter hashes every
variant. Proposal and Blender action updates permit validated LOD declarations.

`WorldObjectLOD` estimates the projected sphere diameter relative to viewport
height using transformed bounds and the camera projection matrix. It switches
with 12% hysteresis. Each package owns per-object controllers and persistent
instance wrappers; visual levels are independently cached under verified hashes.
Selected variants load on demand through `WorldConnector.getAsset`, keeping the
current visual until acquisition completes. Completion cannot change visibility;
the next explicit per-camera update does that. Disposal aborts variant downloads.
Heightfield collision always traverses the base visual, even if a lower level is
currently displayed. Other collision descriptors remain unchanged.

Current limits: the base mesh is still initially acquired; loaded levels are
retained until package disposal, so LOD reduces draw geometry but does not yet
reduce texture/mesh residency. Selection uses screen fraction, without a target
pixel-size or sustained-load bias. Transitions currently use hysteresis and a
ready-level swap, without a dither cross-fade. Existing checked-in world objects
have no new LOD declarations yet. These are remaining work, not completed gates.

`test/world-object-lod.mjs` uses texture-free real GLBs to establish eight/four/two
visible-triangle switching, near-view restoration, independent camera selection,
unchanged collision, asynchronous race handling and Blender validation. It does
not establish GPU-submitted counts or near/far image fidelity. Contract tests
exercise invalid declarations and CLI hash import; Go tests cover signed validation.
