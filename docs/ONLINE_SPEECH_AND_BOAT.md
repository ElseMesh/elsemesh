# Online two-player speech and shared boat

In a private online room, each player appears on the other's radar (`L` for Loz,
`E` for Ed). Press **T** to open the talk field, type a line, then press **Enter**.
**Esc** cancels. Movement and camera controls pause while the field is open.
Accepted lines appear as an on-screen subtitle and, when the other avatar is in
view, a bubble over that avatar. Each player clicks **Enable friend voice** once
to permit browser audio. Speech is positioned at the speaking avatar using Web
Audio. If synthesis is unavailable, the text remains visible and is marked
`text only`.

The host (Loz) owns the boat simulation and helm. The guest receives its pose
as part of the host's validated player state, can board and walk on deck, and
cannot take the helm. Both avatars use boat-local positions while aboard. This
is host authority, not a general vehicle ownership or handoff protocol. If the
host disconnects, boat state stops updating until the room reconnects.

The speech server relays structured `bh.character-speech/1` events only within
the room. It checks role, node identity, message size, freshness, duplicates and
rate. The optional server-side `BH_SPEECH_CONFIG` points to a **private** JSON
file with `endpoint`, `profilePath`, and `tokenPath`. The endpoint must be
loopback `http://127.0.0.1:<port>/`. The profile must be an accepted `loz`
OmniVoice profile with a matching representation hash. No profile, recording,
representation, token, or generated audio is committed to this repository.
Ed's voice currently falls back to text because no accepted Ed profile is
configured. The game adapter calls the existing authenticated Voice Lab worker
contract; it does not include or start the model itself.

Run `npm test`, `npm run test:network`, and `npm run build`. The network tests
cover role-bound speech, two-client relay, duplicate suppression, mock WAV
delivery, and boat state authority. Browser speech playback and an actual
Loz-to-Ed listening session still require separate physical qualification.
