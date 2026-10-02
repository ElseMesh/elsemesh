# Shared player presence

Players in a ThruHold need a visible avatar and a live position/orientation. Presence is transient, self-reported presentation state, separate from immutable world content and from authoritative boat, fishing, inventory or physics simulation. Guest presence does not require a Google account. The current implementation establishes the owner-hosted protocol and transport path; the production `WorldConnector` exposes update/leave requests and validates outgoing poses. `PlayerPresence` validates snapshots, binds world/session/request IDs, removes departed peers and interpolates remote poses with shortest-path heading rotation. The frame publisher and remote avatar renderer still need integration.

## Existing LOZ work and reuse

The archived `loz/main` ref is `717d054eed7c4e69289d0bbcbe778d18f4aeadf0`. Its `src/network/PlayerProtocol.js`, `NetworkDemo.js`, `OnlineRoomTransport.js` and `tools/networking/online-server.mjs` provide bounded pose validation, a 100 ms send/interpolation cadence, server-assigned room identities and departure handling. The fixed Burning Horizons world/sector IDs, ten named role slots and central relay cannot express arbitrary ThruHolds or their existing world gateways. ElseMesh uses those validation/lifecycle ideas with its own world transport and owner identity.

`src/player/AvatarAppearance.js` on that ref has an engine-independent five-field appearance contract, reused below. `PlayerAvatar.js` contains a procedural fallback and animated stock-character loading but assumes a boat model, helm constants and deck-local modes. Adapt the general remote-avatar portion when integrating the renderer. The allowlisted stock male/female GLBs use Microsoft Rocketbox m014/f001 sources with MIT attribution in `public/models/characters/LICENSE-Rocketbox.md`. Preserve that notice when copying assets. `AvatarMaterials.js` tints specially authored ORM-red masks; arbitrary GLBs cannot be substituted for those prepared assets. Avoid overwriting main's loader: main supports ArrayBuffer views that LOZ's loader lacks. Character selection must not permit peer-supplied URLs, shaders or executable code.

## Connection and ownership

Both the existing WebSocket gateway and WebTransport gateway accept `presence.update` and `presence.leave` after their ordinary world handshake. They bind every request to the selected world and target node, overwrite any browser-supplied session identifier with a fresh random 128-bit identifier, and derive the player ID from that session plus the gateway's identity. The client cannot select another player's ID.

A gateway can forward these requests to the world owner over the existing authenticated libp2p stream. The owner namespaces the forwarded session by the actual remote peer ID, not a claimed JSON identity. Clients arriving through different gateways share the owner's presence set. A cache or failover manifest provider rejects live presence authority with `presence_owner_required`; replica permission does not grant simulation or presence authority. The browser integration must use an owner connection for presence when content comes from a cache. Delegated live authority and continuity across owner failure remain outstanding.

A successful update returns `type: "presence"`, matching `worldId`/`requestId`, `playerId` for that connection and a sorted `players` snapshot. Each entry has `id`, the pose fields below, and an owner-generated Unix-millisecond `updatedAt`. The server holds at most 128 players per world, accepts at most 20 updates per second per active player, rejects repeated/decreasing sequences, and removes entries after ten seconds without an accepted update. Closing a connection sends a leave through the same route; TTL handles interrupted or unreachable teardown. A new transport session gets a new player identity. Account identity is not implied by that ephemeral ID.

## Pose and appearance contract

An update request contains `type: "presence.update"` and `pose`:

```json
{
  "protocol": "elsemesh.player-presence/1",
  "sequence": 1,
  "position": [1, 2, 3],
  "yaw": 0.3,
  "pitch": -0.2,
  "moving": false,
  "mode": "walk",
  "appearance": {
    "style": "male",
    "shirt": "#7194aa",
    "trousers": "#27313d",
    "skin": "#c68c67",
    "hair": "#33251c"
  }
}
```

Position is the avatar's feet in signed world coordinates: right-handed, Y-up, meters. Exactly three finite coordinates are required, each within ±100,000 m. Sequence is a JavaScript-safe nonnegative integer and increases within an active session. Yaw is finite and bounded to ±1,000 radians; the client should normalize its accumulated heading. Pitch is finite within ±1.5 radians. Supported modes are `walk`, `swim`, `deck` and `boat`; these are presentation labels and do not authorize driving or teleportation. Appearance styles are the allowlisted `male`/`female` values; all four colors are lowercase six-digit `#rrggbb` strings. Peers cannot supply model paths or materials. Server timestamps avoid relying on synchronized client clocks.

The browser should publish at 10 Hz with at most one request in flight, interpolate remote snapshots over approximately 100 ms, hide stalled avatars promptly, remove absent players, and release avatar GPU resources on departure/handoff. Only the active world publishes; preparing a portal destination must not create a player there. On handoff, leave the source, join the destination with the mapped pose, and clear source avatar instances. Open-doorway remote-avatar previews need a separate read-only subscription; publishing the visitor's own state during preview is incorrect.

## Evidence and remaining work

`presence_test.go` exercises two real WebSocket clients through a separate libp2p gateway to an owner, including attempted shared-session spoofing, separate IDs, shared snapshots, explicit leave and disconnect cleanup. It also checks capacity, expiry, rate limits, stale sequences, invalid coordinates and non-owner rejection. `webtransport_integration_test.go` joins over real HTTP/3 WebTransport and then WebSocket, checks that both transports see the same players with separate identities, and checks WebTransport leave.

Frame publication, avatar selection/rendering and GPU cleanup, live two-browser visual proof, Flip7 rendering, read-only portal presence and owner-failure session recovery remain to be implemented and verified. The production-connector HTTPS/WSS integration test also joins two sessions, verifies peer poses and departure, then confirms that owner loss and cache recovery do not grant the cache live presence authority. The complete Go suite and focused race checks pass. Client tests cover snapshot isolation, invalid appearances, reordered updates, departures, stale visibility and interpolation. Passing these tests does not yet make other players visible in the game.
