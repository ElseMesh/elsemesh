package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/libp2p/go-libp2p/core/crypto"
)

func readOwnedWorldManifest(path, localPeerID string, key crypto.PrivKey, now time.Time) (worldManifest, []byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return worldManifest{}, nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return worldManifest{}, nil, errors.New("active world manifest must be a private regular file")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return worldManifest{}, nil, err
	}
	if len(raw) > maxManifestBytes {
		return worldManifest{}, nil, errors.New("world manifest exceeds 1 MiB")
	}
	var document signedDocument
	if err := decodeStrictJSON(raw, &document); err != nil {
		return worldManifest{}, nil, fmt.Errorf("active world manifest: %w", err)
	}
	world, err := decodeManifest(document, localPeerID, now)
	if err != nil {
		return worldManifest{}, nil, fmt.Errorf("active world manifest: %w", err)
	}
	if world.OwnerPeerID != localPeerID {
		return worldManifest{}, nil, errors.New("world publication is available only on the owner node")
	}
	if document.Signer != localPeerID {
		return worldManifest{}, nil, errors.New("active manifest owner key does not match this profile's node key")
	}
	return world, raw, nil
}

func publishOwnerWorldManifest(activePath, candidatePath, packageAssetsDir, dataDir, localPeerID string, key crypto.PrivKey, now time.Time) (int, int64, error) {
	if filepath.Clean(activePath) != filepath.Join(dataDir, "world.json") {
		return 0, 0, errors.New("publication target must be this profile's data/world.json")
	}
	lockPath := filepath.Join(dataDir, ".publish.lock")
	lock, err := os.OpenFile(lockPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return 0, 0, fmt.Errorf("cannot acquire publication lock (remove %s only after confirming no publisher is running): %w", lockPath, err)
	}
	_, _ = fmt.Fprintf(lock, "pid=%d\n", os.Getpid())
	if err := lock.Sync(); err != nil {
		lock.Close()
		os.Remove(lockPath)
		return 0, 0, err
	}
	if err := lock.Close(); err != nil {
		os.Remove(lockPath)
		return 0, 0, err
	}
	defer os.Remove(lockPath)

	current, originalBytes, err := readOwnedWorldManifest(activePath, localPeerID, key, now)
	if err != nil {
		return 0, 0, err
	}
	candidateInfo, err := os.Lstat(candidatePath)
	if err != nil {
		return 0, 0, err
	}
	if !candidateInfo.Mode().IsRegular() {
		return 0, 0, errors.New("candidate manifest must be a regular file")
	}
	candidateBytes, err := os.ReadFile(candidatePath)
	if err != nil {
		return 0, 0, err
	}
	if len(candidateBytes) > maxManifestBytes {
		return 0, 0, errors.New("candidate manifest exceeds 1 MiB")
	}
	var next worldManifest
	if err := decodeStrictJSON(candidateBytes, &next); err != nil {
		return 0, 0, fmt.Errorf("candidate manifest: %w", err)
	}
	if current.Version >= maxSafeJSInteger || next.Version != current.Version+1 {
		return 0, 0, errors.New("candidate manifest version must be exactly the current version plus one")
	}
	if next.WorldID != current.WorldID || next.OwnerPeerID != localPeerID || next.AuthorityPeerID != current.AuthorityPeerID || next.AuthorityEpoch != current.AuthorityEpoch {
		return 0, 0, errors.New("candidate must preserve the active world, owner, and authority epoch")
	}
	if err := validateManifest(next, localPeerID, now); err != nil {
		return 0, 0, fmt.Errorf("candidate manifest validation: %w", err)
	}
	document, err := signDocument(manifestProtocol, next, key)
	if err != nil {
		return 0, 0, err
	}
	count, totalBytes, err := importAuthorizedPackage(document, localPeerID, packageAssetsDir, filepath.Join(dataDir, "assets"), now)
	if err != nil {
		return 0, 0, fmt.Errorf("package import failed; active manifest unchanged: %w", err)
	}
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return 0, 0, err
	}
	encoded = append(encoded, '\n')

	historyDir := filepath.Join(dataDir, "manifest-history")
	if err := os.MkdirAll(historyDir, 0700); err != nil {
		return 0, 0, err
	}
	historyInfo, err := os.Lstat(historyDir)
	if err != nil || !historyInfo.IsDir() || historyInfo.Mode()&os.ModeSymlink != 0 || historyInfo.Mode().Perm()&0077 != 0 {
		return 0, 0, errors.New("manifest history must be a private directory")
	}
	historyPath := filepath.Join(historyDir, fmt.Sprintf("world-v%d.json", current.Version))
	if err := ensureManifestArchive(historyPath, originalBytes); err != nil {
		return 0, 0, fmt.Errorf("archive current manifest: %w", err)
	}

	staged, err := os.CreateTemp(dataDir, ".world-publish-*")
	if err != nil {
		return 0, 0, err
	}
	stagedPath := staged.Name()
	defer os.Remove(stagedPath)
	if err := staged.Chmod(0600); err != nil {
		staged.Close()
		return 0, 0, err
	}
	if _, err := staged.Write(encoded); err != nil {
		staged.Close()
		return 0, 0, err
	}
	if err := staged.Sync(); err != nil {
		staged.Close()
		return 0, 0, err
	}
	if err := staged.Close(); err != nil {
		return 0, 0, err
	}
	latest, err := os.ReadFile(activePath)
	if err != nil || !bytes.Equal(latest, originalBytes) {
		return 0, 0, errors.New("active manifest changed during publication; candidate was not activated")
	}
	activeInfo, err := os.Lstat(activePath)
	if err != nil || !activeInfo.Mode().IsRegular() {
		return 0, 0, errors.New("active manifest changed into a non-regular file during publication")
	}
	if err := os.Rename(stagedPath, activePath); err != nil {
		return 0, 0, err
	}
	dir, err := os.Open(dataDir)
	if err != nil {
		return 0, 0, err
	}
	defer dir.Close()
	if err := dir.Sync(); err != nil {
		return 0, 0, err
	}
	return count, totalBytes, nil
}

func ensureManifestArchive(path string, expected []byte) error {
	if err := writeNewPrivateFile(path, expected); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrExist) {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return errors.New("existing version archive is not a private regular file")
	}
	actual, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if !bytes.Equal(actual, expected) {
		return errors.New("existing version archive does not match the active manifest")
	}
	return nil
}
