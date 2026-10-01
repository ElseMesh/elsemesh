# Example island ocean component

`tidewater.island-ocean/1` attaches the project's existing ocean renderer to a hosted copy of the example island. A component record contains only its stable ID, type, and optional streaming priority:

```json
{
  "id": "tw-component:island-ocean",
  "type": "tidewater.island-ocean/1",
  "priority": "portal-preview"
}
```

The component creates a camera-centered CDLOD mesh under the hosted world's root and reuses the existing FFT ocean simulation and water material. The source island's terrain and water profile are currently coupled in those shaders; this component therefore assumes the example island's terrain, sea level of zero, and rendering profile. A world may declare at most one instance. It has no collision or simulation-authority effect.

This is the reference-island water component. For terrain-independent open water, use [`water-body.md`](water-body.md); do not use this island component for unrelated custom worlds.
