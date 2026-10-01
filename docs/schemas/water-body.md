# Portable deep-water component

`tidewater.water-body/1` renders a bounded, terrain-independent deep-water surface in a hosted world. It requires a signed `rules.seaLevel` and supports one square body per world:

```json
{
  "id": "tw-component:offshore-water",
  "type": "tidewater.water-body/1",
  "center": [0, -250],
  "extent": 1200,
  "priority": "visible"
}
```

`center` is the horizontal world-space `[x,z]` center in meters. `extent` is the square's half-width and half-depth, bounded from 8 to 100,000 meters. The component uses the shared FFT wave simulation and water material, but it does not sample terrain, create beach surf or foam, add collision, or enable underwater gameplay. Its level is stored on the component's water shader parameters, so portal previews can show destination water at the destination's signed sea level. It cannot be combined with the example-only `tidewater.island-ocean/1` component.

The component is a first general deep-water renderer, not yet a general water authoring system. Multiple bodies, irregular shorelines, terrain interaction, authored material profiles, and portable underwater effects remain future capabilities.
