package main

import (
	"encoding/json"
	"testing"
	"time"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
)

func TestWorldRoleGrantRequiresOwnerSignatureAndKnownScopes(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owner, member := testKey(t), testKey(t)
	ownerID, _ := peerIDForKey(owner.GetPublic())
	fingerprint, err := accountKeyFingerprint(member.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	grant := worldRoleGrant{
		Protocol: worldRoleGrantProtocol, WorldID: "tw-world:role-test", OwnerPeerID: ownerID.String(),
		GrantID: "grant_0123456789ab", Version: 1, AccountKeyFingerprint: fingerprint,
		Scopes:   []string{"world.content.edit", "world.portals.manage"},
		IssuedAt: now.Unix(), ExpiresAt: now.Add(24 * time.Hour).Unix(),
	}
	document, err := signDocument(worldRoleGrantProtocol, grant, owner)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := validateWorldRoleGrant(document, grant.WorldID, ownerID.String(), now); err != nil || got.GrantID != grant.GrantID {
		t.Fatalf("valid owner role grant rejected: grant=%+v err=%v", got, err)
	}
	if _, err := validateWorldRoleGrant(document, grant.WorldID, peerIDForTest(t, member.GetPublic()), now); err == nil {
		t.Fatal("grant signed by a different world owner was accepted")
	}
	grant.Scopes = []string{"world.arbitrary.admin"}
	document, err = signDocument(worldRoleGrantProtocol, grant, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := validateWorldRoleGrant(document, grant.WorldID, ownerID.String(), now); err == nil {
		t.Fatal("unknown role scope was accepted")
	}
}

func TestWorldRoleGrantRejectsUnknownFieldsAndExpiredGrant(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owner := testKey(t)
	ownerID, _ := peerIDForKey(owner.GetPublic())
	base := worldRoleGrant{
		Protocol: worldRoleGrantProtocol, WorldID: "tw-world:role-test", OwnerPeerID: ownerID.String(),
		GrantID: "grant_0123456789ab", Version: 1,
		Scopes: []string{"world.content.edit"}, IssuedAt: now.Add(-time.Hour).Unix(), ExpiresAt: now.Add(time.Hour).Unix(),
	}
	base.AccountKeyFingerprint = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	payload, _ := json.Marshal(base)
	var withUnknown map[string]any
	_ = json.Unmarshal(payload, &withUnknown)
	withUnknown["unexpected"] = true
	document, err := signDocument(worldRoleGrantProtocol, json.RawMessage(mustJSON(t, withUnknown)), owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := validateWorldRoleGrant(document, base.WorldID, ownerID.String(), now); err == nil {
		t.Fatal("unknown payload field was accepted")
	}
	base.IssuedAt = now.Add(-48 * time.Hour).Unix()
	base.ExpiresAt = now.Add(-24 * time.Hour).Unix()
	document, err = signDocument(worldRoleGrantProtocol, base, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := validateWorldRoleGrant(document, base.WorldID, ownerID.String(), now); err == nil {
		t.Fatal("expired role grant was accepted")
	}
}

func TestWorldRoleRevocationsAreFreshAndMatchGrantOrKey(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owner, member := testKey(t), testKey(t)
	ownerID, _ := peerIDForKey(owner.GetPublic())
	fingerprint, err := accountKeyFingerprint(member.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	grant := worldRoleGrant{GrantID: "grant_0123456789ab", AccountKeyFingerprint: fingerprint}
	state := worldRoleRevocations{
		Protocol: worldRoleRevocationsProtocol, WorldID: "tw-world:role-test", OwnerPeerID: ownerID.String(),
		Serial: 1, IssuedAt: now.Unix(), ExpiresAt: now.Add(10 * time.Minute).Unix(),
		AccountKeyFingerprints: []string{fingerprint},
	}
	document, err := signDocument(worldRoleRevocationsProtocol, state, owner)
	if err != nil {
		t.Fatal(err)
	}
	validated, err := validateWorldRoleRevocations(document, state.WorldID, ownerID.String(), 1, now)
	if err != nil {
		t.Fatalf("valid fresh revocation state rejected: %v", err)
	}
	if !roleGrantIsRevoked(grant, validated) {
		t.Fatal("revocation by account-key fingerprint did not revoke the grant")
	}
	if _, err := validateWorldRoleRevocations(document, state.WorldID, ownerID.String(), 1, now.Add(16*time.Minute)); err == nil {
		t.Fatal("stale revocation state was accepted")
	}
	state.AccountKeyFingerprints = nil
	state.GrantIDs = []string{grant.GrantID}
	document, err = signDocument(worldRoleRevocationsProtocol, state, owner)
	if err != nil {
		t.Fatal(err)
	}
	validated, err = validateWorldRoleRevocations(document, state.WorldID, ownerID.String(), 1, now)
	if err != nil || !roleGrantIsRevoked(grant, validated) {
		t.Fatalf("revocation by grant ID failed: state=%+v err=%v", validated, err)
	}
	if _, err := validateWorldRoleRevocations(document, state.WorldID, ownerID.String(), 2, now); err == nil {
		t.Fatal("revocation state below the locally remembered serial was accepted")
	}
}

func peerIDForTest(t *testing.T, key crypto.PubKey) string {
	t.Helper()
	id, err := peerIDForKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return id.String()
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
