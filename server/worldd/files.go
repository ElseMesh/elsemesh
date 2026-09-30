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
