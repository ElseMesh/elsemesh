package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
)

func TestImportAssetStoresContentAddressedFile(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "chair.glb")
	content := []byte("tidewater asset bytes")
	if err := os.WriteFile(source, content, 0600); err != nil {
		t.Fatal(err)
	}
	assets := filepath.Join(root, "assets")
	id, err := importAsset(source, assets)
	if err != nil {
		t.Fatal(err)
	}
	if id != assetHash(content) {
		t.Fatalf("asset id = %s, want %s", id, assetHash(content))
	}
	stored, err := os.ReadFile(filepath.Join(assets, id[len("sha256:"):]))
	if err != nil {
		t.Fatal(err)
	}
	if string(stored) != string(content) {
		t.Fatal("stored asset bytes differ from source")
	}
	if _, err := importAsset(source, assets); err != nil {
		t.Fatalf("reimport should be idempotent: %v", err)
	}
}

func TestOwnerSignsValidatedRuntimeManifest(t *testing.T) {
	key := testKey(t)
	owner, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	source, destination := filepath.Join(root, "unsigned.json"), filepath.Join(root, "signed.json")
	manifest := newStarterManifest("Island", owner.String())
	manifest.WorldID = "tw-world:authoring-test"
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, encoded, 0600); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	if err := signManifestFile(source, destination, owner.String(), key, now); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(destination)
	if err != nil {
		t.Fatal(err)
	}
	var document signedDocument
	if err := json.Unmarshal(data, &document); err != nil {
		t.Fatal(err)
	}
	if _, err := decodeManifest(document, owner.String(), now); err != nil {
		t.Fatalf("owner-signed manifest failed verification: %v", err)
	}
	if err := signManifestFile(source, destination, owner.String(), key, now); err == nil {
		t.Fatal("signing unexpectedly overwrote an existing document")
	}
}
