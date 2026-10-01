package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strings"
	"time"

	crypto "github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
)

const (
	manifestProtocol = "tidewater.world/1"
	maxManifestBytes = 1 << 20
	maxAssetBytes    = 2 << 30
)

var (
	worldIDPattern      = regexp.MustCompile(`^tw-world:[a-zA-Z0-9._-]{1,128}$`)
	assetIDPattern      = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	worldFeaturePattern = regexp.MustCompile(`^tidewater\.[a-z0-9.-]+/\d+$`)
)

type vector3 [3]float64

type transform struct {
	Position vector3 `json:"position"`
	Yaw      float64 `json:"yaw"`
}

type assetRef struct {
	ID       string `json:"id"`
	Bytes    int64  `json:"bytes"`
	Kind     string `json:"kind"`
	Priority string `json:"priority"`
	Path     string `json:"path,omitempty"`
}

type worldObject struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	Label     string    `json:"label"`
	AssetID   string    `json:"assetId"`
	Transform transform `json:"transform"`
	Scale     vector3   `json:"scale"`
	Collision struct {
		Shape       string  `json:"shape"`
		Enabled     bool    `json:"enabled"`
		Center      vector3 `json:"center"`
		HalfExtents vector3 `json:"halfExtents"`
		Walkable    bool    `json:"walkable"`
		Solid       bool    `json:"solid"`
	} `json:"collision"`
}

type portal struct {
	ID          string    `json:"id"`
	Destination string    `json:"destinationWorldId"`
	PeerID      string    `json:"destinationPeerId"`
	Gateway     string    `json:"destinationGateway,omitempty"`
	Entry       transform `json:"entry"`
	Exit        transform `json:"exit"`
	OpenView    bool      `json:"openView"`
	Enabled     bool      `json:"enabled"`
}

type hostingGrant struct {
	PeerID          string   `json:"peerId"`
	Scopes          []string `json:"scopes"`
	ExpiresAt       int64    `json:"expiresAt"`
	Epoch           uint64   `json:"epoch"`
	FailoverAfter   int64    `json:"failoverAfter,omitempty"`
	FailoverSeconds int64    `json:"failoverSeconds,omitempty"`
}

type worldRules struct {
	Gravity          float64  `json:"gravity"`
	AvatarComplexity uint32   `json:"avatarComplexity"`
	PhysicsProfile   string   `json:"physicsProfile"`
	StyleGuide       string   `json:"styleGuide,omitempty"`
	RequiredFeatures []string `json:"requiredFeatures,omitempty"`
}

type worldManifest struct {
	Protocol        string         `json:"protocol"`
	WorldID         string         `json:"worldId"`
	OwnerPeerID     string         `json:"ownerPeerId"`
	AuthorityPeerID string         `json:"authorityPeerId"`
	AuthorityEpoch  uint64         `json:"authorityEpoch"`
	Discoverable    bool           `json:"discoverable"`
	Version         uint64         `json:"version"`
	Title           string         `json:"title"`
	Rules           worldRules     `json:"rules"`
	Assets          []assetRef     `json:"assets"`
	Objects         []worldObject  `json:"objects"`
	Portals         []portal       `json:"portals"`
	Hosts           []hostingGrant `json:"hosts,omitempty"`
	UpdatedAt       int64          `json:"updatedAt"`
}

