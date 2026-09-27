# Physical items and credits

Author: Agent Control. Candidate branch; not deployed.

New players have no fishing rod. Find one in the world before using R to fish.
Stand within three metres of a find and press **J**, or tap **Pick up**. G retains
the existing gun control. Open **I / Tab** for the bag, then **Use** or **Drop**.
The bag holds twelve objects. Dropping a rod disables fishing immediately.

Joe's former fish stall is now the **general shop**. Visit him and press E to
sell fish and found objects for credits, or buy a rod, utility knife, wristwatch
or recovered mobile phone. Marta still sells upgrades and fuel using the same
credit balance. Existing solo money and fish are migrated into the new save.

## Useful objects

- Rod: unlocks the existing fishing system.
- Knife: cuts the rope on the beach-path supply crate, once per world, revealing
  35 credits. The lid opens. This is a utility interaction, not a new combat system.
- Watch: reports the current island clock.
- Washed-up phone: reveals a recovered message pointing toward the sea cave.

Objects use original lightweight procedural meshes. The held object and dropped
object share the same geometry. No external model licence is required. Existing
stall asset and font licences remain in force. `tools/props/signs.mjs` regenerates
the general-shop sign atlas using the existing licensed fonts and ImageMagick.

## Trading with another player

Both players stand on foot within five metres. Open the bag, choose an item,
recipient, requested credits and optionally an item to receive in exchange.
**Offer trade** does not transfer anything. The other player opens their bag and
selects **Accept** or **Decline**. Offers expire after one minute. Acceptance checks
ownership, distance, capacity and credits again, then transfers both sides atomically.
Dropping or selling an offered item invalidates the offer. Replaying acceptance
cannot transfer it twice. A zero-credit offer permits gifts or item-for-item barter.

The online room server owns balances, prices, item ownership and offers. Players
cannot submit a new balance or claim another player's item through the protocol.
Two concurrent pickups result in one winner. Joining later receives the room's
current inventory state. Equipped objects are also represented beside remote avatars.

## Persistence and limits

Solo state uses `burning-horizons.items.v1` in browser storage. Online inventory is
room-session state: disconnecting drops your carried objects and clears your
credits; the last participant leaving removes the room. This is not a persistent
account economy. Online state does not overwrite the solo save.

Movement and successful fishing claims are still supplied by the existing game
client. The server checks proximity against recent received movement and bounds
catch claims and rates; this is not a cheat-resistant competitive economy. There
is no real money, payment integration or real-world asset ownership.

## Verification

`node --test test/item-economy.mjs test/item-online.mjs` checks exclusive pickup,
drop, save round trip, credit prices, barter, stale offers, invalid inputs and
real WebSocket clients racing for the same object. Existing game and network
regression suites also pass. Browser review checked empty hands, pickup, inventory
controls and dropping the rod disabling fishing. Physical-phone/mobile-device
qualification and long-running room persistence are not claimed.
