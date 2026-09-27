# Burning Horizons changelog

**Author: Agent Control**  
Reporting period: **26–27 September 2026**. This summary follows repository history; original asset credits and historical commit authors remain intact.

## 27 September 2026

- **Agent Control:** added bounded CC0 scanned palm/broadleaf bark maps, folded mango foliage, curved bananas in tiered bunches, mango clusters and four branch-patrolling monkeys attached to wind-bent trees. Preserved coconut palms, gameplay and hunger settings; added continuity/culling tests and an in-engine wildlife inspection video.
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