func validateManifest(manifest worldManifest, localPeerID string, now time.Time) error {
	if manifest.Protocol != manifestProtocol || !worldIDPattern.MatchString(manifest.WorldID) || manifest.Version == 0 {
		return errors.New("invalid world identity or protocol")
	}
	if len(manifest.Title) == 0 || len(manifest.Title) > 160 || strings.TrimSpace(manifest.Title) != manifest.Title {
		return errors.New("invalid world title")
	}
	if manifest.Rules.Gravity < 0.2 || manifest.Rules.Gravity > 2 || math.IsNaN(manifest.Rules.Gravity) || math.IsInf(manifest.Rules.Gravity, 0) {
		return errors.New("gravity is outside the supported range")
	}
	if manifest.Rules.AvatarComplexity == 0 || manifest.Rules.AvatarComplexity > 100000 || len(manifest.Rules.PhysicsProfile) > 64 || len(manifest.Rules.StyleGuide) > 512 {
		return errors.New("invalid world rules")
	}
	if len(manifest.Rules.RequiredFeatures) > 64 {
		return errors.New("too many required world features")
	}
	seenFeatures := make(map[string]bool, len(manifest.Rules.RequiredFeatures))
	for _, feature := range manifest.Rules.RequiredFeatures {
		if len(feature) > 96 || !worldFeaturePattern.MatchString(feature) || seenFeatures[feature] {
			return errors.New("invalid or duplicate required world feature")
		}
		seenFeatures[feature] = true
	}
	if len(manifest.Assets) > 10000 || len(manifest.Objects) > 10000 || len(manifest.Portals) > 1024 || len(manifest.Hosts) > 256 {
		return errors.New("manifest contains too many entries")
	}
	permitted := manifest.OwnerPeerID == localPeerID
	if manifest.AuthorityPeerID == "" || manifest.AuthorityEpoch == 0 || manifest.AuthorityPeerID != manifest.OwnerPeerID {
		return errors.New("world authority is missing an epoch")
	}
	if _, err := peer.Decode(manifest.OwnerPeerID); err != nil {
		return errors.New("invalid owner peer identity")
	}
	if _, err := peer.Decode(manifest.AuthorityPeerID); err != nil {
		return errors.New("invalid authority peer identity")
	}
	seenHosts := make(map[string]bool, len(manifest.Hosts))
	for _, grant := range manifest.Hosts {
		if _, err := peer.Decode(grant.PeerID); err != nil || seenHosts[grant.PeerID] || grant.Epoch == 0 || grant.ExpiresAt <= 0 {
			return errors.New("invalid or duplicate hosting grant")
		}
		seenHosts[grant.PeerID] = true
		seenScopes := make(map[string]bool, len(grant.Scopes))
		for _, scope := range grant.Scopes {
			if (scope != "content-cache" && scope != "failover-authority") || seenScopes[scope] {
				return errors.New("invalid hosting grant scope")
			}
			seenScopes[scope] = true
		}
		if len(seenScopes) == 0 {
			return errors.New("hosting grant has no scopes")
		}
		if seenScopes["failover-authority"] {
			if grant.FailoverAfter <= 0 || grant.FailoverSeconds < 1 || grant.FailoverSeconds > 3600 || grant.FailoverAfter > grant.ExpiresAt-grant.FailoverSeconds {
				return errors.New("invalid failover grant window")
			}
		} else if grant.FailoverAfter != 0 || grant.FailoverSeconds != 0 {
			return errors.New("failover window without failover permission")
		}
		if grant.PeerID == localPeerID && grant.ExpiresAt > now.Unix() {
			permitted = true
		}
	}
	if !permitted {
		return errors.New("this node has no unexpired owner grant for the world")
	}
	seenAssets := make(map[string]bool, len(manifest.Assets))
	for _, asset := range manifest.Assets {
		if !assetIDPattern.MatchString(asset.ID) || seenAssets[asset.ID] || asset.Bytes < 0 || asset.Bytes > maxAssetBytes {
			return fmt.Errorf("invalid or duplicate asset %q", asset.ID)
		}
		if asset.Priority != "portal-preview" && asset.Priority != "visible" && asset.Priority != "nearby" && asset.Priority != "background" {
			return fmt.Errorf("invalid priority for asset %s", asset.ID)
		}
		seenAssets[asset.ID] = true
	}
	seenObjects := make(map[string]bool, len(manifest.Objects))
	for _, object := range manifest.Objects {
		if len(object.ID) == 0 || len(object.ID) > 128 || seenObjects[object.ID] || object.Kind != "asset-instance" || len(object.Label) > 160 || !assetIDPattern.MatchString(object.AssetID) || !seenAssets[object.AssetID] {
			return fmt.Errorf("invalid or duplicate world object %q", object.ID)
		}
		for _, coordinate := range object.Transform.Position {
			if math.IsNaN(coordinate) || math.IsInf(coordinate, 0) || math.Abs(coordinate) > 1e6 {
				return errors.New("object coordinate out of bounds")
			}
		}
		if math.IsNaN(object.Transform.Yaw) || math.IsInf(object.Transform.Yaw, 0) || math.Abs(object.Transform.Yaw) > 360 {
			return errors.New("object yaw out of bounds")
		}
		for _, scale := range object.Scale {
			if math.IsNaN(scale) || math.IsInf(scale, 0) || scale <= 0 || scale > 1000 {
				return errors.New("object scale out of bounds")
			}
		}
		if object.Collision.Shape != "box" && object.Collision.Shape != "none" {
			return errors.New("unsupported object collision shape")
		}
		if object.Collision.Enabled {
			if object.Collision.Shape != "box" {
				return errors.New("enabled object collision must use box shape")
			}
			for _, extent := range object.Collision.HalfExtents {
				if math.IsNaN(extent) || math.IsInf(extent, 0) || extent <= 0 || extent > 1000 {
					return errors.New("object collision half extents out of bounds")
				}
			}
			for _, coordinate := range object.Collision.Center {
				if math.IsNaN(coordinate) || math.IsInf(coordinate, 0) || math.Abs(coordinate) > 1e6 {
					return errors.New("object collision center out of bounds")
				}
			}
		}
		seenObjects[object.ID] = true
	}
	seenPortals := make(map[string]bool, len(manifest.Portals))
	for _, p := range manifest.Portals {
		if len(p.ID) == 0 || len(p.ID) > 128 || seenPortals[p.ID] || seenObjects[p.ID] || !worldIDPattern.MatchString(p.Destination) || p.PeerID == "" || len(p.PeerID) > 256 {
			return fmt.Errorf("invalid portal %q", p.ID)
		}
		if _, err := peer.Decode(p.PeerID); err != nil {
			return fmt.Errorf("invalid destination peer for portal %q", p.ID)
		}
		if p.Gateway != "" && !validPortalGateway(p.Gateway) {
			return fmt.Errorf("invalid destination gateway for portal %q", p.ID)
		}
		for _, t := range []transform{p.Entry, p.Exit} {
			for _, coordinate := range t.Position {
				if math.IsNaN(coordinate) || math.IsInf(coordinate, 0) || math.Abs(coordinate) > 1e6 {
					return errors.New("portal coordinate out of bounds")
				}
			}
			if math.IsNaN(t.Yaw) || math.IsInf(t.Yaw, 0) || math.Abs(t.Yaw) > 360 {
				return errors.New("portal yaw out of bounds")
			}
		}
		seenPortals[p.ID] = true
	}
	return nil
}

