package main

import (
	"crypto/rand"
	"encoding/json"
	"testing"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
)

func testKey(t *testing.T) crypto.PrivKey {
	t.Helper()
	key, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

func TestSignedDocumentVerifiesAndRejectsTampering(t *testing.T) {
	key := testKey(t)
	document, err := signDocument("tidewater.test/1", map[string]any{"z": 2, "a": map[string]any{"second": true, "first": 1}}, key)
	if err != nil {
		t.Fatal(err)
	}
	if err := verifyDocument(document, "tidewater.test/1"); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(document.Payload, &payload); err != nil {
		t.Fatal(err)
	}
	payload["z"] = 3
	document.Payload, _ = json.Marshal(payload)
	if err := verifyDocument(document, "tidewater.test/1"); err == nil {
		t.Fatal("tampered payload verified")
	}
}
