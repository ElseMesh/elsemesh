package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
)

func TestDirectoryAnnounceRequiresNodeSignatureAndWorldGrant(t *testing.T) {
	owner, ownerID := testIdentity(t)
	node, nodeID := testIdentity(t)
	now := time.Now()
	manifestPayload := map[string]any{
		"protocol": manifestProtocol, "worldId": "tw-world:coast", "ownerPeerId": ownerID,
		"authorityPeerId": ownerID, "authorityEpoch": 1, "discoverable": true,
		"version": 1, "title": "Coast", "rules": map[string]any{"gravity": 1, "avatarComplexity": 1000, "physicsProfile": "tidewater-default"},
		"assets": []any{}, "objects": []any{}, "portals": []any{},
		"hosts": []any{map[string]any{"peerId": nodeID, "scopes": []string{"content-cache"}, "expiresAt": now.Add(time.Hour).Unix()}},
	}
	manifest := testSignedDocument(t, manifestProtocol, manifestPayload, owner)
	nodeRecord := testSignedDocument(t, nodeProtocol, map[string]any{
		"protocol": nodeProtocol, "nodeId": nodeID, "gateway": "https://node.example",
		"worldIds": []string{"tw-world:coast"}, "issuedAt": now.Unix(), "expiresAt": now.Add(24 * time.Hour).Unix(),
	}, node)
	store := &directory{path: filepath.Join(t.TempDir(), "providers.json"), entries: make(map[string]provider)}
	body, err := json.Marshal(announcement{Node: nodeRecord, Manifest: manifest})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/announce", bytes.NewReader(body))
	response := httptest.NewRecorder()
	store.handleAnnounce(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatalf("valid owner-authorized cache announcement rejected: %d %s", response.Code, response.Body.String())
	}
	if _, err := os.Stat(store.path); err != nil {
		t.Fatalf("announcement was not persisted: %v", err)
	}
	if entry := store.entries[nodeID]; entry.ExpiresAt != now.Add(time.Hour).Unix() {
		t.Fatalf("directory registration must expire with the owner cache grant, got %d", entry.ExpiresAt)
	}

	loaded := &directory{path: store.path, entries: make(map[string]provider)}
	if err := loaded.load(); err != nil {
		t.Fatal(err)
	}
	lookup := httptest.NewRecorder()
	loaded.handleWorld(lookup, httptest.NewRequest(http.MethodGet, "/v1/worlds/tw-world:coast", nil))
	var result struct {
		WorldID   string           `json:"worldId"`
		Providers []signedDocument `json:"providers"`
	}
	if err := json.Unmarshal(lookup.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if lookup.Code != http.StatusOK || result.WorldID != "tw-world:coast" || len(result.Providers) != 1 || result.Providers[0].Signer != nodeID {
		t.Fatalf("lookup did not return the verified provider: status=%d result=%+v", lookup.Code, result)
	}

	bad := nodeRecord
	bad.Signature = base64.RawStdEncoding.EncodeToString([]byte("forged"))
	entry, _, err := validateAnnouncement(announcement{Node: bad, Manifest: manifest}, now)
	if err == nil || entry.Node.Signer != "" {
		t.Fatal("forged node announcement accepted")
	}
}

func TestDirectoryAnnounceAcceptsActiveFailoverAuthorityWithoutCacheRights(t *testing.T) {
	owner, ownerID := testIdentity(t)
	delegate, delegateID := testIdentity(t)
	now := time.Now()
	failoverAfter := now.Add(-time.Minute).Unix()
	grantExpires := now.Add(time.Hour).Unix()
	leaseExpires := now.Add(28 * time.Minute).Unix()
	manifest := testSignedDocument(t, manifestProtocol, map[string]any{
		"protocol": manifestProtocol, "worldId": "tw-world:failover", "ownerPeerId": ownerID,
		"authorityPeerId": ownerID, "authorityEpoch": 7, "discoverable": true,
		"hosts": []any{map[string]any{"peerId": delegateID, "scopes": []string{"failover-authority"}, "expiresAt": grantExpires, "epoch": 3, "failoverAfter": failoverAfter, "failoverSeconds": 1800}},
	}, owner)
	node := testSignedDocument(t, nodeProtocol, map[string]any{
		"protocol": nodeProtocol, "nodeId": delegateID, "gateway": "https://delegate.example",
		"worldIds": []string{"tw-world:failover"}, "issuedAt": now.Unix(), "expiresAt": now.Add(24 * time.Hour).Unix(),
	}, delegate)
	lease := testSignedDocument(t, authorityProtocol, map[string]any{
		"worldId": "tw-world:failover", "authorityPeerId": delegateID, "epoch": 8, "grantEpoch": 3,
		"notBefore": failoverAfter, "expiresAt": leaseExpires,
	}, delegate)
	entry, _, err := validateAnnouncement(announcement{Node: node, Manifest: manifest, AuthorityLease: &lease}, now)
	if err != nil {
		t.Fatalf("valid failover-only provider rejected: %v", err)
	}
	if entry.ExpiresAt != min(now.Add(24*time.Hour).Unix(), leaseExpires) {
		t.Fatalf("failover provider expiry = %d; want lease expiry %d", entry.ExpiresAt, leaseExpires)
	}
	store := &directory{path: filepath.Join(t.TempDir(), "providers.json"), entries: make(map[string]provider)}
	body, err := json.Marshal(announcement{Node: node, Manifest: manifest, AuthorityLease: &lease})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	store.handleAnnounce(response, httptest.NewRequest(http.MethodPost, "/v1/announce", bytes.NewReader(body)))
	if response.Code != http.StatusAccepted {
		t.Fatalf("directory rejected active failover-only provider: %d %s", response.Code, response.Body.String())
	}
	lookup := httptest.NewRecorder()
	store.handleWorld(lookup, httptest.NewRequest(http.MethodGet, "/v1/worlds/tw-world:failover", nil))
	var result struct {
		Providers []signedDocument `json:"providers"`
	}
	if err := json.Unmarshal(lookup.Body.Bytes(), &result); err != nil || len(result.Providers) != 1 || result.Providers[0].Signer != delegateID {
		t.Fatalf("directory lookup omitted failover-only provider: %+v, %v", result, err)
	}
	badLease := testSignedDocument(t, authorityProtocol, map[string]any{
		"worldId": "tw-world:failover", "authorityPeerId": delegateID, "epoch": 9, "grantEpoch": 3,
		"notBefore": failoverAfter, "expiresAt": leaseExpires,
	}, delegate)
	if _, _, err := validateAnnouncement(announcement{Node: node, Manifest: manifest, AuthorityLease: &badLease}, now); err == nil {
		t.Fatal("lease that skips the next authority epoch was accepted")
	}
	if _, _, err := validateAnnouncement(announcement{Node: node, Manifest: manifest}, now); err == nil {
		t.Fatal("failover-only provider without a signed active lease was accepted")
	}
}

func TestDirectoryRejectsUntrustedWorldClaims(t *testing.T) {
	owner, ownerID := testIdentity(t)
	node, nodeID := testIdentity(t)
	now := time.Now()
	manifest := testSignedDocument(t, manifestProtocol, map[string]any{
		"protocol": manifestProtocol, "worldId": "tw-world:private", "ownerPeerId": ownerID,
		"discoverable": true, "hosts": []any{},
	}, owner)
	nodeRecord := testSignedDocument(t, nodeProtocol, map[string]any{
		"protocol": nodeProtocol, "nodeId": nodeID, "gateway": "https://node.example", "worldIds": []string{"tw-world:private"},
		"issuedAt": now.Unix(), "expiresAt": now.Add(time.Hour).Unix(),
	}, node)
	if _, _, err := validateAnnouncement(announcement{Node: nodeRecord, Manifest: manifest}, now); err == nil {
		t.Fatal("node without an owner content-cache grant was allowed to list a world")
	}
	manifestPayload := map[string]any{"protocol": manifestProtocol, "worldId": "tw-world:private", "ownerPeerId": ownerID, "discoverable": false}
	privateManifest := testSignedDocument(t, manifestProtocol, manifestPayload, owner)
	nodeRecord = testSignedDocument(t, nodeProtocol, map[string]any{
		"protocol": nodeProtocol, "nodeId": ownerID, "gateway": "https://node.example", "worldIds": []string{"tw-world:private"},
		"issuedAt": now.Unix(), "expiresAt": now.Add(time.Hour).Unix(),
	}, owner)
	if _, _, err := validateAnnouncement(announcement{Node: nodeRecord, Manifest: privateManifest}, now); err == nil {
		t.Fatal("private world was exposed through the public directory")
	}
}

func testIdentity(t *testing.T) (crypto.PrivKey, string) {
	t.Helper()
	key, _, err := crypto.GenerateEd25519Key(nil)
	if err != nil {
		t.Fatal(err)
	}
	id, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	return key, id.String()
}

func testSignedDocument(t *testing.T, protocol string, payload any, key crypto.PrivKey) signedDocument {
	t.Helper()
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	publicKey, err := crypto.MarshalPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	id, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	u := unsignedDocument{Protocol: protocol, Signer: id.String(), PublicKey: base64.RawStdEncoding.EncodeToString(publicKey), Payload: payloadBytes}
	canonical, err := canonicalJSON(u)
	if err != nil {
		t.Fatal(err)
	}
	signature, err := key.Sign(canonical)
	if err != nil {
		t.Fatal(err)
	}
	return signedDocument{Protocol: protocol, Signer: u.Signer, PublicKey: u.PublicKey, Payload: payloadBytes, Signature: base64.RawStdEncoding.EncodeToString(signature)}
}
