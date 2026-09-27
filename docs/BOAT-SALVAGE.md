# Boat salvage authority

Boat salvage is owned by `ItemEconomy` through the pure `SalvageAuthority`; clients submit intents and never submit hook coordinates, target item IDs, ownership, balances, or time deltas. The same authority is used by solo play and online rooms. This foundation intentionally contains no salvage UI or camera.

## Snapshot and commands

`ItemEconomy.packet().salvage` exposes the current operator, depth, boat-local `offsetX`/`offsetZ`, held item ID, retrieval state, world hook position, validated boat position/quaternion/velocity, error, and sonar contacts. Commands use economy action `salvage` with `claim`, `control`, `grab`, `release`, `retrieve`, or `stop`. Control axes `x`, `z`, and `depth` must each be finite numbers in `[-1, 1]`.

The winch begins stowed at depth `-2.4`, uses a boat-local origin of `(2.8, 2.4, -2)`, permits four metres of lateral offset, descends no deeper than 50 metres, and advances only from authority-clock elapsed time. Vertical speed is capped at 2 m/s and lateral speed at 1 m/s. Controls stop after 600 ms without a fresh control intent, and tick catch-up is capped.

## Safety and ownership

A single operator may claim the winch. Claiming and operating require a fresh validated boat pose, a fresh player pose in boat/deck mode within 10 metres, and boat speed no greater than 0.6 m/s. Only validated Loz host boat state is accepted online. Stale or moving boat/player state releases the operator and drops held salvage at the current hook point. Disconnect and `stop` use the same release semantics; closing the future UI should send `stop`.

`grab` selects the nearest unowned physical item within 0.8 metres of the hook, provided its depth is greater than zero and no more than 50 metres. A held item remains unowned and reserved, follows the hook, and cannot be picked up or sold. Ownership transfers exactly once, only when retrieval reaches the stowed position and the operator has room in the 12-item bag. If the bag becomes full, the item remains held at deck level with a clear error until space is available or it is released.

Sonar reports unowned, unheld physical objects with known depth, at depth `(0, 50]` and within the requested horizontal radius. Normal pickup checks three-dimensional proximity for items with a finite `y`, preventing shore pickup of submerged objects.

## Persistence and fixed sites

Transient winch state is not loaded from saves. Existing version-1 inventory and ownership remain intact, while missing fixed salvage spawn IDs are merged once. Five measured seabed sites provide watches, phones, and a knife, including deep contacts near 35 and 48 metres.
