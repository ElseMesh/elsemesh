# Boat sonar and salvage winch

Maintained by Agent Control.

## Controls

While aboard the boat or standing on its deck, press **O** or use the visible **Sonar** button to open the combined sonar and grabber panel. Sonar remains available while sailing and derives contacts within the **80 m range** and **50 m maximum depth** directly from current physical-item data and the boat's current position. Selecting a contact only highlights navigation guidance; collection remains manual and it does not move the winch or an item.

Stop the boat before claiming winch control. The panel reports another operator as busy and requires a new claim after the panel is closed, minimized, blurred, or hidden. Hold **Lower**, **Raise**, **Port**, **Starboard**, **Forward**, or **Aft** to move the grabber. Releasing a held control immediately zeros the corresponding axes. **Grab** closes on a nearby eligible item, **Release** releases the held item without surrendering the operator, **Retrieve** starts the automatic hoist, and **Stop**/closing the panel releases winch control.

The authority snapshot is the source of winch depth, offset, held item, returning state, and operator. Controls are sent through `items.act('salvage', ...)`; the UI never mutates inventory or authority state directly. Axis traffic is limited to five updates per second, and successful movement/claim notifications are quiet while errors and meaningful results remain visible.

## Physical equipment

The rear deck carries a sonar console, pedestal winch, drum, and an outboard boom. A world-space cable joins the boom tip to the authoritative hook position. The yellow steel grabber has three articulated jaws, a camera housing, and cyan lamps; its jaws close while holding an item. During an active winch session, the network authority snapshot drives the grabber. When idle or stowed, its position follows the current physics boat transform so stale broadcast coordinates do not leave it behind.

## Grabber camera

The panel canvas is a real secondary WebGPU view of the existing scene. It uses its own perspective camera, view-uniform block, and depth texture, while sharing the existing renderer and frame command encoder. It renders immediately before the application's single GPU submission and never starts or submits a separate frame.

To limit GPU cost, the 512 × 288 grabber view updates at a maximum of **10 Hz** and draws only while the panel is open and not minimized. Unsupported WebGPU canvas setup is reported in the panel without stopping the game. The downward-mounted view is intended to show terrain, physical salvage, and the grabber edges; browser/device visual qualification remains a separate manual check.
