# Third island and helicopter

## Baseline and preservation

The third island heightfield is confined to the sea south of the home island, around (115, 650). Home-island and cave coordinates fall outside that footprint. Original models and UNDERNEATH geometry are preserved.

## Play

Sail south from the home island toward Island 03. Approach the west side of the north-facing timber jetty, stop afloat, leave the helm and use E at the boat rail to step ashore. The rental and helicopter appear as L and H on the radar. N opens the map.

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

`node tools/video/helicopter-receiver.mjs` receives local capture files; review its output directory before starting it. Start the Vite game with `?bench&noAudio`, wait for `window.__app`, then invoke the exported `recordHelicopterJourney` from `tools/video/helicopter-capture.js` in the local developer console. The recording begins aboard the moored boat and uses scripted inputs through the live boat, walking and helicopter controllers. Key pickup and boarding use the normal interaction methods. Camera direction is choreographed for visibility. Captions and cockpit readouts are composited over actual rendered frames. Inspect the capture report for any failure before distributing the video.

Generated video and screenshots stay outside Git. Island and aircraft geometry is original procedural project code.

## Wind, surf and characters

Loz greets an approaching player on foot within 5.5 metres. Press **E** nearby
to receive the keys and hear: “Here are the keys. You need to fly to Rocket
Island. Follow the lights to the helipad.” A caption bubble accompanies both
lines. Dialogue is personal to each visitor; greetings have a 45-second cooldown
and require leaving the area before repeating. Sound follows the game's mute
setting. These two prerecorded lines use the existing accepted Loz OmniVoice
profile; private voice configuration and representation are not distributed.
Rocket Island is a dialogue destination at this stage; this change adds no new island.

Trunks use ten connected sections: the base remains fixed while progressively
stronger bending and delayed gust motion reach the canopy. Foliage has independent
flutter. Twenty helipad beacons flash alternating double pulses at night and day.

The breaker system samples the actual third-island waterline and uses the existing
wave-propagation field to generate curling lips and spray. Fresh whitewater shading
also works outside the original beach simulation area. Persistent advected foam
and wet-sand history remain limited to the original beach's simulation tile.

Loz loads the existing Blender-rigged KIRI scan. Player/remote avatars instead
load the [stock male character](STOCK-PLAYER.md), not the user's likeness.
Idle, walking, running and seated helm clips crossfade; first-person hiding and
shared boat seating remain intact. The procedural figure is a loading/error fallback.
See [source, limitations and animation attribution](SCANNED-CHARACTER.md).

Checks: `node test/third-island-surf.mjs`, the existing game/network suites,
and an in-engine visual review of the rental NPC, walk/run, surf and night beacons.
The review video uses choreographed camera/character positions to show animation;
it is not a recording of a ten-person online session.
