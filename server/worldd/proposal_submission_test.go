package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
)

func TestWorldProposalSubmissionRequiresFreshGrantAndPersistsForOwnerReview(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	owner, member := testKey(t), testKey(t)
	ownerID := peerIDForTest(t, owner.GetPublic())
	worldID := "tw-world:proposal-inbox"
	proposalDir := filepath.Join(t.TempDir(), "proposals")
	if err := os.Mkdir(proposalDir, 0700); err != nil {
		t.Fatal(err)
	}
	fingerprint, err := accountKeyFingerprint(member.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	grant := worldRoleGrant{
		Protocol: worldRoleGrantProtocol, WorldID: worldID, OwnerPeerID: ownerID,
		GrantID: "grant_0123456789ab", Version: 1, AccountKeyFingerprint: fingerprint,
		Scopes: []string{"world.content.edit"}, IssuedAt: now.Add(-time.Minute).Unix(), ExpiresAt: now.Add(time.Hour).Unix(),
	}
	grantDocument, err := signDocument(worldRoleGrantProtocol, grant, owner)
	if err != nil {
		t.Fatal(err)
	}
	revocationDocument := signRoleRevocationsForProposalTest(t, owner, worldID, ownerID, 1, now.Add(-time.Minute), now.Add(10*time.Minute), nil, nil)
	d := &daemon{
		world: worldManifest{WorldID: worldID, OwnerPeerID: ownerID}, key: owner,
		roleState: revocationDocument, roleStateSerial: 1, proposalDir: proposalDir,
	}
	proposal := proposalForTest(worldID, "world.update")
	submission := makeSignedProposalSubmission(t, member, grantDocument, proposal)
	body, err := json.Marshal(submission)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/world/proposals", bytes.NewReader(body))
	response := httptest.NewRecorder()
	d.handleWorldProposalSubmission(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("valid proposal rejected: code=%d body=%s", response.Code, response.Body.String())
	}
	var reply struct {
		ProposalID string `json:"proposalId"`
		Status     string `json:"status"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
	if reply.Status != "queued-for-owner-review" || len(reply.ProposalID) != len("sha256:")+64 {
		t.Fatalf("unexpected proposal response: %+v", reply)
	}
	storedPath := filepath.Join(proposalDir, reply.ProposalID[len("sha256:"):]+".json")
	stored, err := os.Stat(storedPath)
	if err != nil || stored.Mode().Perm() != 0600 {
		t.Fatalf("proposal not stored privately: stat=%v err=%v", stored, err)
	}
	storedJSON, err := os.ReadFile(storedPath)
	if err != nil {
		t.Fatal(err)
	}
	var persisted worldProposalSubmission
	var storedProposal worldProposalHeader
	if err := json.Unmarshal(storedJSON, &persisted); err != nil || json.Unmarshal(persisted.Proposal, &storedProposal) != nil || storedProposal.Protocol == "" {
		t.Fatalf("stored proposal is invalid: err=%v", err)
	}
	response = httptest.NewRecorder()
	d.handleWorldProposalSubmission(response, httptest.NewRequest(http.MethodPost, "/api/world/proposals", bytes.NewReader(body)))
	if response.Code != http.StatusCreated {
		t.Fatalf("idempotent resubmission failed: code=%d body=%s", response.Code, response.Body.String())
	}
}

func TestWorldProposalCanonicalEnvelopeEscapesHTMLLikeBrowserSigner(t *testing.T) {
	unsigned := unsignedWorldProposalSubmission{
		Protocol: worldProposalSubmissionProtocol, AccountPublicKey: "AQID",
		Grant: signedDocument{
			Protocol: "tidewater.world-role/1", Signer: "owner", PublicKey: "public", Signature: "signature",
			Payload: json.RawMessage(`{"name":"<A&B>","n":1}`),
		},
		Proposal: json.RawMessage(`{"protocol":"elsemesh.world-proposal/1","worldId":"tw-world:canonical","sourceHash":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","operations":[],"title":"<A&B>"}`),
	}
	canonical, err := canonicalJSON(unsigned)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"accountPublicKey":"AQID","grant":{"payload":{"n":1,"name":"\u003cA\u0026B\u003e"},"protocol":"tidewater.world-role/1","publicKey":"public","signature":"signature","signer":"owner"},"proposal":{"operations":[],"protocol":"elsemesh.world-proposal/1","sourceHash":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","title":"\u003cA\u0026B\u003e","worldId":"tw-world:canonical"},"protocol":"elsemesh.world-proposal-submission/1"}`
	if string(canonical) != want {
		t.Fatalf("canonical submission = %s, want %s", canonical, want)
	}
}

func TestWorldProposalSubmissionRejectsMissingStaleRevokedAndNonOwnerCases(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	owner, member := testKey(t), testKey(t)
	ownerID := peerIDForTest(t, owner.GetPublic())
	worldID := "tw-world:proposal-denials"
	fingerprint, err := accountKeyFingerprint(member.GetPublic())
	if err != nil {
		t.Fatal(err)
	}
	grant := worldRoleGrant{
		Protocol: worldRoleGrantProtocol, WorldID: worldID, OwnerPeerID: ownerID,
		GrantID: "grant_0123456789ab", Version: 1, AccountKeyFingerprint: fingerprint,
		Scopes: []string{"world.content.edit"}, IssuedAt: now.Add(-time.Minute).Unix(), ExpiresAt: now.Add(time.Hour).Unix(),
	}
	grantDocument, err := signDocument(worldRoleGrantProtocol, grant, owner)
	if err != nil {
		t.Fatal(err)
	}
	validState := signRoleRevocationsForProposalTest(t, owner, worldID, ownerID, 1, now.Add(-time.Minute), now.Add(10*time.Minute), nil, nil)
	tests := []struct {
		name       string
		localKey   crypto.PrivKey
		state      signedDocument
		serial     uint64
		submission worldProposalSubmission
	}{
		{name: "missing revocation state", localKey: owner, submission: makeSignedProposalSubmission(t, member, grantDocument, proposalForTest(worldID, "world.update"))},
		{name: "stale revocation state", localKey: owner, state: signRoleRevocationsForProposalTest(t, owner, worldID, ownerID, 1, now.Add(-20*time.Minute), now.Add(-10*time.Minute), nil, nil), serial: 1, submission: makeSignedProposalSubmission(t, member, grantDocument, proposalForTest(worldID, "world.update"))},
		{name: "revoked grant", localKey: owner, state: signRoleRevocationsForProposalTest(t, owner, worldID, ownerID, 1, now.Add(-time.Minute), now.Add(10*time.Minute), []string{grant.GrantID}, nil), serial: 1, submission: makeSignedProposalSubmission(t, member, grantDocument, proposalForTest(worldID, "world.update"))},
		{name: "wrong world", localKey: owner, state: validState, serial: 1, submission: makeSignedProposalSubmission(t, member, grantDocument, proposalForTest("tw-world:other", "world.update"))},
		{name: "unsupported operation", localKey: owner, state: validState, serial: 1, submission: makeSignedProposalSubmission(t, member, grantDocument, proposalForTest(worldID, "run-script"))},
		{name: "not owner node", localKey: testKey(t), state: validState, serial: 1, submission: makeSignedProposalSubmission(t, member, grantDocument, proposalForTest(worldID, "world.update"))},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "proposals")
			if err := os.Mkdir(dir, 0700); err != nil {
				t.Fatal(err)
			}
			d := &daemon{world: worldManifest{WorldID: worldID, OwnerPeerID: ownerID}, key: test.localKey, proposalDir: dir, roleState: test.state, roleStateSerial: test.serial}
			body, err := json.Marshal(test.submission)
			if err != nil {
				t.Fatal(err)
			}
			response := httptest.NewRecorder()
			d.handleWorldProposalSubmission(response, httptest.NewRequest(http.MethodPost, "/api/world/proposals", bytes.NewReader(body)))
			if response.Code != http.StatusForbidden {
				t.Fatalf("invalid proposal accepted: code=%d body=%s", response.Code, response.Body.String())
			}
			entries, err := os.ReadDir(dir)
			if err != nil || len(entries) != 0 {
				t.Fatalf("rejected proposal was stored: entries=%d err=%v", len(entries), err)
			}
		})
	}
}

