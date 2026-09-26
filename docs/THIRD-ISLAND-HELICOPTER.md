# Third island and helicopter

## Baseline and preservation

Started from clean `feature/ten-player-rooms` at `8dd7126`, in the existing isolated checkout on D:. Work branch: `feature/third-island-helicopter`. No original model or UNDERNEATH asset was overwritten. The new heightfield is confined to the sea south of the home island, around (115, 650). Home-island and cave coordinates fall outside that footprint.

## Play

Sail south past Godzilla, keeping a safe berth. Island 03 is visible beyond it. Approach the west side of the north-facing timber jetty, stop afloat, leave the helm and use E at the boat rail to step ashore. The rental and helicopter appear as L and H on the radar. N opens the three-island map.

Meet Loz outside **Loz's Helicopter Rental** and press E for the key. Follow the path lights to the central clearing. Press E beside the bright pink helicopter to board. Without the key it remains locked.

| Control | In the helicopter |
|---|---|
| WASD | Forward/back and lateral movement, relative to heading |
| Mouse | Steer heading and look up/down |
| Space / C | Ascend / descend |
| Shift | Higher cruise speed |
| Left / right cursor | Look through side windows; release to face forward |
| E | Exit only while landed and stopped on dry ground |

The cockpit has a physical instrument console, window frames and live speed, height-above-ground, heading and rotor indicators. Rotor spin-up takes a moment. Flight is assisted game flight, with damped acceleration and automatic hover, not an aviation simulator. Trees and a windsock show gusts on the third island. Height is capped at 450 m. Terrain/box/tree avoidance is conservative; complex overhang and rotor-volume contact are not a full rigid-body aircraft simulation.

## Online ownership

The room has one helicopter. Any player can collect a key and request control. The relay checks proximity to Loz and the helicopter and grants one pilot at a time. Pilot position and craft state are replicated to all clients; all player radar markers continue to work. Releasing control requires a stopped, grounded craft. If the pilot disconnects the craft returns to its original helipad, avoiding an abandoned aircraft in mid-air. Keys last for the current session. There are no helicopter passenger seats in this version.

The relay validates ownership and bounded state, but player movement remains client-reported, as in the existing room prototype; this is not an anti-cheat authority model.

## Implementation and checks

- `src/world/ThirdIslandLayout.js`: localized island shape and landmarks.
- `src/world/ThirdIslandSystem.js`: original procedural geometry, wind motion, interaction and cockpit.
- `src/player/HelicopterPhysics.js`: fixed-substep flight integration.
- `src/network/HelicopterLease.js`: exclusive room ownership and validation.
- `node --test test/helicopter.mjs test/helicopter-online.mjs`: flight, landing, footprint preservation and live local WebSocket ownership checks.
- Existing `npm test`, `npm run test:network` and `npm run build` remain required.

## Capture

`node tools/video/helicopter-receiver.mjs` receives local capture files into `D:/Downloads`. Start the Vite game with `?bench&noAudio`, wait for `window.__app`, then invoke the exported `recordHelicopterJourney` from `tools/video/helicopter-capture.js` in the local developer console. The recording begins aboard the moored boat and uses scripted inputs through the live boat, walking and helicopter controllers. Key pickup and boarding use the normal interaction methods. Camera direction is choreographed for visibility. Captions and cockpit readouts are composited over actual rendered frames. Inspect the capture report for any failure before distributing the video.

Generated video and screenshots stay outside Git. All added geometry is original procedural project code; existing asset attribution remains unchanged.