func validPortalGateway(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.IsAbs() && (parsed.Scheme == "https" || parsed.Scheme == "wss") && parsed.Hostname() != "" && parsed.User == nil && (parsed.Path == "" || parsed.Path == "/") && parsed.RawQuery == "" && parsed.Fragment == ""
}

func validDirectoryURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.IsAbs() && parsed.Scheme == "https" && parsed.Hostname() != "" && parsed.User == nil && (parsed.Path == "" || parsed.Path == "/") && parsed.RawQuery == "" && parsed.Fragment == ""
}

type authorityLease struct {
	WorldID         string `json:"worldId"`
	AuthorityPeerID string `json:"authorityPeerId"`
	Epoch           uint64 `json:"epoch"`
	NotBefore       int64  `json:"notBefore"`
	ExpiresAt       int64  `json:"expiresAt"`
}

func activateFailover(manifest worldManifest, delegateID string, key crypto.PrivKey, now time.Time) (signedDocument, error) {
	keyPeerID, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil || keyPeerID.String() != delegateID {
		return signedDocument{}, errors.New("failover signer does not match delegate node")
	}
	for _, grant := range manifest.Hosts {
		if grant.PeerID != delegateID || grant.ExpiresAt <= now.Unix() {
			continue
		}
		authorized := false
		for _, scope := range grant.Scopes {
			if scope == "failover-authority" {
				authorized = true
			}
		}
		if !authorized {
			continue
		}
		if now.Unix() < grant.FailoverAfter {
			return signedDocument{}, errors.New("failover grant is not active yet")
		}
		expires := min(grant.ExpiresAt, grant.FailoverAfter+grant.FailoverSeconds)
		if now.Unix() >= expires {
			return signedDocument{}, errors.New("failover grant has expired")
		}
		lease := authorityLease{WorldID: manifest.WorldID, AuthorityPeerID: delegateID, Epoch: manifest.AuthorityEpoch + 1, NotBefore: grant.FailoverAfter, ExpiresAt: expires}
		return signDocument("tidewater.authority/1", lease, key)
	}
	return signedDocument{}, errors.New("node has no failover-authority grant")
}