func proposalForTest(worldID, operation string) json.RawMessage {
	return json.RawMessage(`{"protocol":"elsemesh.world-proposal/1","worldId":"` + worldID + `","sourceHash":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","operations":[{"op":"` + operation + `","fields":{"title":"A proposed title"}}]}`)
}

func makeSignedProposalSubmission(t *testing.T, accountKey crypto.PrivKey, grant signedDocument, proposal json.RawMessage) worldProposalSubmission {
	t.Helper()
	publicKey, err := accountKey.GetPublic().Raw()
	if err != nil {
		t.Fatal(err)
	}
	unsigned := unsignedWorldProposalSubmission{
		Protocol: worldProposalSubmissionProtocol, AccountPublicKey: base64.RawURLEncoding.EncodeToString(publicKey),
		Grant: grant, Proposal: proposal,
	}
	message, err := canonicalJSON(unsigned)
	if err != nil {
		t.Fatal(err)
	}
	message = append([]byte(worldProposalSubmissionDomain), message...)
	signature, err := accountKey.Sign(message)
	if err != nil {
		t.Fatal(err)
	}
	return worldProposalSubmission{Protocol: unsigned.Protocol, AccountPublicKey: unsigned.AccountPublicKey, Grant: grant, Proposal: proposal, Signature: base64.RawURLEncoding.EncodeToString(signature)}
}

func signRoleRevocationsForProposalTest(t *testing.T, owner crypto.PrivKey, worldID, ownerID string, serial uint64, issuedAt, expiresAt time.Time, grantIDs, fingerprints []string) signedDocument {
	t.Helper()
	state := worldRoleRevocations{
		Protocol: worldRoleRevocationsProtocol, WorldID: worldID, OwnerPeerID: ownerID,
		Serial: serial, IssuedAt: issuedAt.Unix(), ExpiresAt: expiresAt.Unix(),
		GrantIDs: grantIDs, AccountKeyFingerprints: fingerprints,
	}
	if state.GrantIDs == nil {
		state.GrantIDs = []string{}
	}
	if state.AccountKeyFingerprints == nil {
		state.AccountKeyFingerprints = []string{}
	}
	document, err := signDocument(worldRoleRevocationsProtocol, state, owner)
	if err != nil {
		t.Fatal(err)
	}
	return document
}
