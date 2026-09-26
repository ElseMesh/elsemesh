# Network nodes and a three-player trial

## What runs today

The hosted online game has one hpubuntu room server behind HTTPS and WebSocket
upgrade, plus one browser per human player. A browser creates a persistent
Ed25519 node identity and sends validated player state about ten times per
second. Rooms use an unguessable 128-bit code. The server relays state and
speech only to the matching room. The current implementation recognises two
roles, `loz` and `ed`, and admits one socket per role. **A third player cannot
join the same room yet.** Opening a second room creates a separate session.

```text
Loz browser (node A) ── HTTPS/WSS ── hpubuntu room server ── WSS ── Ed browser (node B)
                                │
                                └── optional private loopback OmniVoice worker
```

The host browser is authoritative for boat physics. Its position, orientation
and velocity ride in the validated host state. Ed is a deck passenger. World
interactions, inventory and monorail travel are not replicated. The room
server is a relay, not a simulation authority or a federated world node.

## Existing two-node setup

1. Build the repository with `npm ci && npm run build` on the server.
2. Start `node tools/networking/online-server.mjs` behind an HTTPS reverse
   proxy or Tailscale Funnel that forwards WebSocket upgrades to loopback port
   5200. The process binds to `127.0.0.1` by default. Its service unit is
   `burning-horizons-online.service` on hpubuntu.
3. Open `/play-online.html`, create a private room, and share only its generated
   invite link with the second person. Each browser needs WebGPU and WebSocket
   access to the same host.
4. Confirm each sees the other avatar and `L`/`E` radar marker. Press **T** and
   exchange text; enable friend voice separately on each browser. Test the
   host driving while the guest is aboard.

Do not copy a browser's private key or an OmniVoice profile to another node.
There is no inbound port on the players' machines in this topology. The room
code grants the unoccupied role, so treat invite links as private.

## Changes required before a genuine three-player room

1. Replace the fixed `PLAYER_IDS`/`loz`/`ed` pair with a room membership map
   keyed by an authenticated node and a stable room-scoped player ID. Keep
   `loz` as the boat owner until a tested helm-transfer protocol exists.
2. Change the server's two-slot `Map` to an explicit capacity (start at three),
   assign slots on join, send a membership snapshot, and announce join/leave.
   Preserve a per-node sequence and rate limit. A reconnect must reclaim only
   its own identity; an invite alone must not impersonate an occupied node.
3. Replace the client's single `RemoteState` and `remoteAvatar` with maps of
   remote players. Create, update and remove one avatar and radar marker per
   member. Speech bubbles and audio panners must follow the speaker ID.
4. Broadcast boat snapshots from the one owner to all passengers. Validate
   that only the owner can set boat state or `mode: boat`. Decide whether the
   boat should stop or transfer control when that owner disconnects.
5. Add a three-browser automated transport test for simultaneous movement,
   isolation between rooms, joining and leaving, chat fanout, duplicate
   suppression, and one boat driver. Then perform a real three-device test on
   separate networks, checking WebGPU rendering, radar, movement, boat ride,
   voice or text fallback and reconnection.

The host can remain hpubuntu for an initial three-person trial. A separate
server per player is unnecessary for this relay mode. Federation is a
different architecture; the protocol design in `docs/federated-world-protocol.md`
describes independently owned regions and explicit portal handoff.