func failoverCheckDelay(manifest worldManifest, localID string, active *signedDocument, now time.Time) time.Duration {
	if active != nil {
		var lease authorityLease
		if json.Unmarshal(active.Payload, &lease) == nil {
			return time.Unix(lease.ExpiresAt, 0).Sub(now)
		}
	}
	for _, grant := range manifest.Hosts {
		if grant.PeerID != localID || grant.ExpiresAt <= now.Unix() {
			continue
		}
		authorized := false
		for _, scope := range grant.Scopes {
			if scope == "failover-authority" {
				authorized = true
				break
			}
		}
		if !authorized {
			continue
		}
		if now.Unix() < grant.FailoverAfter {
			return time.Unix(grant.FailoverAfter, 0).Sub(now)
		}
		end := min(grant.ExpiresAt, grant.FailoverAfter+grant.FailoverSeconds)
		if now.Unix() < end {
			return time.Unix(end, 0).Sub(now)
		}
	}
	return 0
}

func validateAuthorityLease(document signedDocument, manifest worldManifest, now time.Time) (authorityLease, error) {
	var lease authorityLease
	if err := verifyDocument(document, "tidewater.authority/1"); err != nil {
		return lease, err
	}
	if err := json.Unmarshal(document.Payload, &lease); err != nil {
		return lease, err
	}
	if lease.WorldID != manifest.WorldID || lease.AuthorityPeerID != document.Signer || lease.Epoch != manifest.AuthorityEpoch+1 || now.Unix() < lease.NotBefore || now.Unix() >= lease.ExpiresAt {
		return lease, errors.New("authority lease is not currently valid")
	}
	for _, grant := range manifest.Hosts {
		if grant.PeerID != lease.AuthorityPeerID || grant.Epoch == 0 || grant.ExpiresAt < lease.ExpiresAt || grant.FailoverAfter != lease.NotBefore {
			continue
		}
		for _, scope := range grant.Scopes {
			if scope == "failover-authority" && lease.ExpiresAt <= grant.FailoverAfter+grant.FailoverSeconds {
				return lease, nil
			}
		}
	}
	return lease, errors.New("authority lease lacks owner delegation")
}

func decodeManifest(doc signedDocument, localPeerID string, now time.Time) (worldManifest, error) {
	if err := verifyDocument(doc, manifestProtocol); err != nil {
		return worldManifest{}, err
	}
	var manifest worldManifest
	if err := json.Unmarshal(doc.Payload, &manifest); err != nil {
		return worldManifest{}, err
	}
	if doc.Signer != manifest.OwnerPeerID {
		return worldManifest{}, errors.New("manifest is not signed by its declared owner")
	}
	if err := validateManifest(manifest, localPeerID, now); err != nil {
		return worldManifest{}, err
	}
	return manifest, nil
}
