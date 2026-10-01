# Optional account and world roles

This document specifies the account boundary for ElseMesh. `server/accountd` implements opt-in Google ID-token verification, nonce-bound Ed25519 proof of possession, exact-origin CORS, short-lived in-memory sessions, and a private account-key mapping file. The browser includes an opt-in sign-in and account-key UI; owner role grants are validated but are not yet consumed to authorize world actions.

## Trust boundaries

- Worlds, nodes, and owners keep their existing cryptographic identities. Google is never a source of world ownership, node identity, manifest authority, or host grants.
- A world remains readable and playable as a guest when its visitor is signed out, offline, or unable to contact the account service. Accounts add optional per-world roles; they do not become a global login gate.
- Google proves control of a Google account to an optional account broker. It does not issue world roles. Only the key that owns a ThruHold can issue or revoke that world's role grants.
- Role grants target an account public key, not an email address or raw Google subject. A browser creates the key and proves possession. The broker privately maps the verified Google `sub` to that key so the same account can recover its account association on another device.
- Account and role endpoints are separate from `worldd`'s public manifest, asset, and lookup endpoints and from `directoryd`. CORS is never authorization. Account endpoints require explicit allowed origins and do not accept credentialed wildcard CORS.

## Sign-in and consent

The optional browser UI appears only when both `accountd` and `googleClientId` are set in `public/elsemesh-config.js`. The client loads Google Identity Services only after the user selects **Sign in with Google**. It obtains a fresh broker challenge, supplies its nonce to GIS, and sends the returned ID token only over HTTPS to the configured account broker. The broker verifies the token signature using Google's rotating public keys and checks issuer, audience, expiration, issued-at time, and the one-time nonce bound to the login attempt. Unknown signing keys trigger a bounded key refresh; token fields are not trusted before verification. The stable Google `sub` is the account key. Email, display name, and profile image are not account identifiers and are not stored unless a later feature asks for each item with separate consent. See Google's [GIS JavaScript API reference](https://developers.google.com/identity/gsi/web/reference/js-reference) for the nonce option and [ID-token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) for the server trust boundary.

The Google client ID and allowed web origins are explicit deployment configuration. Leave both values blank in `public/elsemesh-config.js` to hide the sign-in UI; world hosting, invites, guest viewing, and portal travel continue normally. Configure the Google OAuth web client for the exact game-site origin and configure `accountd` to allow that exact HTTPS origin. The account broker URL must itself use HTTPS. ID tokens are short-lived credentials: never place them in a URL, log them, or persist them in local storage. The client holds the credential in memory only long enough to complete the broker exchange. Account-broker session tokens are short-lived bearer tokens kept in memory and sent without cookies.

`accountd` is not part of the browser build and is not started by `worldd`. Run it only when account sign-in is wanted. Configure `ELSEMESH_GOOGLE_CLIENT_ID` and `ELSEMESH_ACCOUNT_ALLOWED_ORIGINS`, or pass `--google-client-id` and `--allowed-origins`. The origin list must contain exact canonical HTTPS origins, without paths or wildcards. The listener accepts only loopback addresses so the browser-facing endpoint must pass through a local HTTPS reverse proxy. The server verifies Google ID tokens with Google's maintained Go verifier, then separately checks the accepted Google issuer, issue time, and the challenge nonce. It ignores email and derives a private account lookup ID from Google `sub`; the on-disk `accounts.json` contains only that opaque ID and public-key fingerprints, with mode `0600`. Sign-in challenges expire after five minutes and are single-use. Bearer sessions expire after 15 minutes, exist only in process memory, and are invalidated by logout, key unlink, account deletion, or process restart. The routes are `GET /api/challenge`, `POST /api/session`, `GET /api/me`, `DELETE /api/me/key`, `POST /api/logout`, and `DELETE /api/account`. The browser key signs the UTF-8 message `elsemesh.account-proof/1\n<challengeId>\n<nonce>\n<origin>`; send the signature and Google ID token only over HTTPS.

## Account key and role grants

Each account device generates an Ed25519 signing key locally and sends only its public key to the broker after proving possession. The browser persists the non-extractable private `CryptoKey` in IndexedDB. The public key is exportable for the broker's proof-of-possession exchange. This follows the Ed25519 key-generation rules in the [Web Cryptography specification](https://www.w3.org/TR/WebCryptoAPI/#ed25519-operations). Browser profile access, device compromise, or clearing site data can expose or destroy locally held credentials. The private key never goes to Google, the broker, or a world node. The account panel can sign out, unlink the current browser key, or delete the account association; unlink and delete require confirmation. A later multi-device recovery flow may add a device after the user proves the same Google account and approves the new public key. Account recovery does not recover a world-owner key.

The first role-grant format accepts Ed25519 account keys. The public fingerprint is `sha256:` followed by lowercase hex SHA-256 of the raw 32-byte Ed25519 public key. Signed role payloads use canonical JSON and reject unknown fields. Initial supported scopes are `world.content.edit`, `world.portals.manage`, and `world.roles.manage`; a client or daemon must reject any other scope until a protocol version defines it.

The owner issues a versioned, owner-signed `tidewater.world-role/1` grant that binds:

- the world ID and owner PeerID;
- a random grant ID and monotonically increasing grant version;
- the account public-key fingerprint;
- a bounded set of role IDs/scopes;
- issue and expiry times.

Role grants cannot change the manifest, alter host grants, or grant ownership. `visitor` and read-only access require no role grant. `builder` and other future roles authorize only explicit actions defined by a versioned world capability; clients and nodes reject unknown scopes. The grant is not authority for concurrent simulation writes.

The owner publishes signed revocation state with a monotonically increasing serial and an expiry. Nodes persist the highest accepted serial and reject state below it, revoked grants, and grants past expiry. The validator requires revocation state to be fresh for at most 15 minutes; role-gated actions fail closed if it expires. Guest reads do not depend on role-state availability. A new owner key must explicitly transfer world ownership and reissue or revoke roles; a Google account cannot transfer a world.

## Revocation, deletion, and recovery

- A user can unlink a Google account from an account key; the broker removes the mapping and active broker sessions.
- A world owner can revoke a role grant by grant ID or account-key fingerprint, publish fresh signed revocation state, and issue a replacement grant if appropriate.
- Revocation prevents new role-gated actions when the node receives the fresh signed state. It cannot retract data already downloaded or guarantee immediate revocation on an offline node; grants therefore expire and sensitive actions require fresh state.
- Account deletion removes the broker's Google-sub mapping and account metadata. It does not delete worlds, node identities, signed public history, or owner keys.
- World-owner recovery uses the existing offline owner-key backup and signed ownership-transfer process. Google recovery can restore an account-to-device association only; it cannot restore or replace a lost owner key.

## Implementation sequence

1. Implement and test the owner-signed role-grant and revocation document formats, with bounded fields, exact-world binding, key fingerprints, and safe-integer timestamps. This validation foundation is present in `server/worldd/roles.go`; no role-gated actions consume it yet.
2. Implement the optional browser integration for the `accountd` broker. Server-side Google ID-token verification, nonce replay prevention, key proof-of-possession, private account-key mapping, short-lived sessions, exact-origin CORS, unlink, and deletion are implemented. The client UI and local key storage are also implemented; a production OAuth client ID and domain deployment remain operator configuration.
3. Add node-side verification of owner grants/revocations before any role-gated action. Keep asset reads and guest travel available without login.
4. Deploy no Google client ID or account broker by default. Each operator opts in and configures their own Google OAuth web client.

Until an operator configures an account broker and OAuth web client, Google sign-in is unavailable. World-role authorization is unavailable until nodes enforce owner grants and fresh revocation state.
