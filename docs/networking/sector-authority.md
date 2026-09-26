# Sector authority

Initial sector names can include `bh:SEA-01`, `bh:SEA-02`, `bh:ISLAND-01`, `bh:UNDERNEATH-01`, and `bh:UNDERNEATH-02`. Authority records map a sector to `{ nodeId, epoch }`; the IP route is never part of the authority record.

`createHandoff` signs player/world/source/target identifiers, position, velocity, player and inventory hashes, sequence, epoch, timestamp and a UUID. `acceptHandoff` validates the signature, trusted NodeID, current source authority, matching epoch, 30-second freshness window and replay UUID. The proof acknowledges a handoff but does **not** atomically transfer world authority or persist player state. A later implementation must define commit/abort, target readiness, timeout recovery, duplicate delivery semantics and authoritative state snapshot validation.

Tests cover tampering, unknown signer, stale epoch, expiry and replay. A signed handoff cannot grant itself authority over a sector whose authority registry names another node.
