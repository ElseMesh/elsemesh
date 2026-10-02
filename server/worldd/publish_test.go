package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/libp2p/go-libp2p/core/peer"
)

func TestPublishOwnerWorldManifestImportsArchivesAndActivates(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "profile")
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		t.Fatal(err)
	}
	key := testKey(t)
	owner, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	activePath := filepath.Join(dataDir, "world.json")
	current := newStarterManifest("Original", owner.String())
	current.Discoverable = true
	current.Version = 7
	current.UpdatedAt = time.Now().Unix()
	oldDocument, err := signDocument(manifestProtocol, current, key)
	if err != nil {
		t.Fatal(err)
	}
	oldBytes, err := json.MarshalIndent(oldDocument, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	oldBytes = append(oldBytes, '\n')
	if err := os.WriteFile(activePath, oldBytes, 0600); err != nil {
		t.Fatal(err)
	}

	packageDir := filepath.Join(root, "source-assets")
	if err := os.Mkdir(packageDir, 0700); err != nil {
		t.Fatal(err)
	}
	assetBytes := []byte("portable world asset")
	assetID := assetHash(assetBytes)
	if err := os.WriteFile(filepath.Join(packageDir, assetID[len("sha256:"):]), assetBytes, 0600); err != nil {
		t.Fatal(err)
	}
	next := current
	next.Version++
	next.Title = "Published"
	next.UpdatedAt++
	next.Assets = []assetRef{{ID: assetID, Bytes: int64(len(assetBytes)), Kind: "glb", Priority: "visible"}}
	candidatePath := filepath.Join(root, "candidate.json")
	candidateBytes, err := json.Marshal(next)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(candidatePath, candidateBytes, 0600); err != nil {
		t.Fatal(err)
	}

	count, total, err := publishOwnerWorldManifest(activePath, candidatePath, packageDir, dataDir, owner.String(), key, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 || total != int64(len(assetBytes)) {
		t.Fatalf("import result = %d assets / %d bytes", count, total)
	}
	archived, err := os.ReadFile(filepath.Join(dataDir, "manifest-history", "world-v7.json"))
	if err != nil || string(archived) != string(oldBytes) {
		t.Fatalf("archive differs from old manifest: err=%v", err)
	}
	active, _, err := readOwnedWorldManifest(activePath, owner.String(), key, time.Now())
	if err != nil || active.Version != 8 || active.Title != "Published" || !active.Discoverable {
		t.Fatalf("active manifest was not correctly activated: world=%+v err=%v", active, err)
	}
	installed, err := os.ReadFile(filepath.Join(dataDir, "assets", assetID[len("sha256:"):]))
	if err != nil || string(installed) != string(assetBytes) {
		t.Fatalf("package asset missing or changed: err=%v", err)
	}
	if _, err := os.Lstat(filepath.Join(dataDir, ".publish.lock")); !os.IsNotExist(err) {
		t.Fatalf("publication lock was not removed: %v", err)
	}
}

func TestPublishOwnerWorldManifestRejectsStaleCandidateWithoutChangingActive(t *testing.T) {
	root := t.TempDir()
	key := testKey(t)
	owner, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	current := newStarterManifest("Original", owner.String())
	current.Version = 4
	document, err := signDocument(manifestProtocol, current, key)
	if err != nil {
		t.Fatal(err)
	}
	oldBytes, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(root, "profile")
	if err := os.Mkdir(dataDir, 0700); err != nil {
		t.Fatal(err)
	}
	activePath := filepath.Join(dataDir, "world.json")
	if err := os.WriteFile(activePath, oldBytes, 0600); err != nil {
		t.Fatal(err)
	}
	stale := current
	stale.Version = 6
	candidate, err := json.Marshal(stale)
	if err != nil {
		t.Fatal(err)
	}
	candidatePath := filepath.Join(root, "candidate.json")
	if err := os.WriteFile(candidatePath, candidate, 0600); err != nil {
		t.Fatal(err)
	}
	packageDir := filepath.Join(root, "assets")
	if err := os.Mkdir(packageDir, 0700); err != nil {
		t.Fatal(err)
	}
	if _, _, err := publishOwnerWorldManifest(activePath, candidatePath, packageDir, dataDir, owner.String(), key, time.Now()); err == nil {
		t.Fatal("stale manifest candidate was published")
	}
	after, err := os.ReadFile(activePath)
	if err != nil || string(after) != string(oldBytes) {
		t.Fatalf("failed publish changed active manifest: err=%v", err)
	}
}

func TestEnsureManifestArchiveIsRetrySafeAndRejectsConflicts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "world-v1.json")
	want := []byte("original signed manifest")
	if err := ensureManifestArchive(path, want); err != nil {
		t.Fatal(err)
	}
	if err := ensureManifestArchive(path, want); err != nil {
		t.Fatalf("matching archive should be safe to reuse: %v", err)
	}
	if err := ensureManifestArchive(path, []byte("different manifest")); err == nil {
		t.Fatal("conflicting archive was accepted")
	}
}
