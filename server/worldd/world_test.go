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
	manifest.Hosts[0].Epoch = maxSafeJSInteger + 1
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("host grant epoch outside browser-safe integer range accepted")
	}
	manifest.Hosts[0].Epoch = 1
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

func TestWorldManifestValidatesRequiredFeatureIdentifiers(t *testing.T) {
	owner, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	ownerID, _ := peer.IDFromPublicKey(owner.GetPublic())
	manifest := newStarterManifest("Feature rules", ownerID.String())
	manifest.WorldID = "tw-world:feature-rules"
	manifest.Rules.RequiredFeatures = []string{"tidewater.portal-handoff/1", "tidewater.portal-preview-static/1"}
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err != nil {
		t.Fatalf("valid required features rejected: %v", err)
	}
	manifest.Rules.RequiredFeatures = []string{"tidewater.portal-handoff/1", "tidewater.portal-handoff/1"}
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("duplicate required feature accepted")
	}
	manifest.Rules.RequiredFeatures = []string{"not-a-feature-id"}
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("malformed required feature accepted")
	}
	manifest.Rules.RequiredFeatures = nil
	manifest.Rules.PhysicsProfile = "custom-physics"
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("unsupported physics profile accepted")
	}
}

func TestWorldManifestValidatesEnabledObjectCollisionBounds(t *testing.T) {
	key, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	ownerID, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	manifest := newStarterManifest("Collision", ownerID.String())
	manifest.WorldID = "tw-world:collision"
	assetID := "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	manifest.Assets = []assetRef{{ID: assetID, Bytes: 1, Kind: "glb", Priority: "visible"}}
	object := worldObject{ID: "tw-object:platform", Kind: "asset-instance", Label: "Platform", AssetID: assetID, Transform: transform{Position: vector3{0, 0, 0}}, Scale: vector3{1, 1, 1}}
	object.Collision.Shape = "box"
	object.Collision.Enabled = true
	object.Collision.HalfExtents = vector3{1, 2, 3}
	manifest.Objects = []worldObject{object}
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err != nil {
		t.Fatalf("valid collision bounds rejected: %v", err)
	}
	manifest.Objects[0].Collision.HalfExtents[1] = 0
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("zero collision extent accepted")
	}
	manifest.Objects[0].Collision.HalfExtents = vector3{1, 2, 3}
	manifest.Objects[0].Collision.Shape = "none"
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("enabled collision with no shape accepted")
	}
	manifest.Objects[0].Collision.Shape = "heightfield"
	manifest.Objects[0].Collision.Columns = 513
	manifest.Objects[0].Collision.Rows = 513
	manifest.Objects[0].Collision.Walkable = true
	manifest.Objects[0].Collision.Solid = true
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err != nil {
		t.Fatalf("valid heightfield collision rejected: %v", err)
	}
	manifest.Objects[0].Collision.Columns = 4097
	manifest.Objects[0].Collision.Rows = 4097
	if err := validateManifest(manifest, ownerID.String(), time.Now()); err == nil {
		t.Fatal("oversized heightfield collision accepted")
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
	if lease.AuthorityPeerID != delegateID.String() || lease.Epoch != manifest.AuthorityEpoch+1 || lease.GrantEpoch != manifest.Hosts[0].Epoch || lease.ExpiresAt != start+120 {
		t.Fatalf("unexpected bounded authority lease: %+v", lease)
	}
	manifest.Hosts[0].Epoch++
	if _, err := validateAuthorityLease(document, manifest, time.Unix(start+1, 0)); err == nil {
		t.Fatal("authority lease from a superseded owner grant was accepted")
	}
	manifest.Hosts[0].Epoch--
	if _, err := validateAuthorityLease(document, manifest, time.Unix(start+120, 0)); err == nil {
		t.Fatal("expired authority lease accepted")
	}
	if delay := failoverCheckDelay(manifest, delegateID.String(), nil, time.Unix(start-30, 0)); delay != 30*time.Second {
		t.Fatalf("daemon should wake at the owner-granted activation time, got %v", delay)
	}
	if delay := failoverCheckDelay(manifest, delegateID.String(), &document, time.Unix(start+30, 0)); delay != 90*time.Second {
		t.Fatalf("daemon should wake to expire its bounded lease, got %v", delay)
	}
}

func TestLookupIncludesAuthorizedCacheProviders(t *testing.T) {
	localKey, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cacheKey, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	local, _ := peer.IDFromPublicKey(localKey.GetPublic())
	cache, _ := peer.IDFromPublicKey(cacheKey.GetPublic())
	providers := collectProviders(local, true, []peer.AddrInfo{{ID: local}, {ID: cache}, {ID: cache}}, 16)
	if len(providers) != 2 || providers[0] != local.String() || providers[1] != cache.String() {
		t.Fatalf("lookup should return the local owner and unique cache peers, got %v", providers)
	}
	providers = collectProviders(local, false, []peer.AddrInfo{{ID: local}, {ID: cache}}, 16)
	if len(providers) != 1 || providers[0] != cache.String() {
		t.Fatalf("lookup should omit a node that cannot serve and retain cache peers, got %v", providers)
	}
}

func TestPortalGatewayRequiresSecureOrigin(t *testing.T) {
	for _, gateway := range []string{"https://world.example", "wss://world.example:8443/"} {
		if !validPortalGateway(gateway) {
			t.Errorf("secure portal gateway rejected: %s", gateway)
		}
	}
	for _, gateway := range []string{"http://world.example", "wss://user:pass@world.example", "https://world.example/path", "https://world.example?token=x"} {
		if validPortalGateway(gateway) {
			t.Errorf("unsafe or ambiguous portal gateway accepted: %s", gateway)
		}
	}
}

func TestDirectoryURLMustBeSecureOrigin(t *testing.T) {
	for _, directory := range []string{"https://thruhold.org", "https://directory.example/"} {
		if !validDirectoryURL(directory) {
			t.Errorf("valid directory origin rejected: %s", directory)
		}
	}
	for _, directory := range []string{"http://thruhold.org", "wss://thruhold.org", "https://directory.example/path", "https://user:pass@directory.example"} {
		if validDirectoryURL(directory) {
			t.Errorf("invalid directory URL accepted: %s", directory)
		}
	}
}
