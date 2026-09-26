# Multi-player node setup (up to ten)

The online game uses one hpubuntu room server behind HTTPS/WebSocket and one WebGPU browser per person. The host has role `loz`; guests receive the first free slot from `ed`, `guest2` through `guest9`. The random 128-bit room code in the invitation routes only that room's state and speech. Players do not need inbound ports or a server on their own machines.

```text
Host browser ──────┐
Guest browsers ×9 ─┼── HTTPS/WSS ── hpubuntu room relay
                   └── optional private loopback OmniVoice worker
```

## Run the node

1. On hpubuntu, use the approved Burning Horizons checkout. Run `npm ci`, `npm run build`, `npm test`, and `npm run test:network`.
2. Run `node tools/networking/online-server.mjs` through the `burning-horizons-online.service` user unit, or directly for local development. It binds to `127.0.0.1:5200` by default; `BH_ONLINE_HOST` and `BH_ONLINE_PORT` override that.
3. Provide HTTPS and WebSocket upgrade forwarding to port 5200. The current hpubuntu deployment uses Tailscale Funnel on port 443. Keep the optional OmniVoice worker on its separate private loopback port and keep `BH_SPEECH_CONFIG` outside the repository.
4. Open `/play-online.html`, create a room, and send the same invitation to up to nine guests. Each guest chooses **Join game**. The server assigns a free slot and displays the room count. The eleventh connection is rejected. A slot is freed when its browser leaves.

For a local rehearsal, `npm run online` serves the built game at `http://127.0.0.1:5200/play-online.html`. A public invitation requires the HTTPS route; a loopback link works only on the server machine.

## What is shared

Player positions, motion, mode, speech text and each peer's radar marker are relayed to every other player in the room. The host alone publishes boat position, orientation and velocity and can take the helm. Guests can ride and move on deck. The boat's paired forward lamps turn on at dusk and illuminate the water and nearby surfaces. The room server is a relay, not a simulation authority or a federated world node. Inventory, fish, combat, interactables, monorail state and local time settings are not synchronized.

The invitation grants a vacant guest slot. The host URL carries a separate random host key; do not share it with guests. Do not copy a browser's private key or an OmniVoice profile to another device. Share invitation links only with the players you intend to invite. If the host disconnects, guests cannot take over the helm; the host must reconnect with the original host URL. Guest slot assignment is currently per connection, so a reconnect can receive a different numbered slot.

## Qualification

`test/ten-player-room.mjs` opens ten WebSocket clients and checks unique slots, full-room rejection, freed-slot reuse, state and speech fanout, and rejection of a guest-supplied boat snapshot. `npm run test:network` includes it. This verifies the relay contract, not ten-device WebGPU performance. Before calling a ten-person session qualified, run a real trial across ten devices/networks and check avatar/radar visibility, movement smoothness, speech fallback, boarding, host steering and reconnect behaviour. Federation between independent region owners remains a separate architecture described in `docs/federated-world-protocol.md`.
