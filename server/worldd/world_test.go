package main

import (
	"crypto/rand"
	"testing"
	"time"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
)

func TestWorldManifestOwnerAndScopedHostGrant(t *testing.T) {
	owner, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	ownerID, _ := peer.IDFromPublicKey(owner.GetPublic())
	manifest := newStarterManifest("Island", ownerID.String())
	manifest.WorldID = "tw-world:private-island"
	document, err := signDocument(manifestProtocol, manifest, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeManifest(document, ownerID.String(), time.Now()); err != nil {
		t.Fatalf("owner should serve world: %v", err)
	}

	delegate, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	delegateID, _ := peer.IDFromPublicKey(delegate.GetPublic())
	manifest.Hosts = []hostingGrant{{PeerID: delegateID.String(), Scopes: []string{"content-cache"}, ExpiresAt: time.Now().Add(time.Hour).Unix(), Epoch: 1}}
	if !canServeWorldAssets(manifest, delegateID.String(), time.Now()) {
		t.Fatal("active content-cache grant should allow serving immutable assets")
	}
	document, err = signDocument(manifestProtocol, manifest, owner)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeManifest(document, delegateID.String(), time.Now()); err != nil {
		t.Fatalf("valid cache delegate rejected: %v", err)
	}
	if _, err := decodeManifest(document, "unlisted-peer", time.Now()); err == nil {
		t.Fatal("unlisted host accepted")
	}
	manifest.Hosts[0].ExpiresAt = time.Now().Add(-time.Hour).Unix()
	if err := validateManifest(manifest, delegateID.String(), time.Now()); err == nil {
		t.Fatal("expired host grant accepted")
	}
	if canServeWorldAssets(manifest, delegateID.String(), time.Now()) {
		t.Fatal("expired content-cache grant still allowed asset serving")
	}
	manifest.Hosts[0] = hostingGrant{PeerID: delegateID.String(), Scopes: []string{"failover-authority"}, Epoch: 1, FailoverAfter: time.Now().Add(-time.Minute).Unix(), FailoverSeconds: 30, ExpiresAt: time.Now().Add(time.Hour).Unix()}
	if canServeWorldAssets(manifest, delegateID.String(), time.Now()) {
		t.Fatal("failover-authority scope implicitly granted content caching")
	}
	if !canServeWorldAssets(manifest, ownerID.String(), time.Now()) {
		t.Fatal("world owner should always be able to serve its own assets")
	}
}

func TestWorldManifestRejectsUnsafeAssetAndPortalData(t *testing.T) {
	manifest := newStarterManifest("Island", "owner")
	manifest.WorldID = "tw-world:invalid-case"
	manifest.Rules.Gravity = 99
	if err := validateManifest(manifest, "owner", time.Now()); err == nil {
		t.Fatal("unsafe gravity accepted")
	}
	manifest = newStarterManifest("Island", "owner")
	manifest.WorldID = "tw-world:invalid-case"
	manifest.Assets = []assetRef{{ID: "sha256:bad", Bytes: 10, Kind: "glb", Priority: "visible"}}
	if err := validateManifest(manifest, "owner", time.Now()); err == nil {
		t.Fatal("invalid asset identifier accepted")
	}
}

func TestTemporaryFailoverAuthorityRequiresOwnerWindow(t *testing.T) {
	owner, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	ownerID, _ := peer.IDFromPublicKey(owner.GetPublic())
	delegate, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	delegateID, _ := peer.IDFromPublicKey(delegate.GetPublic())
	start := time.Now().Add(time.Minute).Unix()
	manifest := newStarterManifest("Island", ownerID.String())
	manifest.WorldID = "tw-world:failover"
	manifest.Hosts = []hostingGrant{{PeerID: delegateID.String(), Scopes: []string{"content-cache", "failover-authority"}, Epoch: 4, FailoverAfter: start, FailoverSeconds: 120, ExpiresAt: start + 300}}
	if _, err := activateFailover(manifest, delegateID.String(), delegate, time.Unix(start-1, 0)); err == nil {
		t.Fatal("failover started before owner-granted window")
	}
	document, err := activateFailover(manifest, delegateID.String(), delegate, time.Unix(start+1, 0))
	if err != nil {
		t.Fatalf("valid failover grant rejected: %v", err)
	}
	lease, err := validateAuthorityLease(document, manifest, time.Unix(start+1, 0))
	if err != nil {
		t.Fatalf("valid authority lease rejected: %v", err)
	}
	if lease.AuthorityPeerID != delegateID.String() || lease.Epoch != manifest.AuthorityEpoch+1 || lease.ExpiresAt != start+120 {
		t.Fatalf("unexpected bounded authority lease: %+v", lease)
	}
	if _, err := validateAuthorityLease(document, manifest, time.Unix(start+120, 0)); err == nil {
		t.Fatal("expired authority lease accepted")
	}
}
