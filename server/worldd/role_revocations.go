package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const maxRoleRevocationDocumentBytes = 1 << 20

func roleRevocationStatePath(dataDir, worldID string) string {
	digest := sha256.Sum256([]byte(worldID))
	return filepath.Join(dataDir, "role-revocations-"+hex.EncodeToString(digest[:])+".json")
}

func (d *daemon) loadRoleRevocations() error {
	data, err := os.ReadFile(d.roleStatePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(data) > maxRoleRevocationDocumentBytes {
		return errors.New("persisted role revocation state exceeds 1 MiB")
	}
	var document signedDocument
	if err := json.Unmarshal(data, &document); err != nil {
		return err
	}
	var payload worldRoleRevocations
	if err := decodeStrictPayload(document.Payload, &payload); err != nil {
		return fmt.Errorf("persisted role revocation payload: %w", err)
	}
	// The persisted serial remains a rollback floor after the short-lived state
	// expires. Its signature and world binding are still checked at startup;
	// freshness is checked whenever a new state is accepted and by consumers.
	issued := time.Unix(payload.IssuedAt, 0)
	validated, err := validateWorldRoleRevocations(document, d.world.WorldID, d.world.OwnerPeerID, 1, issued.Add(time.Nanosecond))
	if err != nil {
		return err
	}
	d.roleState = document
	d.roleStateSerial = validated.Serial
	return nil
}

func (d *daemon) handleRoleRevocations(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.Method {
	case http.MethodGet:
		d.roleStateMu.RLock()
		defer d.roleStateMu.RUnlock()
		if d.roleStateSerial == 0 {
			http.Error(w, "role revocation state is not published", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(d.roleState)
	case http.MethodPut:
		if r.Body == nil {
			http.Error(w, "missing signed role revocation document", http.StatusBadRequest)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, maxRoleRevocationDocumentBytes+1))
		if err != nil || len(body) > maxRoleRevocationDocumentBytes {
			http.Error(w, "role revocation document exceeds 1 MiB", http.StatusRequestEntityTooLarge)
			return
		}
		var document signedDocument
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&document); err != nil {
			http.Error(w, "invalid signed role revocation document", http.StatusBadRequest)
			return
		}
		var trailing any
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			http.Error(w, "invalid signed role revocation document", http.StatusBadRequest)
			return
		}
		d.roleStateMu.Lock()
		defer d.roleStateMu.Unlock()
		minimum := d.roleStateSerial + 1
		state, err := validateWorldRoleRevocations(document, d.world.WorldID, d.world.OwnerPeerID, minimum, time.Now())
		if err != nil {
			http.Error(w, "role revocation document rejected: "+err.Error(), http.StatusBadRequest)
			return
		}
		if err := persistSignedRoleDocument(d.roleStatePath, document); err != nil {
			http.Error(w, "could not persist role revocation document", http.StatusInternalServerError)
			return
		}
		d.roleState = document
		d.roleStateSerial = state.Serial
		w.WriteHeader(http.StatusNoContent)
	default:
		w.Header().Set("Allow", "GET, PUT, OPTIONS")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func persistSignedRoleDocument(path string, document signedDocument) error {
	encoded, err := json.Marshal(document)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	file, err := os.CreateTemp(dir, ".role-revocations-*")
	if err != nil {
		return err
	}
	temp := file.Name()
	defer os.Remove(temp)
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return err
	}
	if _, err := file.Write(encoded); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(temp, path); err != nil {
		return err
	}
	directory, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
