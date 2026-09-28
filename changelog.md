# Burning Horizons changelog

**Author: Agent Control**  
Reporting period: **26–28 September 2026**. This summary follows repository history; original asset credits and historical commit authors remain intact.

## 28 September 2026

- **Agent Control:** extended Island 3 beneath Building #002 with a rounded terrain plateau, removed its redundant separate path and retained the existing portal-warehouse sign.
- **Agent Control:** upgraded the portal warehouse with CC0 scanned brick and concrete PBR maps, polished tiled flooring, restrained reflections, rusted black RSJs, warmer local lighting, stair tread lights, chrome details, near-wall graffiti, rugs, plants, pictures, living, dining and kitchen detail.
- **Agent Control:** rebuilt the mezzanine presentation with swivel chairs, populated bookshelves, detailed retro desks, a black feature wall and an original period-inspired rainbow computer emblem in place of the neon artwork.
- **Agent Control:** corrected the sloping stair glass so every panel ends below its handrail.
- **Agent Control:** vendored the MIT-licensed BASIC-M6502-TS interpreter, adapted browser save/load to local storage, and made the mezzanine Commodore 64 a full-screen programmable terminal with login, queued input, `LIST`, `RUN`, `SAVE` and `LOAD`.
- **Agent Control:** added Esmie from Edinburgh as a faint captioned warehouse voice: a one-minute island-history introduction and non-repeating Edinburgh childhood memories at five-minute intervals while the player remains inside.
- **Agent Control:** replaced Esmie's provisional browser voice and caption with the user-selected Sentinel Piper Alba voice. Bundled eight verified WAVs, removed all narration popup UI and kept Esmie as quiet, non-spatial audio inside the player's head.
- **Agent Control:** made Esmie's one-minute introduction and five-minute random Edinburgh memories available throughout the entire game instead of limiting them to time spent inside the portal warehouse.
- **Agent Control:** performed a second governed portal-warehouse reference pass with arched glazing detail, structural rivets, layered textiles, richer living, kitchen and dining props, denser planting and graffiti, and a more lived-in retro mezzanine. Added a versioned operation manifest and learning ledger so future reference-detail work can repeat the observation, batching, invariant and verification sequence.
- **Agent Control:** used the first WebGPU side-by-side comparison as a correction signal, then darkened the upholstery and added the missing lounge gallery, framed prints, layered mural, kitchen objects, rug trim, archive devices, indoor planting and foreground riveted columns. Retained every failed governed-review attempt in the learning ledger rather than claiming autonomous success.
- **Agent Control:** replaced the pale showroom floor grid with darker polished industrial concrete, larger irregular slab joints, mottled wear, bounded damp reflections, hairline distress, embedded expansion repairs and two grated drains. The walkable collider and route remain unchanged.
- **Agent Control:** qualified a CC0 BlendKit soft-black-fabric source, preserved the untouched Blender asset and hashes off-repository, derived a compact 512 px PBR browser set, and applied it only to the existing batched upholstery materials. A measured CC0 chaise source was retained as reference and rejected from runtime because its triangle and texture cost was excessive for one prop.
- **Agent Control:** corrected all six generated dining chairs so their backrests sit away from the table and the seats face inward. The failed orientation and reusable placement rule are retained in the learning ledger.
- **Agent Control:** retained Building #001, Building #002 and all existing island gameplay; added focused regression tests and Windows WebGPU visual evidence.

## 27 September 2026

