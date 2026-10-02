# Game windows

Settings, Controls & Help, Inventory, Shop, and Network Status use shared nonblocking window chrome. Each window has an accessible title, Minimize button, and Close button. Click or tap a window to bring it forward; drag only the empty title-bar background to move it. Dragging supports mouse and touch and keeps the title bar clamped within the viewport. Window bodies scroll on small screens.

Minimized windows remain available in the small tray at the lower-left. Existing controls and hotkeys reopen Settings, Help, and Inventory after closing. Network Status also has a persistent Network launcher. A shop can only be opened through the existing nearby-vendor interaction; restoring or closing its presentation does not perform trades or bypass item/credit authority. Content refreshes occur inside persistent chrome, so inventory, shop, and network updates do not erase controls or reset window placement.

Escape closes only the topmost eligible game window. Form controls retain keyboard interaction, and interacting with window chrome releases pointer lock so game input does not leak through. Settings leaves the main UI rail usable.

Native avatar customization and onboarding remain modal exceptions rather than draggable windows. Their existing Cancel or Skip controls own dismissal, and an open native dialog prevents the window manager from consuming Escape. Start/loading overlays and transient speech bubbles are also intentionally unchanged.

Known limits: positions last only for the current page session, windows are not resizable, and very small viewports rely on body scrolling rather than shrinking interactive content. Browser interaction acceptance (dragging, clamping, refresh behavior, touch, resize, and reopen flows) is verified separately from the build checks.
