# Two-island world and hidden monorail — concept

The closed door at the end of UNDERNEATH becomes the entrance to Station A. A short descent leads to an underground platform inside the headland. A two-way monorail runs from there through an undersea tunnel to Station B beneath a second island. The same train returns, so the player can always reach the original island and boat.

```
First island / pier ── boat ── sea
          │
     UNDERNEATH cave ── closed door ── Station A
                                        ║
                              glass viewing tunnel
                              fish / reef / whale
                                        ║
                                    Station B ── second island
```

## Player journey

1. Discover the cave by boat, land inside, and reach the existing final door.
2. Open the door to a concealed, James Bond-style station: rock, dark metal, brass details, low blue lighting, and a compact platform.
3. Board a single shuttle. It runs between the two stations and reverses direction at each end; there is no one-way trip.
4. Watch marine life through pressure-window sections of the tunnel during the crossing. Opaque rock and service sections vary the view.
5. Arrive beneath the second island, explore it, and use the station to return.

## World map

The map begins with the first island and its pier. Reaching Station A reveals the second island and draws the undersea transit line. The map distinguishes boat travel on the surface from the station-to-station rail connection. The second island's position and route length are conceptual until its terrain and traversal are built; the diagram is not a measured geographic map.

## Implementation boundaries

- Preserve the existing cave door as the hand-off point; give the station its own geometry and collision zone.
- Stream or load the second island as a separate terrain region. The current 2048 m terrain heightfield covers only the first island.
- Keep the train and both stations paired in save state. Boarding, riding, arrival, and return must survive save/load.
- Give the train a reliable stop and interaction prompt at both platforms. The tunnel windows need a dedicated underwater view and fish/whale placement that remains visible during travel.
- Qualify the full door → train → second island → return route with normal controls before calling the expansion complete.

## Current implementation

The first playable version now has the cave-door lift, Station A and B, a reversible 48-second shuttle, glass pressure tube, placed fish, a procedural second island, a return lift, and a two-island map opened with N. The map is schematic. A Station B expedition log and surface signal mast provide the first mystery objective. The ferry route and outdoor terrain remain separate from the rail route.

The station route, island collision, and visual presentation still require normal-controls qualification. More clues, marine life, effects, and a complete story ending are future work.
