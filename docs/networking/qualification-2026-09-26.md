# Networking qualification — 26 September 2026

## Scope and evidence

MSI Windows and hpubuntu Linux were distinct physical computers. Test identities were generated on each host and private keys were kept outside the repository. This record contains public NodeIDs and measurements only. `tools/networking/peer-demo.mjs` and `tools/networking/federation-probe.mjs` reproduce the application-layer checks with a trusted two-node configuration. The reference TCP/UDP transport is unencrypted and was used only on a controlled private route.

| Check | Result | Limit |
|---|---|---|
| Signed application NodeID exchange over LAN | PASS | Explicit peer route, no discovery/NAT traversal |
| Reliable ping and transient datagram acknowledgement | PASS | Tiny synthetic payloads |
| Content-addressed asset, corrupt asset rejection and signed manifest | PASS | Bounded sample asset |
| Signed sector handoff, restart/reconnect | PASS | Protocol state, not rendered player movement |
| Native libp2p/QUIC connection and stream ping | PASS | Direct LAN only; no AutoNAT/DCUtR/relay |
| GameNetworkingSockets Linux build and connection | PARTIAL | Windows peer and application payload round trip not qualified |
| Tailscale path | PASS | Tailscale reported a direct LAN route, so this is not a NAT/relay proof |
| Signed Ed World manifest and portal handoff/return on MSI↔hpubuntu | PASS | Protocol only; no visual avatar crossing |
| Two fully rendered game clients with human Loz and AI Ed on separate hosts | FAIL | hpubuntu virtual display WebGPU pipeline failed; prior browser state was not a validated video |

MSI application NodeID: `bh-node:4fcfcf29b9e0289ba18c72e1ca8df0e1400bdfabe22bec5c36778ed678d68d15`.

hpubuntu application NodeID: `bh-node:b4cc06b4a435d153ced1ef49992bb75e9772b6fb2f143f099ba162483eb1d314`.

The first LAN reference probe established in 36 ms and had median RTT 2.017 ms over eight pings. After restarting the peer, establishment took 21 ms and median RTT was 1.312 ms. The native libp2p/QUIC probe established in 15.674 ms, with observed stream RTT samples around 0.9–1.5 ms. These are point observations, not statistical performance claims or a transport winner.

The physical federation probe used `bh-portal:ed-door`, from `bh-region:underneath` (Loz authority) to `bh-region:ed-world` (Ed authority). Loz's node verified Ed's signed `bh.region/1` descriptor. Ed's node verified the signed `bh.handoff/1` payload, negotiated destination rules, issued a signed admission, and sent `bh-portal:ed-return` back. The probe's structured result recorded `scope: protocol-only-no-rendered-avatar`; no game client crossed a cave boundary. Running game authority migration, collision/physics rule application and a live round-trip remain to be implemented and tested.

The local split-screen browser demo uses two browser contexts on one computer and is labelled **LOCAL TWO-NODE DEMO**. It must not be presented as this physical qualification. The hpubuntu renderer failed on its virtual WebGPU path during attempted full-game capture, so there is no qualified physical Ed/Loz gameplay video from this run.
