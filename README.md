# Burning Horizons — Island Mystery

Maintained by **Agent Control**. See [the two-day changelog](changelog.md).

**[Play in your browser](https://lozknowles.github.io/Burning-Horizons/)** · **[Play multiplayer](https://hpubuntu.taila22e8a.ts.net/play-online.html)**

**Burning Horizons is an island mystery to explore and solve.** Arrive on a remote island, uncover a hidden cave, ride a concealed monorail beneath the sea, and follow an expedition's trail to a second island. Sail past Godzilla to a windy third island, meet Loz at his helicopter rental hut, collect the keys and fly back over the archipelago. Fishing and trading are optional activities. Hunger is disabled by default so exploration never requires eating.

The project is also exploring an **open federated virtual-world protocol**: independently owned regions connected by explicit portals, with cryptographic node identity, bounded region rules and controlled authority handoff. The [federated protocol design](docs/federated-world-protocol.md) and [networking architecture](docs/networking/architecture.md) explain what is implemented and what still needs a live game and physical-node proof. The existing island game works without federation.

| Federation status | Current scope |
|---|---|
| Implemented | Strict region/portal descriptors, owner-signed versions, expiring host delegation, signed portal invitations, bounded rule negotiation and handoff verification; automated network tests pass. |
| Experimental | Private rooms for up to ten people, radar markers, text conversation, optional spatial speech, a host-driven shared boat, an exclusively piloted shared helicopter, an optional local Loz/Ed browser demo, and a physical MSI↔hpubuntu **protocol-only** portal round trip. |
| Planned | Cave-triggered live handoff, Ed World rendering, physical two-node avatar crossing, secure internet transport and replica failover in live gameplay. |

![The island at golden hour](docs/screenshot.jpg)

## The journey

1. Walk the home island, explore the shore and take the boat around the western headland.
2. Follow the water channel into **UNDERNEATH**. Stop the boat in the deeper water before the landing, leave the helm, jump overboard and wade up the shallow stone ramp. The explorer is visible seated at the wheel, aboard and on foot.
3. Use the flashing electronic reader. Its door rises into the cave ceiling and reveals the lit station, platform and waiting train. Press **N** to see the three-island map.
4. Board the two-way monorail. Its curved glass monocoque travels through a rounded glass pressure tunnel above a solid maglev base, with swimming fish visible through both enclosures.
5. Explore the second island, read the expedition log in Station B, and locate the silent signal mast. The same train returns to the home island.
6. Sail south past Godzilla to the third island's north-facing jetty. Stop alongside in deep water and step ashore. Meet Loz outside **Loz's Helicopter Rental** and press **E** for the keys.
7. Follow the lit path to the central helipad. Board the neon pink helicopter with **E**, climb with **Space**, and fly around the islands. Trees sway and a windsock shows the gusts. See the [flight guide](docs/THIRD-ISLAND-HELICOPTER.md).

The mystery story is an evolving playable prototype. The existing signal objective has a first reveal; a longer investigation and ending are still to be built. The firearm is a finite-ammo survival sidearm with muzzle flash and reload; combat and damage are not yet implemented. The second island terrain and rail architecture are procedural in-game assets. UNDERNEATH was authored in Blender.

## Survival and the world

- Choose your avatar in the online lobby, or press **K** in-game. Male and female Microsoft Rocketbox characters have idle, walk, run and seated clips. Set a local character name and choose shirt, trouser, skin and hair colours; choices are saved in this browser and shared with all room peers. The initial hairstyles are short hair (man) and ponytail (woman). Skin tone is independent of gender; these are appearance options, not racial categories. Your scanned likeness is reserved for rental NPC Loz. See [avatar chooser](docs/AVATAR-CHOOSER.md), [stock character](docs/STOCK-PLAYER.md) and [scan provenance](docs/SCANNED-CHARACTER.md).
- Third-island trunks bend progressively in gusts with anchored roots; crowns sway independently. Helipad edge beacons flash alternating double pulses. Breaking-wave lips and fresh whitewater now reach the third-island shoreline.
- Photographed CC0 bark maps add trunk detail. Banana plants carry curved fruit in hanging bunches; coconut palms and mango trees also carry fruit. Four animated monkeys patrol curved, tapering branches and occasionally jump between nearby trees beside the third island's rental-to-helipad path. Limbs grow from different trunk heights; mango crowns have individual folded leaves. Fruit and wildlife are currently decorative. See [trees and wildlife](docs/TREES-AND-WILDLIFE.md).

- Hunger is **off by default on every launch**. In **H → Gameplay → Survival**, enable **Enable hunger** to restore the retained food system. With the switch off, hunger stays unchanged, the hunger HUD is hidden, B does not consume fish, and low hunger cannot slow walking. Existing saved hunger is preserved. The prototype has no starvation death mechanic.
- When optional hunger is enabled, press **B** to prepare a fish from the cooler; low hunger slows walking.
- Fishing, fish trading, boat fuel and upgrades remain available as survival systems.
- The Steam79 Godzilla asset emerges offshore and walks toward the landing with a Blender-made walk cycle, a short burst of falling water that ends after emergence, heavy foot splashes, a trailing wake and foam crests pushed ahead of it.
- By default, the sky follows the computer's **local time**, with sunset, moon and stars. The Sky settings allow a manual time and accelerated preview.
- The original island includes a pier, village, reef, wildlife, whale, tropical vegetation and a simulated ocean.

## Controls

| Key | Action |
|---|---|
| W A S D / mouse | Move / look |
| Shift / Space | Sprint / jump or swim up |
| E | Interact with boat, cave door, monorail, logs and signal mast |
| N | Three-island map |
| K | Choose avatar and colours |
| WASD / mouse (helicopter) | Fly forward/back/sideways / steer heading |
| Space / C / Shift (helicopter) | Ascend / descend / faster cruise |
| Left / right cursor (helicopter) | Look through side windows |
| E (helicopter) | Board with key; leave when stopped on dry ground |
| G / left mouse / X | Equip sidearm / fire / reload |
| B | Prepare and eat a fish when optional hunger is enabled |
| R / left mouse | Equip fishing rod / cast and reel while it is equipped |
| I or Tab | Cooler, fish log and inventory |
| V | Boat camera |
| L | Flashlight |
| H | Settings |
| T | Talk in an online room (Enter sends, Esc cancels); otherwise pause or resume manual time |
| M | Mute |
| F1 or ? | Full controls |

## Run and build

### Rendering quality

**H → Performance → Quality profile** offers Auto, High, Balanced and Mobile.
Auto uses a bounded output resolution and adapts the internal resolution to
sustained load. Manual render-scale changes turn adaptation off. High restores
full resolution, shadows and screen-space water reflections. Balanced retains
shadows; Mobile reduces the budget further and disables sun shadow maps.

UNDERNEATH uses CC0 scanned stone textures with normal/roughness detail and wet
surfaces. The undersea route has rounded glass enclosures and batched swimming
marine life. See the [Agent Control performance report](docs/performance/README.md)
for measured PC results, quality tradeoffs and untested physical-phone limits.

Requires a WebGPU-capable browser and GPU. The first launch may take a minute while shaders compile.

```sh
npm ci
npm run dev
npm test
npm run build
npm run test:network
```

The local server uses http://127.0.0.1:5189/. The deployment workflow is `.github/workflows/deploy.yml`. GitHub Pages serves the static WebGPU game; the hpubuntu service supplies the separate multiplayer WebSocket relay. Use the multiplayer link above for rooms and invitations.

## Play online with up to nine friends

Open [the hosted online game](https://hpubuntu.taila22e8a.ts.net/play-online.html). Choose **Create private room**, copy the invitation, and send it to up to nine friends. Start your game; each friend opens the invitation and chooses **Join game**. Each browser controls one human player. Rooms allow one host and nine guests, are separated by a random invitation code, and disappear when everyone leaves. The host appears as `L` on guest radars and guests have numbered markers.

Press **T** to type a line. While the talk box is open, movement and camera controls pause. Press **Enter** to send or **Esc** to cancel. Everyone in the room sees accepted text in a caption, with a bubble over the speaking character when visible. Click **Enable friend voice** once to permit browser playback. The server can synthesize the accepted private Loz OmniVoice profile when its separately hosted worker is configured and healthy; guests currently use text only. If synthesis fails, the text conversation still works. Voice playback and latency require a physical listening check before they can be called qualified.

All connected players can board the same boat. The host alone drives and sends the boat's position and orientation to all guests; guests can ride and move around on deck. Paired forward lights illuminate the route automatically as night falls. There is no helm handoff.

Any player can collect Loz's helicopter key. One player at a time can pilot the room's helicopter; the server arbitrates control and broadcasts its position. A disconnected pilot returns the helicopter to its helipad. Helicopter passenger seats are not implemented. Flight uses assisted game controls and conservative collision checks. See [third-island details and qualification](docs/THIRD-ISLAND-HELICOPTER.md).

For local development, run `npm run build` then `npm run online` and open http://127.0.0.1:5200/play-online.html. The server hosts the built game and relays validated player-state messages over WebSocket. To invite someone over the internet, host this server behind HTTPS with WebSocket upgrade support; `127.0.0.1` invitation links work only on the same computer. The server binds to loopback by default; configure `BH_ONLINE_HOST` and `BH_ONLINE_PORT` if needed. GitHub Pages alone cannot host this WebSocket server.

The online room is an early shared-presence mode. Shared inventory, combat, interactive objects and cross-island state are still local to each client. It is not the federated world portal implementation. Keep the invitation private; anyone holding it can join a vacant guest slot. The [online speech and shared boat notes](docs/ONLINE_SPEECH_AND_BOAT.md) describe the protocol, private voice configuration and current limits. The relay has an automated ten-client test, but a physical ten-device play test is still pending.

See [online room operations and limits](docs/networking/online-rooms.md) for the server setup, external connection check and deployment notes.
For node roles and a larger session checklist, see [multi-player node setup](docs/networking/multi-player-nodes.md).

The local journey video is captured from the running game with `tools/video/journey-capture.js`, `tools/video/journey-route.mjs` and `tools/video/journey-receiver.mjs`. Its continuous curved boat course clears the pier before turning toward the cave. The game boat controller supplies buoyancy, trim, roll and spray during the time-compressed shot; normal driving uses its full physics controller. The boat stops afloat before the shallow ramp and the explorer jumps into the water. The capture continues through the station, undersea crossing, sunset and night arrival. The rendered video is kept outside the repository.

## Blender and world editing

`npm run world:export` exports the home island's heightfield and masks into `artifacts/world/` for Blender. [The Blender workflow](docs/BLENDER-MODDING.md) describes the cave model and import/export process. The cave GLB and layout are under `public/models/world/`. The prepared Godzilla asset is `public/models/godzilla/steam79-walk.glb`; `tools/blender/prepare_godzilla.py` documents its reduction and animation.

## Project status

The cave, monorail, second island, survival sidearm, hunger, local-time sky and Godzilla encounter are implemented in the current prototype. The longer mystery, combat consequences, broader second-island content, and full normal-controls route qualification remain work in progress. The schematic [world expansion map](docs/world-expansion-map.svg) and [design notes](docs/WORLD-EXPANSION-CONCEPT.md) describe the intended direction.

## Credits and license

Source code is MIT licensed under [LICENSE](LICENSE). Third-party assets keep their own licenses. See [CREDITS.md](CREDITS.md), including the required Steam79 attribution for the Godzilla model.

## Agent Control walkthrough capture

`tools/video/susie-capture.js` and `susie-receiver.mjs` record Susie (female, blonde) using scripted inputs to the actual game controllers. The capture is edited in chapters, with initial/restored recording fixtures and exterior inspection cameras; it is not an uninterrupted manual play test. Source footage and the final MP4 are kept on D: outside Git. Body-runoff telemetry distinguishes falling water from waterline splashes.

The completed local MP4 is `D:\Downloads\Burning-Horizons-Susie-Complete-Journey.mp4`.
It includes avatar setup, cave/rail return, rental-island arrival, keys, take-off,
flight around Godzilla and a final runoff inspection. Travel playback is labelled
2×/4×; the recording resumes in open water after an interruption. Rental arrival
uses a water exit and swim/wade ashore. The final appended inspection shows the
updated stone and curved-glass tunnel; the earlier journey retains its recorded
pre-update scenery. The video is silent. All 12 sampled final-inspection frames
emitted zero new body-runoff particles; waterline splashes remain intentional.

## Hosted multiplayer preview

The [hosted online preview](https://hpubuntu.taila22e8a.ts.net/play-online.html) uses the same integrated game code published here. A host can invite up to nine guests to one private room. Players see each other and numbered radar markers, exchange typed speech with **T**, and ride one boat with only the host at the helm. Paired searchlights illuminate the route ahead at night. The host's accepted private OmniVoice profile can generate audio when the separately hosted worker is healthy; guests currently have text only.

The relay has an automated ten-client test and the hosted HTTPS/WebSocket route has been probed. A physical ten-device gameplay and voice check remains to be done. Keep the host game URL private: it contains a separate key for the helm. See the [network node setup](https://github.com/lozknowles/Burning-Horizons/blob/main/docs/networking/multi-player-nodes.md) and the [preview branch README](https://github.com/lozknowles/Burning-Horizons/blob/main/README.md) for current operations and limitations.
