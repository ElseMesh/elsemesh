# Node identity and trust

The proof generates Ed25519 keys with Node's crypto API. `NodeID` is SHA-256 over the DER SPKI public key. `loadOrCreateIdentity` verifies keypair consistency on reload and writes new identity files with owner-only mode where supported. The private key file belongs outside the repository (for example on D: under a local qualification directory). Back it up securely if a node is meant to persist: losing it creates a new node.

The demo uses an explicit public-key trust file. Exchanging that file is an out-of-band trust/bootstrap step, not open discovery. Signed objects carry a public key and are accepted only when its derived NodeID is trusted. A signed manifest additionally requires a trusted publisher; a signed handoff requires the current sector authority. Transport encryption alone never authorises a world edit or manifest.

The reference transport does not yet bind a TCP hello to a fresh challenge. Thus possession of a signed old hello is not sufficient production authentication, and TCP traffic is unencrypted. A production adapter needs an authenticated encrypted transport and a fresh channel binding. Messages carry a per-process session UUID and sequence. UDP messages must match the current TCP peer session; older transient sequences are dropped. Durable replay state is still needed for production.

Do not commit private identity JSON files, auth keys, Tailscale state, ZeroTier tokens, packet captures or machine-specific endpoints. The `test/network-foundation.mjs` identities are ephemeral in memory.
