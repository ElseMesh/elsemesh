# Online rooms for up to ten players

The online room is a separate, opt-in game mode. It does not change solo play or the local Loz/Ed AI demonstration. Up to ten browsers connect to one HTTPS origin; its WebSocket server relays validated `elsemesh.player-state/1` and `elsemesh.character-speech/1` messages between one host and nine guests. Browser identities remain distinct. The 128-bit room code derived from the random host key is the invitation secret. [The multi-player node guide](multi-player-nodes.md) documents the topology and qualification limits.

## Play

Open the server's `/play-online.html`, create a private room, copy the invitation, then start the host game. Up to nine friends can use the same invitation and choose **Join game**. Keep the host game URL private: its fragment contains a separate host key for the boat helm. Invitations also use fragments, and credentials are sent in the first WebSocket join message rather than an HTTP query. Each client needs a WebGPU-capable browser. The first visit may spend a minute or two compiling shaders. No account or Tailscale installation is needed for a public HTTPS endpoint. The server assigns guest slots in arrival order. A full room rejects the eleventh connection; a vacated guest slot becomes available again.

## Run

```sh
npm ci
npm run build
npm run test:network
npm run online
```

The server binds to `127.0.0.1:5200` by default. Serve it through a reverse proxy with HTTPS and WebSocket upgrades. Public static hosting such as GitHub Pages cannot run the room server. The root URL opens the room lobby; `/index.html` remains the game. `ELSEMESH_ONLINE_HOST` and `ELSEMESH_ONLINE_PORT` configure the binding. `tools/networking/probe-online.mjs https://YOUR-HOST` checks a real external HTTPS/WebSocket route without entering the game.

For a production server, set `NODE_ENV=production` and `ELSEMESH_PUBLIC_ORIGIN` to your exact public HTTPS origin, with no trailing slash. The listener accepts only a loopback IP and trusts a same-machine TLS proxy. See the generic [deployment templates](../../deploy/README.md). Keep private configuration outside `dist/`; this repository does not configure an existing hosted room service.

## Current gameplay boundary

Each person controls one player and sees connected peers' positions, walking motion and numbered radar markers in the same island world. Press **T** to type; accepted text appears for everyone in the room. The private server can synthesize Loz's accepted OmniVoice profile when its separate worker is healthy. Browser audio needs an **Enable friend voice** click. Guests currently have text only. The host owns boat physics and is the only driver; guests can board and move on deck. Forward boat lights illuminate the route automatically as night falls. Inventory, fish, combat effects, interactables, time settings and monorail state remain independent per client. Those systems are not yet cooperative or server-authoritative. This is a shared-presence mode, not a completed shared-world game or federated handoff. The invitation grants access to vacant guest slots; share it only with intended players. The automated room test covers ten connections, state and speech fanout, room capacity and one boat owner; a physical ten-device session remains to be qualified.
