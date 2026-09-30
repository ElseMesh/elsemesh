package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
)

// signedDocument is the stable cross-language envelope used for world records.
// Payload is canonical JSON, signatures are Ed25519, and signer is a libp2p PeerID.
type signedDocument struct {
	Protocol  string          `json:"protocol"`
	Signer    string          `json:"signer"`
	PublicKey string          `json:"publicKey"`
	Payload   json.RawMessage `json:"payload"`
	Signature string          `json:"signature"`
}

type unsignedDocument struct {
	Protocol  string          `json:"protocol"`
	Signer    string          `json:"signer"`
	PublicKey string          `json:"publicKey"`
	Payload   json.RawMessage `json:"payload"`
}

func peerIDForKey(key crypto.PubKey) (peer.ID, error) { return peer.IDFromPublicKey(key) }

func signDocument(protocol string, payload any, key crypto.PrivKey) (signedDocument, error) {
	publicKeyBytes, err := crypto.MarshalPublicKey(key.GetPublic())
	if err != nil {
		return signedDocument{}, err
	}
	peerID, err := peerIDForKey(key.GetPublic())
	if err != nil {
		return signedDocument{}, err
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return signedDocument{}, err
	}
	u := unsignedDocument{Protocol: protocol, Signer: peerID.String(), PublicKey: base64.RawStdEncoding.EncodeToString(publicKeyBytes), Payload: payloadBytes}
	canonical, err := canonicalJSON(u)
	if err != nil {
		return signedDocument{}, err
	}
	signature, err := key.Sign(canonical)
	if err != nil {
		return signedDocument{}, err
	}
	return signedDocument{Protocol: protocol, Signer: u.Signer, PublicKey: u.PublicKey, Payload: payloadBytes, Signature: base64.RawStdEncoding.EncodeToString(signature)}, nil
}

func verifyDocument(doc signedDocument, expectedProtocol string) error {
	if doc.Protocol != expectedProtocol || len(doc.Payload) == 0 || len(doc.Payload) > maxManifestBytes {
		return errors.New("invalid signed document envelope")
	}
	publicKeyBytes, err := base64.RawStdEncoding.DecodeString(doc.PublicKey)
	if err != nil {
		return errors.New("invalid public key encoding")
	}
	publicKey, err := crypto.UnmarshalPublicKey(publicKeyBytes)
	if err != nil {
		return errors.New("invalid public key")
	}
	peerID, err := peerIDForKey(publicKey)
	if err != nil || peerID.String() != doc.Signer {
		return errors.New("signer does not match public key")
	}
	signature, err := base64.RawStdEncoding.DecodeString(doc.Signature)
	if err != nil {
		return errors.New("invalid signature encoding")
	}
	u := unsignedDocument{Protocol: doc.Protocol, Signer: doc.Signer, PublicKey: doc.PublicKey, Payload: doc.Payload}
	canonical, err := canonicalJSON(u)
	if err != nil {
		return err
	}
	valid, err := publicKey.Verify(canonical, signature)
	if err != nil || !valid {
		return errors.New("signature verification failed")
	}
	return nil
}

func canonicalJSON(value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	var normalized any
	if err := decoder.Decode(&normalized); err != nil {
		return nil, err
	}
	return json.Marshal(normalized) // encoding/json sorts object keys recursively
}

func loadIdentity(path string) (crypto.PrivKey, error) {
	encoded, err := readPrivateKey(path)
	if err == nil {
		key, unmarshalErr := crypto.UnmarshalPrivateKey(encoded)
		if unmarshalErr != nil {
			return nil, fmt.Errorf("decode node key: %w", unmarshalErr)
		}
		return key, nil
	}
	if !errors.Is(err, errFileNotFound) {
		return nil, err
	}
	key, _, err := crypto.GenerateEd25519Key(nil)
	if err != nil {
		return nil, err
	}
	encoded, err = crypto.MarshalPrivateKey(key)
	if err != nil {
		return nil, err
	}
	if err := writePrivateKey(path, encoded); err != nil {
		return nil, err
	}
	return key, nil
}

func assetHash(bytes []byte) string {
	hash := sha256.Sum256(bytes)
	return fmt.Sprintf("sha256:%x", hash[:])
}
