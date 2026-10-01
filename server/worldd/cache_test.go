package main

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCachedAssetVerificationDetectsChangedFiles(t *testing.T) {
	assetsDir := t.TempDir()
	data := []byte("immutable world asset")
	digest := sha256.Sum256(data)
	asset := assetRef{ID: fmt.Sprintf("sha256:%x", digest), Bytes: int64(len(data))}
	path := filepath.Join(assetsDir, asset.ID[len("sha256:"):])
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	d := &daemon{assetsDir: assetsDir, verifiedAssets: make(map[string]assetFileStamp)}
	if !d.hasVerifiedAsset(asset) {
		t.Fatal("valid content-addressed asset rejected")
	}
	if err := os.WriteFile(path, []byte("corrupt world asset!!"), 0600); err != nil {
		t.Fatal(err)
	}
	changed := time.Now().Add(-time.Hour)
	if err := os.Chtimes(path, changed, changed); err != nil {
		t.Fatal(err)
	}
	if d.hasVerifiedAsset(asset) {
		t.Fatal("changed content-addressed asset treated as verified")
	}
}
