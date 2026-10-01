# Reproducible graphics review

The game accepts review-camera URL parameters so the same view can be opened in a local build or a deployed build:

- `?view=beach` opens the beach and pier overview.
- `?view=village` opens the beach buildings.
- `?view=tValley` opens the mountain valley and trail approach.
- `?view=tSummit` opens the summit.
- `?pose=<URL-encoded-JSON>` restores a captured pose with `p` (three coordinates), `yaw`, `pitch`, and optional `time`. The shape matches the JSON returned by the existing `window.__pose()` review helper.

These opt-in parameters switch to the existing free camera; they do not affect ordinary launches. Named poses also set a fixed time of day, so lighting is consistent across captures.

For comparisons, use the same browser viewport and URL parameter on both builds, wait for startup to finish, and capture before moving the camera. Check the pier/beach buildings, the mountain trail, material colors, vegetation, shadows, and water reflections separately. Record the browser viewport and Performance-tab render scale with each capture: Linux adaptive rendering can reduce internal resolution when it misses its 24 FPS target, while the Android path keeps its existing scale and quality settings.
