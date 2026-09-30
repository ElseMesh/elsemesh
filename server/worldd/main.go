package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	libp2p "github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p-kad-dht"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/core/protocol"
	"github.com/libp2p/go-libp2p/p2p/discovery/routing"
	ma "github.com/multiformats/go-multiaddr"
)

const worldProtocol protocol.ID = "/tidewater/world/1.0.0"

type stringFlags []string

func (s *stringFlags) String() string         { return strings.Join(*s, ",") }
func (s *stringFlags) Set(value string) error { *s = append(*s, value); return nil }

type daemon struct {
	ctx       context.Context
	host      host.Host
	dht       *dht.IpfsDHT
	discovery *routing.RoutingDiscovery
	manifest  signedDocument
	authority *signedDocument
	world     worldManifest
	key       crypto.PrivKey
	assetsDir string
	webRoot   string
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	defaultData := filepath.Join(configDir, "tidewater", "worldd")
	dataDir := flag.String("data", defaultData, "private daemon data directory")
	manifestPath := flag.String("manifest", "", "owner-signed world manifest JSON")
	worldName := flag.String("world-name", "Tidewater", "create a local starter manifest when none is supplied")
	listenPort := flag.Int("p2p-port", 42901, "libp2p TCP and QUIC listen port")
	httpAddress := flag.String("http", "127.0.0.1:5200", "HTTP/WebSocket gateway listen address; place behind TLS for public browser access")
	webRoot := flag.String("web-root", "", "optional built Tidewater web client directory")
	dhtMode := flag.String("dht-mode", "auto", "DHT mode: auto, client, or server")
	serveRelay := flag.Bool("relay-service", false, "allow this node to provide a bounded libp2p circuit relay")
	var bootstrap stringFlags
	var relays stringFlags
	flag.Var(&bootstrap, "bootstrap", "bootstrap peer multiaddr (repeatable)")
	flag.Var(&relays, "relay", "static relay peer multiaddr (repeatable)")
	flag.Parse()
	if *listenPort < 1 || *listenPort > 65535 {
		return errors.New("p2p-port must be between 1 and 65535")
	}
	if *dhtMode != "auto" && *dhtMode != "client" && *dhtMode != "server" {
		return errors.New("dht-mode must be auto, client, or server")
	}
	if err := os.MkdirAll(*dataDir, 0700); err != nil {
		return err
	}
	key, err := loadIdentity(filepath.Join(*dataDir, "node.key"))
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	listen := []string{fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", *listenPort), fmt.Sprintf("/ip4/0.0.0.0/udp/%d/quic-v1", *listenPort)}
	opts := []libp2p.Option{libp2p.Identity(key), libp2p.ListenAddrStrings(listen...), libp2p.EnableAutoNATv2(), libp2p.EnableHolePunching()}
	if *serveRelay {
		opts = append(opts, libp2p.EnableRelayService())
	}
	if len(relays) != 0 {
		infos, parseErr := parsePeerAddrs(relays)
		if parseErr != nil {
			return fmt.Errorf("relay address: %w", parseErr)
		}
		opts = append(opts, libp2p.EnableAutoRelayWithStaticRelays(infos))
	}
	p2pHost, err := libp2p.New(opts...)
	if err != nil {
		return fmt.Errorf("start libp2p: %w", err)
	}
	defer p2pHost.Close()

	mode := dht.ModeAuto
	if *dhtMode == "client" {
		mode = dht.ModeClient
	}
	if *dhtMode == "server" {
		mode = dht.ModeServer
	}
	router, err := dht.New(ctx, p2pHost, dht.Mode(mode), dht.ProtocolPrefix("/tidewater/kad/1.0.0"))
	if err != nil {
		return fmt.Errorf("start peer discovery: %w", err)
	}
	defer router.Close()
	bootPeers, err := parsePeerAddrs(bootstrap)
	if err != nil {
		return fmt.Errorf("bootstrap address: %w", err)
	}
	for _, info := range bootPeers {
		p2pHost.Peerstore().AddAddrs(info.ID, info.Addrs, time.Hour)
	}
	if err := router.Bootstrap(ctx); err != nil {
		log.Printf("DHT bootstrap pending: %v", err)
	}

	localID := p2pHost.ID().String()
	manifest, err := loadWorldManifest(*manifestPath, *dataDir, *worldName, localID, key)
	if err != nil {
		return err
	}
	world, err := decodeManifest(manifest, localID, time.Now())
	if err != nil {
		return fmt.Errorf("world manifest: %w", err)
	}
	d := &daemon{ctx: ctx, host: p2pHost, dht: router, discovery: routing.NewRoutingDiscovery(router), manifest: manifest, world: world, key: key, assetsDir: filepath.Join(*dataDir, "assets"), webRoot: *webRoot}
	if world.OwnerPeerID != localID {
		if lease, leaseErr := activateFailover(world, localID, key, time.Now()); leaseErr == nil {
			d.authority = &lease
			log.Printf("temporary failover authority active for %s at epoch %d", world.WorldID, world.AuthorityEpoch+1)
		}
	}
	if err := os.MkdirAll(d.assetsDir, 0700); err != nil {
		return err
	}
	p2pHost.SetStreamHandler(worldProtocol, d.handlePeerStream)
	go d.advertiseWorld()
	go d.logPeerAddresses()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", d.handleHealth)
	mux.HandleFunc("/.well-known/tidewater/node", d.handleNodeRecord)
	mux.HandleFunc("/api/lookup", d.handleLookup)
	mux.HandleFunc("/api/world/manifest", d.handleManifest)
	mux.HandleFunc("/api/assets/", d.handleAsset)
	mux.HandleFunc("/gateway", d.handleBrowserGateway)
	if d.webRoot != "" {
		mux.Handle("/", http.FileServer(http.Dir(d.webRoot)))
	}
	server := &http.Server{Addr: *httpAddress, Handler: securityHeaders(mux), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 90 * time.Second}
	serverErr := make(chan error, 1)
	go func() { serverErr <- server.ListenAndServe() }()
	log.Printf("worldd node=%s world=%s http=%s", localID, world.WorldID, *httpAddress)
	for _, addr := range p2pHost.Addrs() {
		log.Printf("p2p address %s/p2p/%s", addr, p2pHost.ID())
	}
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-serverErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func parsePeerAddrs(values []string) ([]peer.AddrInfo, error) {
	infos := make([]peer.AddrInfo, 0, len(values))
	for _, value := range values {
		addr, err := ma.NewMultiaddr(value)
		if err != nil {
			return nil, err
		}
		info, err := peer.AddrInfoFromP2pAddr(addr)
		if err != nil {
			return nil, err
		}
		infos = append(infos, *info)
	}
	return infos, nil
}

func loadWorldManifest(path, dataDir, title, owner string, key crypto.PrivKey) (signedDocument, error) {
	if path == "" {
		path = filepath.Join(dataDir, "world.json")
	}
	bytes, err := os.ReadFile(path)
	if err == nil {
		var doc signedDocument
		if len(bytes) > maxManifestBytes {
			return doc, errors.New("world manifest exceeds 1 MiB")
		}
		if err := json.Unmarshal(bytes, &doc); err != nil {
			return doc, err
		}
		return doc, nil
	}
	if !errors.Is(err, os.ErrNotExist) || path != filepath.Join(dataDir, "world.json") {
		return signedDocument{}, err
	}
	manifest := newStarterManifest(title, owner)
	doc, err := signDocument(manifestProtocol, manifest, key)
	if err != nil {
		return signedDocument{}, err
	}
	encoded, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return signedDocument{}, err
	}
	if err := os.WriteFile(path, encoded, 0600); err != nil {
		return signedDocument{}, err
	}
	return doc, nil
}

func newStarterManifest(title, owner string) worldManifest {
	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		panic(err)
	}
	return worldManifest{Protocol: manifestProtocol, WorldID: fmt.Sprintf("tw-world:%x", random[:]), OwnerPeerID: owner, AuthorityPeerID: owner, AuthorityEpoch: 1, Version: 1, Title: title,
		Rules: worldRules{Gravity: 1, AvatarComplexity: 20000, PhysicsProfile: "tidewater-default"}, Assets: []assetRef{}, Portals: []portal{}, UpdatedAt: time.Now().Unix()}
}