- **Agent Control:** replaced straight wildlife branch crossbars with tapered curved limbs growing from staggered trunk joints, added ascending forks and redirected monkey motion along the actual branch curves.
- **Agent Control:** added occasional bounded jumps to branches on nearby trees, including curved airborne motion, tucked feet, live wind-following landing points and return patrols; tested transition continuity.
- **Agent Control:** added bounded CC0 scanned palm/broadleaf bark maps, folded mango foliage, curved bananas in tiered bunches, mango clusters and four branch-patrolling monkeys attached to wind-bent trees. Preserved coconut palms, gameplay and hunger settings; added continuity/culling tests and an in-engine wildlife inspection video.
- **Agent Control:** added per-instance previous transforms to animated wildlife for correct temporal motion vectors, and re-recorded the wildlife preview after checking the initial clip for trails.
- **Agent Control:** reviewed Rebroad's Linux rendering changes and added cross-platform Auto/High/Balanced/Mobile profiles, bounded output resolution, adaptive internal resolution and GPU adapter fallback.
- **Agent Control:** enabled cave view/shadow culling, replaced flat cave materials with shared CC0 scanned-stone PBR maps, built curved glass tunnel/train shells above the maglev foundation, and batched/animated the marine life.
- **Agent Control:** added static-asset cache revalidation, text compression and streaming on the online host. Recorded fixed-view PC GPU measurements and explicitly separated mobile-profile emulation from physical phone qualification.
- **Agent Control:** completed the edited, silent Susie journey video and a rendering-update inspection, stored outside Git on D:.

- Disabled hunger by default with a reversible Gameplay settings switch. Preserved survival code and saved hunger; disabled food consumption, HUD and hunger slowdown while off.
- Added a local character-name field, including the blonde female Susie walkthrough setup.
- Added chapter-based gameplay recording and actual Godzilla body-runoff emission evidence.
- Enabled GitHub Pages hosting alongside the existing hpubuntu multiplayer service.
- Updated README and this changelog under Agent Control attribution.
- Fixed the full game title fitting desktop and mobile loading screens (`ac63c08`).
- Added selectable male/female Rocketbox avatars, clothes, hair and skin colours with multiplayer appearance replication (`38eda46`).
- Replaced the playable scan with a licensed stock animated man; retained the scan for rental NPC Loz (`e9fa9ea`).
- Added Loz's greeting and Rocket Island key briefing (`2d57ed1`).
- Added bending trees, shoreline breakers, flashing helipad beacons and scanned NPC presentation (`c3159f0`).

## 26 September 2026

- Renamed and developed the island mystery game; added Blender world editing and UNDERNEATH cave assets (`1e33198`, `4e46283`, `4ec0efd`, `ce16d9b`).
- Added the island route, survival systems, local-time sky and Godzilla encounter (`ad62144`).
- Improved cave and tunnel rendering, roof seams, station arrival, boat approach and cave mooring (`8701e1b`, `06e642c`, `f6d8399`, `38f66c1`).
- Added experimental federated-region protocol and the local two-node demonstration; documented implementation limits (`b3e0fdf`, `addbd8c`).
- Fixed local-avatar first-person visibility (`b831491`).
- Added real online room invitations, deployment qualification, speech/text conversation, shared boat authority and timed Godzilla runoff (`e9ec411`, `af591a3`, `aa11bd9`).
- Documented hosting and multi-node trial setup (`0607f05`, `d0cd575`).
- Expanded rooms to ten players and added forward boat searchlights (`ec79303`, `8dd7126`).
- Added the windy third island, rental hut, key-gated helicopter and exclusive network pilot authority (`2f7f095`).

## Qualification limits

Automated game and ten-client networking tests do not replace a ten-device physical play test. Video capture uses scripted controller inputs and chapter edits. Federation gameplay handoff, helicopter passengers, combat damage and a complete mystery ending remain unfinished. A private voice worker is optional; text remains available without it.

## 2026-09-27 — Physical items and credits

Author: Agent Control

- Removed the starting fishing rod; fishing now requires owning a found or purchased rod.
- Added original physical rod, utility knife, watch and washed-up phone models, pickup, bag, use and drop.
- Converted Joe's stall to a general shop with credits, fixed buy/sell prices and a regenerated sign.
- Added server-owned room inventories and accepted item/credit/barter offers, with exclusive pickup and atomic transfers.
- Added solo save migration and explicit session-only online lifetime, plus economy and real WebSocket tests.
- Candidate only: no push or hosted deployment.
