# Two-player online rooms

The online room is a separate, opt-in game mode. It does not change solo play or the local Loz/Ed AI demonstration. Two browsers on different computers connect to one HTTPS origin; its WebSocket server relays validated `bh.player-state/1` messages between one host and one guest. Browser identities remain distinct. The random 128-bit room code is the invitation secret.

## Play

Open the server's `/play-online.html`, create a private room, copy the invitation, then start the host game. The friend opens the invitation and chooses **Join game**. Both clients need a WebGPU-capable browser. The first visit may spend a minute or two compiling shaders. No account or Tailscale installation is needed for a public HTTPS endpoint.

## Run

```sh
npm ci
npm run build
npm run test:network
npm run online
```

The server binds to `127.0.0.1:5200` by default. Serve it through a reverse proxy with HTTPS and WebSocket upgrades. Public static hosting such as GitHub Pages cannot run the room server. The root URL opens the room lobby; `/index.html` remains the game. `BH_ONLINE_HOST` and `BH_ONLINE_PORT` configure the binding. `tools/networking/probe-online.mjs https://YOUR-HOST` checks a real external HTTPS/WebSocket route without entering the game.

On hpubuntu, the isolated checkout is `/home/loz/burning-horizons-online`, the user unit is `deploy/burning-horizons-online.service`, and Tailscale Funnel proxies HTTPS port 443 to loopback port 5200. The user service is enabled on login; user lingering is already enabled. Existing tailnet Serve on port 19441 is separate. To update, fast-forward the checkout to the approved branch, run `npm ci` and `npm run build`, then `systemctl --user restart burning-horizons-online.service`. To stop public access, run `sudo tailscale funnel --https=443 off`; stopping the user service alone also makes the game unavailable.

## Current gameplay boundary

Both people control a human player and see each other's position and walking motion in the same island world. Their clients still run independent boat physics, inventory, fish, combat effects, interactables, time settings and monorail state. Those systems are not yet cooperative or server-authoritative. This is a playable two-person presence mode, not a completed shared-world game or federated handoff. Room possession grants access to the vacant role; share the invitation only with the intended friend.