func (d *daemon) advertiseWorld() {
	if !d.world.Discoverable {
		return
	}
	namespace := "tidewater-world-v1:" + d.world.WorldID
	for {
		ctx, cancel := context.WithTimeout(d.ctx, 75*time.Second)
		ttl, err := d.discovery.Advertise(ctx, namespace)
		cancel()
		if err != nil {
			log.Printf("world discovery publish failed: %v", err)
			ttl = 5 * time.Minute
		}
		timer := time.NewTimer(ttl * 2 / 3)
		select {
		case <-d.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (d *daemon) logPeerAddresses() {
	<-time.After(2 * time.Second)
	for _, addr := range d.host.Addrs() {
		log.Printf("node address %s/p2p/%s", addr, d.host.ID())
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.URL.Scheme == "https" || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

func (d *daemon) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "nodeId": d.host.ID().String(), "worldId": d.world.WorldID, "protocol": manifestProtocol, "dhtPeers": len(d.host.Network().Peers())})
}

func (d *daemon) handleNodeRecord(w http.ResponseWriter, _ *http.Request) {
	addresses := make([]string, 0, len(d.host.Addrs()))
	for _, addr := range d.host.Addrs() {
		addresses = append(addresses, addr.Encapsulate(mustP2PAddr(d.host.ID())).String())
	}
	record := map[string]any{"protocol": "tidewater.node/1", "nodeId": d.host.ID().String(), "addresses": addresses, "worldIds": []string{d.world.WorldID}, "issuedAt": time.Now().Unix()}
	doc, err := signDocument("tidewater.node/1", record, d.key)
	if err != nil {
		http.Error(w, "could not sign node record", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func mustP2PAddr(id peer.ID) ma.Multiaddr {
	addr, _ := ma.NewMultiaddr("/p2p/" + id.String())
	return addr
}

func (d *daemon) handleManifest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if r.URL.Query().Get("worldId") != "" && r.URL.Query().Get("worldId") != d.world.WorldID {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30, must-revalidate")
	writeJSON(w, http.StatusOK, map[string]any{"document": d.manifest, "authorityLease": d.authority})
}

func (d *daemon) handleLookup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	worldID := r.URL.Query().Get("worldId")
	if !worldIDPattern.MatchString(worldID) {
		http.Error(w, "invalid worldId", http.StatusBadRequest)
		return
	}
	if worldID == d.world.WorldID {
		writeJSON(w, http.StatusOK, map[string]any{"worldId": worldID, "providers": []string{d.host.ID().String()}, "authority": d.world.OwnerPeerID})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	peers, err := d.discovery.FindPeers(ctx, "tidewater-world-v1:"+worldID)
	if err != nil {
		http.Error(w, "discovery unavailable", http.StatusServiceUnavailable)
		return
	}
	providers := make([]string, 0, 8)
	for info := range peers {
		if info.ID == "" || info.ID == d.host.ID() {
			continue
		}
		d.host.Peerstore().AddAddrs(info.ID, info.Addrs, time.Hour)
		providers = append(providers, info.ID.String())
		if len(providers) == 16 {
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"worldId": worldID, "providers": providers})
}

func (d *daemon) handleAsset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/assets/")
	if !assetIDPattern.MatchString(id) {
		http.Error(w, "invalid asset id", http.StatusBadRequest)
		return
	}
	if !d.manifestHasAsset(id) {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(d.assetsDir, strings.TrimPrefix(id, "sha256:"))
	f, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxAssetBytes {
		http.Error(w, "asset unavailable", http.StatusBadRequest)
		return
	}
	hash, err := hashFile(f)
	if err != nil || hash != id {
		http.Error(w, "asset hash does not match its address", http.StatusUnprocessableEntity)
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		http.Error(w, "asset unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("ETag", `"`+strings.TrimPrefix(id, "sha256:")+`"`)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Accept-Ranges", "bytes")
	http.ServeContent(w, r, id, info.ModTime(), f)
}

func (d *daemon) resolveWorldPeer(ctx context.Context, worldID, targetPeerID string) error {
	if targetPeerID == d.host.ID().String() {
		if worldID != d.world.WorldID {
			return errors.New("world_not_hosted")
		}
		return nil
	}
	peerID, err := peer.Decode(targetPeerID)
	if err != nil {
		return errors.New("invalid_target_peer")
	}
	if d.host.Network().Connectedness(peerID) == network.Connected {
		return nil
	}
	if err := d.discoverTarget(ctx, worldID, peerID); err != nil {
		return err
	}
	connectCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	return d.host.Connect(connectCtx, peer.AddrInfo{ID: peerID})
}

func hashFile(f io.Reader) (string, error) {
	hasher := sha256.New()
	if _, err := io.Copy(hasher, io.LimitReader(f, maxAssetBytes+1)); err != nil {
		return "", err
	}
	return fmt.Sprintf("sha256:%x", hasher.Sum(nil)), nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

var gatewayUpgrader = websocket.Upgrader{ReadBufferSize: 4096, WriteBufferSize: 4096, CheckOrigin: func(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	return strings.EqualFold(strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://"), r.Host)
}}

type gatewayMessage struct {
	Type         string `json:"type"`
	WorldID      string `json:"worldId,omitempty"`
	AssetID      string `json:"assetId,omitempty"`
	TargetPeerID string `json:"targetPeerId,omitempty"`
	RequestID    string `json:"requestId,omitempty"`
	Offset       int64  `json:"offset,omitempty"`
	Length       int64  `json:"length,omitempty"`
}

type peerResponse struct {
	Type           string          `json:"type"`
	WorldID        string          `json:"worldId,omitempty"`
	RequestID      string          `json:"requestId,omitempty"`
	Document       *signedDocument `json:"document,omitempty"`
	AuthorityLease *signedDocument `json:"authorityLease,omitempty"`
	AssetID        string          `json:"assetId,omitempty"`
	Offset         int64           `json:"offset,omitempty"`
	Total          int64           `json:"total,omitempty"`
	Chunk          string          `json:"chunk,omitempty"`
	Error          string          `json:"error,omitempty"`
}

func (d *daemon) handleBrowserGateway(w http.ResponseWriter, r *http.Request) {
	conn, err := gatewayUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(64 << 10)
	_ = conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	var first gatewayMessage
	if err := conn.ReadJSON(&first); err != nil || first.Type != "connect" || !worldIDPattern.MatchString(first.WorldID) {
		_ = conn.WriteJSON(map[string]string{"type": "error", "code": "world_unavailable"})
		return
	}
	if first.TargetPeerID == "" {
		first.TargetPeerID = d.host.ID().String()
	}
	if err := d.resolveWorldPeer(r.Context(), first.WorldID, first.TargetPeerID); err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "code": "world_unreachable"})
		return
	}
	_ = conn.SetReadDeadline(time.Time{})
	if err := conn.WriteJSON(map[string]any{"type": "connected", "nodeId": d.host.ID().String(), "targetPeerId": first.TargetPeerID, "worldId": first.WorldID, "manifestProtocol": manifestProtocol}); err != nil {
		return
	}
	for {
		var message gatewayMessage
		if err := conn.ReadJSON(&message); err != nil {
			return
		}
		message.WorldID = first.WorldID
		message.TargetPeerID = first.TargetPeerID
		response, err := d.gatewayRequest(r.Context(), message)
		if err != nil {
			response = peerResponse{Type: "error", WorldID: first.WorldID, RequestID: message.RequestID, Error: err.Error()}
		}
		if err := conn.WriteJSON(response); err != nil {
			return
		}
	}
}

func (d *daemon) manifestHasAsset(id string) bool {
	for _, asset := range d.world.Assets {
		if asset.ID == id {
			return true
		}
	}
	return false
}

func (d *daemon) handlePeerStream(stream network.Stream) {
	defer stream.Close()
	stream.SetReadDeadline(time.Now().Add(20 * time.Second))
	var envelope gatewayMessage
	decoder := json.NewDecoder(io.LimitReader(stream, 64<<10))
	if err := decoder.Decode(&envelope); err != nil {
		return
	}
	response, err := d.localRequest(envelope)
	if err != nil {
		response = peerResponse{Type: "error", WorldID: envelope.WorldID, RequestID: envelope.RequestID, Error: err.Error()}
	}
	stream.SetWriteDeadline(time.Now().Add(10 * time.Second))
	_ = json.NewEncoder(stream).Encode(response)
}

func (d *daemon) localRequest(request gatewayMessage) (peerResponse, error) {
	if request.WorldID != d.world.WorldID {
		return peerResponse{}, errors.New("world_not_hosted")
	}
	switch request.Type {
	case "manifest.get":
		return peerResponse{Type: "manifest", WorldID: d.world.WorldID, RequestID: request.RequestID, Document: &d.manifest, AuthorityLease: d.authority}, nil
	case "asset.get":
		return d.assetChunk(request)
	default:
		return peerResponse{}, errors.New("unsupported_request")
	}
}

func (d *daemon) gatewayRequest(ctx context.Context, request gatewayMessage) (peerResponse, error) {
	if request.TargetPeerID == d.host.ID().String() {
		return d.localRequest(request)
	}
	peerID, err := peer.Decode(request.TargetPeerID)
	if err != nil {
		return peerResponse{}, errors.New("invalid_target_peer")
	}
	if d.host.Network().Connectedness(peerID) != network.Connected {
		if err := d.discoverTarget(ctx, request.WorldID, peerID); err != nil {
			return peerResponse{}, err
		}
		connectCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
		defer cancel()
		if err := d.host.Connect(connectCtx, peer.AddrInfo{ID: peerID}); err != nil {
			return peerResponse{}, errors.New("target_peer_unreachable")
		}
	}
	streamCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	stream, err := d.host.NewStream(streamCtx, peerID, worldProtocol)
	if err != nil {
		return peerResponse{}, errors.New("target_stream_unavailable")
	}
	defer stream.Close()
	_ = stream.SetDeadline(time.Now().Add(15 * time.Second))
	if err := json.NewEncoder(stream).Encode(request); err != nil {
		return peerResponse{}, err
	}
	var response peerResponse
	if err := json.NewDecoder(io.LimitReader(stream, 384<<10)).Decode(&response); err != nil {
		return peerResponse{}, err
	}
	if response.WorldID != request.WorldID || response.RequestID != request.RequestID {
		return peerResponse{}, errors.New("target_response_mismatch")
	}
	if response.Type == "error" {
		return peerResponse{}, errors.New(response.Error)
	}
	return response, nil
}

func (d *daemon) discoverTarget(ctx context.Context, worldID string, target peer.ID) error {
	lookupCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	peers, err := d.discovery.FindPeers(lookupCtx, "tidewater-world-v1:"+worldID)
	if err != nil {
		return errors.New("world_discovery_unavailable")
	}
	for info := range peers {
		if info.ID != target {
			continue
		}
		d.host.Peerstore().AddAddrs(info.ID, info.Addrs, time.Minute)
		return nil
	}
	return errors.New("world_peer_not_found")
}

func (d *daemon) assetChunk(request gatewayMessage) (peerResponse, error) {
	if !d.manifestHasAsset(request.AssetID) {
		return peerResponse{}, errors.New("asset_not_in_manifest")
	}
	if request.Offset < 0 || request.Length < 1 || request.Length > 192<<10 {
		return peerResponse{}, errors.New("invalid_asset_range")
	}
	path := filepath.Join(d.assetsDir, strings.TrimPrefix(request.AssetID, "sha256:"))
	f, err := os.Open(path)
	if err != nil {
		return peerResponse{}, errors.New("asset_unavailable")
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxAssetBytes {
		return peerResponse{}, errors.New("asset_unavailable")
	}
	actual, err := hashFile(f)
	if err != nil || actual != request.AssetID {
		return peerResponse{}, errors.New("asset_hash_mismatch")
	}
	if request.Offset >= info.Size() && info.Size() != 0 {
		return peerResponse{}, errors.New("asset_offset_out_of_range")
	}
	if _, err := f.Seek(request.Offset, io.SeekStart); err != nil {
		return peerResponse{}, err
	}
	chunk := make([]byte, request.Length)
	n, err := io.ReadFull(f, chunk)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return peerResponse{}, err
	}
	chunk = chunk[:n]
	return peerResponse{Type: "asset.chunk", WorldID: d.world.WorldID, RequestID: request.RequestID, AssetID: request.AssetID, Offset: request.Offset, Total: info.Size(), Chunk: base64.RawStdEncoding.EncodeToString(chunk)}, nil
}
