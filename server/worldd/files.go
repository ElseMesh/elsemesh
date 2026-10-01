package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/libp2p/go-libp2p/core/crypto"
)

var errFileNotFound = errors.New("file not found")

const maxImportPackageBytes int64 = 16 << 30

func readPrivateKey(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, errFileNotFound
	}
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Mode().Perm()&0077 != 0 {
		return nil, errors.New("node key permissions must be 0600")
	}
	return data, nil
}

func importAsset(source, assetsDir string) (string, error) {
	input, err := os.Open(source)
	if err != nil {
		return "", err
	}
	defer input.Close()
	info, err := input.Stat()
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Size() < 0 || info.Size() > maxAssetBytes {
		return "", errors.New("asset must be a regular file no larger than 2 GiB")
	}
	if err := os.MkdirAll(assetsDir, 0700); err != nil {
		return "", err
	}
	temp, err := os.CreateTemp(assetsDir, ".asset-import-*")
	if err != nil {
		return "", err
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	hasher := sha256.New()
	n, copyErr := io.Copy(io.MultiWriter(temp, hasher), io.LimitReader(input, maxAssetBytes+1))
	if copyErr != nil {
		temp.Close()
		return "", copyErr
	}
	if n != info.Size() || n > maxAssetBytes {
		temp.Close()
		return "", errors.New("asset changed while being imported or exceeds the size limit")
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return "", err
	}
	if err := temp.Close(); err != nil {
		return "", err
	}
	id := "sha256:" + hex.EncodeToString(hasher.Sum(nil))
	destination := filepath.Join(assetsDir, strings.TrimPrefix(id, "sha256:"))
	if existing, err := os.Open(destination); err == nil {
		actual, hashErr := hashFile(existing)
		closeErr := existing.Close()
		if hashErr == nil && closeErr == nil && actual == id {
			return id, nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if err := os.Rename(tempName, destination); err != nil {
		return "", err
	}
	return id, nil
}

func importWorldPackage(packageAssetsDir, assetsDir string, manifest worldManifest) (int, int64, error) {
	packageInfo, err := os.Stat(packageAssetsDir)
	if err != nil {
		return 0, 0, err
	}
	if !packageInfo.IsDir() {
		return 0, 0, errors.New("world package assets path must be a directory")
	}
	if len(manifest.Assets) > 10000 {
		return 0, 0, errors.New("world package contains too many assets")
	}

	expected := make(map[string]assetRef, len(manifest.Assets))
	var packageBytes int64
	for _, asset := range manifest.Assets {
		if !assetIDPattern.MatchString(asset.ID) || asset.Bytes < 0 || asset.Bytes > maxAssetBytes {
			return 0, 0, fmt.Errorf("invalid package asset %q", asset.ID)
		}
		if _, duplicate := expected[asset.ID]; duplicate {
			return 0, 0, fmt.Errorf("duplicate package asset %q", asset.ID)
		}
		if asset.Bytes > maxImportPackageBytes-packageBytes {
			return 0, 0, errors.New("world package exceeds the 16 GiB import limit")
		}
		packageBytes += asset.Bytes
		expected[strings.TrimPrefix(asset.ID, "sha256:")] = asset
	}
	if manifest.Rules.MaxPackageBytes != nil && packageBytes > *manifest.Rules.MaxPackageBytes {
		return 0, 0, errors.New("world package exceeds its signed byte budget")
	}

	entries, err := os.ReadDir(packageAssetsDir)
	if err != nil {
		return 0, 0, err
	}
	if len(entries) != len(expected) {
		return 0, 0, errors.New("package directory does not contain exactly the manifest assets")
	}
	for _, entry := range entries {
		if _, ok := expected[entry.Name()]; !ok {
			return 0, 0, fmt.Errorf("package contains unreferenced file %q", entry.Name())
		}
		info, err := entry.Info()
		if err != nil {
			return 0, 0, err
		}
		if !info.Mode().IsRegular() {
			return 0, 0, fmt.Errorf("package asset %q is not a regular file", entry.Name())
		}
	}

	if err := os.MkdirAll(assetsDir, 0700); err != nil {
		return 0, 0, err
	}
	stagingDir, err := os.MkdirTemp(assetsDir, ".package-import-*")
	if err != nil {
		return 0, 0, err
	}
	defer os.RemoveAll(stagingDir)

	staged := make(map[string]string, len(manifest.Assets))
	for _, asset := range manifest.Assets {
		filename := strings.TrimPrefix(asset.ID, "sha256:")
		source := filepath.Join(packageAssetsDir, filename)
		info, err := os.Lstat(source)
		if err != nil {
			return 0, 0, err
		}
		if !info.Mode().IsRegular() || info.Size() != asset.Bytes {
			return 0, 0, fmt.Errorf("package asset %s has an invalid file type or size", asset.ID)
		}
		actualID, err := importAsset(source, stagingDir)
		if err != nil {
			return 0, 0, fmt.Errorf("verify package asset %s: %w", asset.ID, err)
		}
		if actualID != asset.ID {
			return 0, 0, fmt.Errorf("package asset %s does not match its signed hash", asset.ID)
		}
		staged[asset.ID] = filepath.Join(stagingDir, filename)
	}

	store := make(map[string]bool, len(manifest.Assets))
	for _, asset := range manifest.Assets {
		filename := strings.TrimPrefix(asset.ID, "sha256:")
		destination := filepath.Join(assetsDir, filename)
		info, err := os.Lstat(destination)
		if errors.Is(err, os.ErrNotExist) {
			store[asset.ID] = false
			continue
		}
		if err != nil {
			return 0, 0, err
		}
		if !info.Mode().IsRegular() || info.Size() != asset.Bytes {
			return 0, 0, fmt.Errorf("existing content-store entry for %s is not the signed asset", asset.ID)
		}
		file, err := os.Open(destination)
		if err != nil {
			return 0, 0, err
		}
		actualID, hashErr := hashFile(file)
		closeErr := file.Close()
		if hashErr != nil {
			return 0, 0, hashErr
		}
		if closeErr != nil {
			return 0, 0, closeErr
		}
		if actualID != asset.ID {
			return 0, 0, fmt.Errorf("existing content-store entry for %s has a bad hash", asset.ID)
		}
		store[asset.ID] = true
	}

	for _, asset := range manifest.Assets {
		if store[asset.ID] {
			continue
		}
		filename := strings.TrimPrefix(asset.ID, "sha256:")
		destination := filepath.Join(assetsDir, filename)
		// Staged files live under assetsDir on the same filesystem. Rename is
		// atomic and supported by Android app-private filesystems that prohibit
		// hard links (including Termux's default storage).
		if err := os.Rename(staged[asset.ID], destination); err != nil {
			if !errors.Is(err, os.ErrExist) {
				return 0, 0, err
			}
			info, statErr := os.Lstat(destination)
			if statErr != nil || !info.Mode().IsRegular() || info.Size() != asset.Bytes {
				return 0, 0, fmt.Errorf("concurrent content-store entry for %s is invalid", asset.ID)
			}
			file, openErr := os.Open(destination)
			if openErr != nil {
				return 0, 0, openErr
			}
			actualID, hashErr := hashFile(file)
			closeErr := file.Close()
			if hashErr != nil {
				return 0, 0, hashErr
			}
			if closeErr != nil {
				return 0, 0, closeErr
			}
			if actualID != asset.ID {
				return 0, 0, fmt.Errorf("concurrent content-store entry for %s has a bad hash", asset.ID)
			}
		}
	}
	return len(manifest.Assets), packageBytes, nil
}

func importAuthorizedPackage(document signedDocument, localPeerID, packageAssetsDir, assetsDir string, now time.Time) (int, int64, error) {
	manifest, err := decodeManifest(document, localPeerID, now)
	if err != nil {
		return 0, 0, err
	}
	if !canServeWorldAssets(manifest, localPeerID, now) {
		return 0, 0, errors.New("this node lacks an owner or content-cache grant for package assets")
	}
	return importWorldPackage(packageAssetsDir, assetsDir, manifest)
}

func signManifestFile(source, destination, owner string, key crypto.PrivKey, now time.Time) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	raw, err := io.ReadAll(io.LimitReader(input, maxManifestBytes+1))
	if err != nil {
		return err
	}
	if len(raw) > maxManifestBytes {
		return errors.New("world manifest exceeds 1 MiB")
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	var manifest worldManifest
	if err := decoder.Decode(&manifest); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return errors.New("world manifest must contain exactly one JSON document")
	}
	if manifest.OwnerPeerID != owner {
		return errors.New("manifest ownerPeerId does not match this node identity")
	}
	if err := validateManifest(manifest, owner, now); err != nil {
		return fmt.Errorf("manifest validation: %w", err)
	}
	doc, err := signDocument(manifestProtocol, manifest, key)
	if err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	if _, err := file.Write(append(encoded, '\n')); err != nil {
		file.Close()
		os.Remove(destination)
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		os.Remove(destination)
		return err
	}
	if err := file.Close(); err != nil {
		os.Remove(destination)
		return err
	}
	return nil
}

func writePrivateKey(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.Write(data)
	return err
}
