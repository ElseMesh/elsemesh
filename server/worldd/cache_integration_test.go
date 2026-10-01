package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
	"time"

	libp2p "github.com/libp2p/go-libp2p"
	crypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/core/peerstore"
)

func TestAuthorizedNeighborFetchesSignedManifestAndAssetOverLibp2p(t *testing.T) {
	ownerKey, _, err := crypto.GenerateEd25519Key(nil)
	if err != nil {
		t.Fatal(err)
	}
	cacheKey, _, err := crypto.GenerateEd25519Key(nil)
	if err != nil {
		t.Fatal(err)
	}
	ownerID, err := peer.IDFromPublicKey(ownerKey.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	cacheID, err := peer.IDFromPublicKey(cacheKey.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	ownerHost, err := libp2p.New(libp2p.Identity(ownerKey), libp2p.ListenAddrStrings("/ip4/127.0.0.1/tcp/0"))
	if err != nil {
		t.Fatal(err)
	}
	defer ownerHost.Close()
	cacheHost, err := libp2p.New(libp2p.Identity(cacheKey), libp2p.ListenAddrStrings("/ip4/127.0.0.1/tcp/0"))
	if err != nil {
		t.Fatal(err)
	}
	defer cacheHost.Close()
	cacheHost.Peerstore().AddAddrs(ownerHost.ID(), ownerHost.Addrs(), peerstore.PermanentAddrTTL)

	content := bytes.Repeat([]byte("ElseMesh cache integration asset\n"), 17000)
	digest := sha256.Sum256(content)
	assetID := "sha256:" + hex.EncodeToString(digest[:])
	grantExpiry := time.Now().Add(time.Hour).Unix()
	manifest := newStarterManifest("Cache integration", ownerID.String())
	manifest.WorldID = "tw-world:cache-integration"
	manifest.Assets = []assetRef{{ID: assetID, Bytes: int64(len(content)), Kind: "glb", Priority: "visible"}}
	manifest.Hosts = []hostingGrant{{PeerID: cacheID.String(), Scopes: []string{"content-cache"}, ExpiresAt: grantExpiry, Epoch: 1}}
	document, err := signDocument(manifestProtocol, manifest, ownerKey)
	if err != nil {
		t.Fatal(err)
	}
	ownerWorld, err := decodeManifest(document, ownerID.String(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	cacheWorld, err := decodeManifest(document, cacheID.String(), time.Now())
	if err != nil {
		t.Fatalf("owner-authorized cache rejected its manifest: %v", err)
	}

	ownerAssets := filepath.Join(t.TempDir(), "owner-assets")
	cacheAssets := filepath.Join(t.TempDir(), "cache-assets")
	if err := os.MkdirAll(ownerAssets, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(cacheAssets, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ownerAssets, hex.EncodeToString(digest[:])), content, 0600); err != nil {
		t.Fatal(err)
	}
	owner := &daemon{host: ownerHost, manifest: document, world: ownerWorld, key: ownerKey, assetsDir: ownerAssets, verifiedAssets: make(map[string]assetFileStamp)}
	ownerHost.SetStreamHandler(worldProtocol, owner.handlePeerStream)
	cache := &daemon{ctx: context.Background(), host: cacheHost, manifest: document, world: cacheWorld, key: cacheKey, assetsDir: cacheAssets, verifiedAssets: make(map[string]assetFileStamp)}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := cache.syncCacheFrom(ctx, ownerID); err != nil {
		t.Fatalf("authorized neighbor failed to sync over libp2p: %v", err)
	}
	if !cache.hasCompleteAssets() {
		t.Fatal("cache did not verify every owner-declared asset after sync")
	}
	got, err := os.ReadFile(cache.assetPath(assetID))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, content) {
		t.Fatal("neighbor cache bytes differ from the owner asset")
	}
}
