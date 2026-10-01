package main

import (
	"bytes"
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
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
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
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"
)

const worldProtocol protocol.ID = "/tidewater/world/1.0.0"

type stringFlags []string

func (s *stringFlags) String() string         { return strings.Join(*s, ",") }
func (s *stringFlags) Set(value string) error { *s = append(*s, value); return nil }

type daemon struct {
	ctx            context.Context
	host           host.Host
	dht            *dht.IpfsDHT
	discovery      *routing.RoutingDiscovery
	manifest       signedDocument
	authorityMu    sync.RWMutex
	authority      *signedDocument
	world          worldManifest
	key            crypto.PrivKey
	assetsDir      string
	webRoot        string
	publicGateway  string
	directoryURL   string
	assetCheckMu   sync.Mutex
	verifiedAssets map[string]assetFileStamp
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
	signManifestPath := flag.String("sign-manifest", "", "validate and owner-sign an unsigned runtime world manifest, then exit")
	manifestOut := flag.String("manifest-out", "", "output path for --sign-manifest (must not already exist)")
	importAssetPath := flag.String("import-asset", "", "import one asset into the content-addressed store, print its sha256 ID, then exit")
	printNodeID := flag.Bool("print-node-id", false, "print this data directory's persistent node PeerID, then exit")
	worldName := flag.String("world-name", "My ThruHold", "create a local starter world when none is supplied")
	listenPort := flag.Int("p2p-port", 42901, "libp2p TCP and QUIC listen port")
	httpAddress := flag.String("http", "127.0.0.1:5200", "HTTP/WebSocket gateway listen address; place behind TLS for public browser access")
	webTransportAddress := flag.String("webtransport", "", "optional WebTransport HTTP/3 UDP listen address, for example :5201")
	webTransportCert := flag.String("webtransport-tls-cert", "", "TLS certificate for the optional WebTransport listener")
	webTransportKey := flag.String("webtransport-tls-key", "", "TLS private key for the optional WebTransport listener")
	webRoot := flag.String("web-root", "", "optional built ElseMesh web client directory")
	publicGateway := flag.String("public-gateway", "", "public HTTPS/WSS gateway origin included in signed node records")
	directoryURL := flag.String("directory-url", "", "optional HTTPS ElseMesh directory service URL for publishing this discoverable node")
	dhtMode := flag.String("dht-mode", "auto", "DHT mode: auto, client, or server")
	serveRelay := flag.Bool("relay-service", false, "allow this node to provide a bounded libp2p circuit relay")
	var bootstrap stringFlags
	var relays stringFlags
	var cacheFrom stringFlags
	var announceAddresses stringFlags
	flag.Var(&bootstrap, "bootstrap", "bootstrap peer multiaddr (repeatable)")
	flag.Var(&relays, "relay", "static relay peer multiaddr (repeatable)")
	flag.Var(&cacheFrom, "cache-from", "owner-authorized upstream node PeerID to seed this node's content cache (repeatable)")
	flag.Var(&announceAddresses, "announce-address", "externally reachable IP multiaddr to advertise (repeatable; useful when Android blocks interface discovery)")
	cacheSyncInterval := flag.Duration("cache-sync-interval", 5*time.Minute, "how often to retry missing owner-authorized cached assets")
	flag.Parse()
	operationCount := 0
	for _, requested := range []bool{*printNodeID, *importAssetPath != "", *signManifestPath != ""} {
		if requested {
			operationCount++
		}
	}
	if operationCount > 1 || (*manifestOut != "" && *signManifestPath == "") {
		return errors.New("use only one of --print-node-id, --import-asset, or --sign-manifest; --manifest-out requires --sign-manifest")
	}
	if *listenPort < 1 || *listenPort > 65535 {
		return errors.New("p2p-port must be between 1 and 65535")
	}
	if *dhtMode != "auto" && *dhtMode != "client" && *dhtMode != "server" {
		return errors.New("dht-mode must be auto, client, or server")
	}
	if *cacheSyncInterval < time.Second {
		return errors.New("cache-sync-interval must be at least one second")
	}
	parsedAnnounceAddresses, err := parseAnnounceAddresses(announceAddresses)
	if err != nil {
		return fmt.Errorf("announce address: %w", err)
	}
	if (*webTransportAddress == "" && (*webTransportCert != "" || *webTransportKey != "")) || (*webTransportAddress != "" && (*webTransportCert == "" || *webTransportKey == "")) {
		return errors.New("--webtransport requires both --webtransport-tls-cert and --webtransport-tls-key")
	}
	if *publicGateway != "" && !validPortalGateway(*publicGateway) {
		return errors.New("public-gateway must be a secure HTTPS/WSS origin without path, query, or credentials")
	}
	if *directoryURL != "" && (!validDirectoryURL(*directoryURL) || *publicGateway == "") {
		return errors.New("directory-url requires an HTTPS service origin and --public-gateway")
	}
	if err := os.MkdirAll(*dataDir, 0700); err != nil {
		return err
	}
	key, err := loadIdentity(filepath.Join(*dataDir, "node.key"))
	if err != nil {
		return err
	}
	localID, err := peer.IDFromPublicKey(key.GetPublic())
	if err != nil {
		return err
	}
	if *printNodeID {
		fmt.Println(localID.String())
		return nil
	}
	if *importAssetPath != "" {
		id, importErr := importAsset(*importAssetPath, filepath.Join(*dataDir, "assets"))
		if importErr != nil {
			return importErr
		}
		fmt.Println(id)
		return nil
	}
	if *signManifestPath != "" {
		if *manifestOut == "" {
			return errors.New("--manifest-out is required with --sign-manifest")
		}
		return signManifestFile(*signManifestPath, *manifestOut, localID.String(), key, time.Now())
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	listen := libp2pListenAddresses(*listenPort, parsedAnnounceAddresses)
	opts := []libp2p.Option{libp2p.Identity(key), libp2p.ListenAddrStrings(listen...), libp2p.EnableAutoNATv2(), libp2p.EnableHolePunching()}
	if len(parsedAnnounceAddresses) > 0 {
		opts = append(opts, libp2p.AddrsFactory(appendAnnouncedAddresses(parsedAnnounceAddresses)))
	}
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

	localPeerID := p2pHost.ID().String()
	manifest, err := loadWorldManifest(*manifestPath, *dataDir, *worldName, localPeerID, key)
	if err != nil {
		return err
	}
	world, err := decodeManifest(manifest, localPeerID, time.Now())
	if err != nil {
		return fmt.Errorf("world manifest: %w", err)
	}
	d := &daemon{ctx: ctx, host: p2pHost, dht: router, discovery: routing.NewRoutingDiscovery(router), manifest: manifest, world: world, key: key, assetsDir: filepath.Join(*dataDir, "assets"), webRoot: *webRoot, publicGateway: *publicGateway, directoryURL: *directoryURL, verifiedAssets: make(map[string]assetFileStamp)}
	if world.OwnerPeerID != localPeerID {
		go d.maintainFailoverAuthority()
	}
	if err := os.MkdirAll(d.assetsDir, 0700); err != nil {
		return err
	}
	cacheSources := make([]peer.ID, 0, len(cacheFrom))
	for _, value := range cacheFrom {
		id, decodeErr := peer.Decode(value)
		if decodeErr != nil || id == p2pHost.ID() {
			return fmt.Errorf("invalid --cache-from peer %q", value)
		}
		cacheSources = append(cacheSources, id)
	}
	if len(cacheSources) > 0 {
		if !d.canServeAssets(time.Now()) {
			return errors.New("--cache-from requires ownership or an active content-cache grant")
		}
		go d.syncCacheLoop(cacheSources, *cacheSyncInterval)
	}
	p2pHost.SetStreamHandler(worldProtocol, d.handlePeerStream)
	go d.advertiseWorld()
	go d.logPeerAddresses()
	if d.directoryURL != "" {
		go d.publishDirectory()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", d.handleHealth)
	mux.HandleFunc("/.well-known/tidewater/node", d.handleNodeRecord)
	mux.HandleFunc("/api/lookup", d.handleLookup)
	mux.HandleFunc("/api/world/manifest", d.handleManifest)
	mux.HandleFunc("/api/assets/", d.handleAsset)
	mux.HandleFunc("/gateway", d.handleBrowserGateway)
	var wtServer *webtransport.Server
	if *webTransportAddress != "" {
		wtServer = &webtransport.Server{H3: http3.Server{Addr: *webTransportAddress, Handler: securityHeaders(mux)}}
		mux.HandleFunc("/gateway-webtransport", func(w http.ResponseWriter, r *http.Request) {
			d.handleBrowserWebTransport(w, r, wtServer)
		})
	}
	if d.webRoot != "" {
		mux.Handle("/", http.FileServer(http.Dir(d.webRoot)))
	}
	server := &http.Server{Addr: *httpAddress, Handler: securityHeaders(mux), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 90 * time.Second}
	serverErr := make(chan error, 1)
	go func() { serverErr <- server.ListenAndServe() }()
	var webTransportErr chan error
	if wtServer != nil {
		webTransportErr = make(chan error, 1)
		go func() { webTransportErr <- wtServer.ListenAndServeTLS(*webTransportCert, *webTransportKey) }()
		log.Printf("worldd WebTransport HTTP/3 UDP listen=%s", *webTransportAddress)
	}
	log.Printf("worldd node=%s world=%s http=%s", localID, world.WorldID, *httpAddress)
	for _, addr := range p2pHost.Addrs() {
		log.Printf("p2p address %s/p2p/%s", addr, p2pHost.ID())
	}
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		httpErr := server.Shutdown(shutdownCtx)
		if wtServer != nil {
			if wtErr := wtServer.Close(); httpErr == nil {
				httpErr = wtErr
			}
		}
		return httpErr
	case err := <-serverErr:
		if wtServer != nil {
			_ = wtServer.Close()
		}
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case err := <-webTransportErr:
		_ = server.Close()
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

func parseAnnounceAddresses(values []string) ([]ma.Multiaddr, error) {
	if len(values) > 16 {
		return nil, errors.New("at most 16 announce addresses are allowed")
	}
	addresses := make([]ma.Multiaddr, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		addr, err := ma.NewMultiaddr(value)
		if err != nil {
			return nil, err
		}
		protocols := addr.Protocols()
		validShape := len(protocols) == 2 && (protocols[0].Code == ma.P_IP4 || protocols[0].Code == ma.P_IP6) && protocols[1].Code == ma.P_TCP
		validShape = validShape || len(protocols) == 3 && (protocols[0].Code == ma.P_IP4 || protocols[0].Code == ma.P_IP6) && protocols[1].Code == ma.P_UDP && protocols[2].Code == ma.P_QUIC_V1
		if !validShape {
			return nil, fmt.Errorf("%q must be an IP/TCP or IP/UDP/QUIC-v1 multiaddr without a peer ID", value)
		}
		ipText, err := addr.ValueForProtocol(protocols[0].Code)
		if err != nil {
			return nil, err
		}
		ip := net.ParseIP(ipText)
		if ip == nil || !ip.IsGlobalUnicast() {
			return nil, fmt.Errorf("%q must use a non-loopback unicast IP address", value)
		}
		canonical := addr.String()
		if !seen[canonical] {
			addresses = append(addresses, addr)
			seen[canonical] = true
		}
	}
	return addresses, nil
}

func appendAnnouncedAddresses(extra []ma.Multiaddr) func([]ma.Multiaddr) []ma.Multiaddr {
	return func(addresses []ma.Multiaddr) []ma.Multiaddr {
		result := append([]ma.Multiaddr(nil), addresses...)
		seen := make(map[string]bool, len(result)+len(extra))
		for _, address := range result {
			seen[address.String()] = true
		}
		for _, address := range extra {
			if !seen[address.String()] {
				result = append(result, address)
				seen[address.String()] = true
			}
		}
		return result
	}
}

func libp2pListenAddresses(port int, announced []ma.Multiaddr) []string {
	addresses := []string{fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", port), fmt.Sprintf("/ip4/0.0.0.0/udp/%d/quic-v1", port)}
	for _, address := range announced {
		protocols := address.Protocols()
		if len(protocols) > 0 && protocols[0].Code == ma.P_IP6 {
			addresses = append(addresses, fmt.Sprintf("/ip6/::/tcp/%d", port), fmt.Sprintf("/ip6/::/udp/%d/quic-v1", port))
			break
		}
	}
	return addresses
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
	if !d.world.Discoverable || !d.canServeAssets(time.Now()) {
		return
	}
	for {
		if d.ctx.Err() != nil || !d.canServeAssets(time.Now()) {
			return
		}
		if d.hasCompleteAssets() {
			break
		}
		timer := time.NewTimer(5 * time.Second)
		select {
		case <-d.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
	namespace := "tidewater-world-v1:" + d.world.WorldID
	for {
		if !d.canServeAssets(time.Now()) || !d.hasCompleteAssets() {
			return
		}
		ctx, cancel := context.WithTimeout(d.ctx, 75*time.Second)
		ttl, err := d.discovery.Advertise(ctx, namespace)
		cancel()
		if err != nil {
			log.Printf("world discovery publish failed: %v", err)
			ttl = 5 * time.Minute
		}
		refresh := ttl * 2 / 3
		if refresh > time.Minute {
			refresh = time.Minute
		}
		timer := time.NewTimer(refresh)
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

func (d *daemon) maintainFailoverAuthority() {
	for d.ctx.Err() == nil {
		now := time.Now()
		d.authorityMu.Lock()
		if d.authority != nil {
			if _, err := validateAuthorityLease(*d.authority, d.world, now); err != nil {
				d.authority = nil
			}
		}
		if d.authority == nil {
			if lease, err := activateFailover(d.world, d.host.ID().String(), d.key, now); err == nil {
				d.authority = &lease
				log.Printf("temporary failover authority active for %s at epoch %d", d.world.WorldID, d.world.AuthorityEpoch+1)
			}
		}
		var active *signedDocument
		if d.authority != nil {
			lease := *d.authority
			active = &lease
		}
		d.authorityMu.Unlock()

		delay := failoverCheckDelay(d.world, d.host.ID().String(), active, now)
		if delay <= 0 {
			return
		}
		timer := time.NewTimer(delay)
		select {
		case <-d.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (d *daemon) currentAuthorityLease() *signedDocument {
	d.authorityMu.Lock()
	defer d.authorityMu.Unlock()
	if d.authority == nil {
		return nil
	}
	if _, err := validateAuthorityLease(*d.authority, d.world, time.Now()); err != nil {
		d.authority = nil
		return nil
	}
	lease := *d.authority
	return &lease
}

func (d *daemon) handleNodeRecord(w http.ResponseWriter, _ *http.Request) {
	now := time.Now()
	record := map[string]any{"protocol": "tidewater.node/1", "nodeId": d.host.ID().String(), "addresses": d.peerAddresses(), "worldIds": []string{d.world.WorldID}, "gateway": d.publicGateway, "issuedAt": now.Unix(), "expiresAt": now.Add(24 * time.Hour).Unix()}
	doc, err := signDocument("tidewater.node/1", record, d.key)
	if err != nil {
		http.Error(w, "could not sign node record", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (d *daemon) publishDirectory() {
	if !d.world.Discoverable {
		log.Printf("directory publishing skipped: world %s is not marked discoverable", d.world.WorldID)
		return
	}
	client := &http.Client{Timeout: 15 * time.Second}
	for d.ctx.Err() == nil {
		if !d.canServeAssets(time.Now()) {
			log.Printf("directory publishing stopped: node is no longer authorized to serve %s", d.world.WorldID)
			return
		}
		if !d.hasCompleteAssets() {
			timer := time.NewTimer(5 * time.Minute)
			select {
			case <-d.ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
				continue
			}
		}
		published := false
		now := time.Now()
		nodeRecord := map[string]any{"protocol": "tidewater.node/1", "nodeId": d.host.ID().String(), "addresses": d.peerAddresses(), "worldIds": []string{d.world.WorldID}, "gateway": d.publicGateway, "issuedAt": now.Unix(), "expiresAt": now.Add(24 * time.Hour).Unix()}
		nodeDocument, err := signDocument("tidewater.node/1", nodeRecord, d.key)
		if err == nil {
			body, marshalErr := json.Marshal(map[string]any{"node": nodeDocument, "manifest": d.manifest})
			if marshalErr == nil {
				ctx, cancel := context.WithTimeout(d.ctx, 15*time.Second)
				request, requestErr := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(d.directoryURL, "/")+"/v1/announce", bytes.NewReader(body))
				if requestErr == nil {
					request.Header.Set("Content-Type", "application/json")
					response, postErr := client.Do(request)
					if postErr != nil {
						log.Printf("directory publish failed: %v", postErr)
					} else {
						response.Body.Close()
						if response.StatusCode == http.StatusAccepted {
							published = true
						} else {
							log.Printf("directory publish rejected: HTTP %d", response.StatusCode)
						}
					}
				} else {
					log.Printf("directory publish request failed: %v", requestErr)
				}
				cancel()
			} else {
				log.Printf("directory publish encode failed: %v", marshalErr)
			}
		} else {
			log.Printf("directory node record signing failed: %v", err)
		}
		interval := 5 * time.Minute
		if published {
			interval = 12 * time.Hour
		}
		timer := time.NewTimer(interval)
		select {
		case <-d.ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (d *daemon) peerAddresses() []string {
	addresses := make([]string, 0, len(d.host.Addrs()))
	for _, addr := range d.host.Addrs() {
		addresses = append(addresses, addr.Encapsulate(mustP2PAddr(d.host.ID())).String())
	}
	return addresses
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
	writeJSON(w, http.StatusOK, map[string]any{"document": d.manifest, "authorityLease": d.currentAuthorityLease()})
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
	localCanServe := worldID == d.world.WorldID && d.canServeAssets(time.Now()) && d.hasCompleteAssets()
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	peers, err := d.discovery.FindPeers(ctx, "tidewater-world-v1:"+worldID)
	if err != nil {
		if localCanServe {
			writeJSON(w, http.StatusOK, map[string]any{"worldId": worldID, "providers": []string{d.host.ID().String()}, "authority": d.world.OwnerPeerID})
			return
		}
		http.Error(w, "discovery unavailable", http.StatusServiceUnavailable)
		return
	}
	discovered := make([]peer.AddrInfo, 0, 16)
	for info := range peers {
		discovered = append(discovered, info)
		if len(discovered) == 32 {
			break
		}
	}
	providers := collectProviders(d.host.ID(), localCanServe, discovered, 16)
	for _, info := range discovered {
		if info.ID != "" && info.ID != d.host.ID() {
			d.host.Peerstore().AddAddrs(info.ID, info.Addrs, time.Hour)
		}
	}
	result := map[string]any{"worldId": worldID, "providers": providers}
	if worldID == d.world.WorldID {
		result["authority"] = d.world.OwnerPeerID
	}
	writeJSON(w, http.StatusOK, result)
}

func collectProviders(local peer.ID, localCanServe bool, discovered []peer.AddrInfo, limit int) []string {
	if limit <= 0 {
		return []string{}
	}
	providers := make([]string, 0, min(limit, len(discovered)+1))
	seen := make(map[peer.ID]bool, len(discovered)+1)
	if localCanServe && local != "" {
		providers = append(providers, local.String())
		seen[local] = true
	}
	for _, info := range discovered {
		if info.ID == "" || seen[info.ID] || (info.ID == local && !localCanServe) {
			continue
		}
		providers = append(providers, info.ID.String())
		seen[info.ID] = true
		if len(providers) == limit {
			break
		}
	}
	return providers
}

func (d *daemon) handleAsset(w http.ResponseWriter, r *http.Request) {
	if !d.canServeAssets(time.Now()) {
		http.Error(w, "this node is not authorized to cache world content", http.StatusForbidden)
		return
	}
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
	asset, ok := d.assetRef(id)
	if err != nil || !ok || !info.Mode().IsRegular() || info.Size() != asset.Bytes {
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
	if len(d.host.Peerstore().Addrs(peerID)) == 0 {
		if err := d.discoverTarget(ctx, worldID, peerID); err != nil {
			return err
		}
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
	Offset         int64           `json:"offset"`
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
	requestCtx, cancelRequests := context.WithCancel(r.Context())
	var requestGroup sync.WaitGroup
	var writeMu sync.Mutex
	requestSlots := make(chan struct{}, 3)
	defer func() {
		cancelRequests()
		requestGroup.Wait()
	}()
	for {
		var message gatewayMessage
		if err := conn.ReadJSON(&message); err != nil {
			return
		}
		message.WorldID = first.WorldID
		message.TargetPeerID = first.TargetPeerID
		requestSlots <- struct{}{}
		requestGroup.Add(1)
		go func(message gatewayMessage) {
			defer requestGroup.Done()
			defer func() { <-requestSlots }()
			response, err := d.gatewayRequest(requestCtx, message)
			if err != nil {
				response = peerResponse{Type: "error", WorldID: first.WorldID, RequestID: message.RequestID, Error: err.Error()}
			}
			writeMu.Lock()
			writeErr := conn.WriteJSON(response)
			writeMu.Unlock()
			if writeErr != nil {
				cancelRequests()
				_ = conn.Close()
			}
		}(message)
	}
}

func (d *daemon) manifestHasAsset(id string) bool {
	_, ok := d.assetRef(id)
	return ok
}

func (d *daemon) assetRef(id string) (assetRef, bool) {
	for _, asset := range d.world.Assets {
		if asset.ID == id {
			return asset, true
		}
	}
	return assetRef{}, false
}

func (d *daemon) hasCompleteAssets() bool {
	for _, asset := range d.world.Assets {
		if !d.hasVerifiedAsset(asset) {
			return false
		}
	}
	return true
}

func (d *daemon) canServeAssets(now time.Time) bool {
	return canServeWorldAssets(d.world, d.host.ID().String(), now)
}

func canServeWorldAssets(manifest worldManifest, localID string, now time.Time) bool {
	if manifest.OwnerPeerID == localID {
		return true
	}
	for _, grant := range manifest.Hosts {
		if grant.PeerID != localID || grant.ExpiresAt <= now.Unix() {
			continue
		}
		for _, scope := range grant.Scopes {
			if scope == "content-cache" {
				return true
			}
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
		return peerResponse{Type: "manifest", WorldID: d.world.WorldID, RequestID: request.RequestID, Document: &d.manifest, AuthorityLease: d.currentAuthorityLease()}, nil
	case "asset.get":
		if !d.canServeAssets(time.Now()) {
			return peerResponse{}, errors.New("content_cache_not_authorized")
		}
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
		if len(d.host.Peerstore().Addrs(peerID)) == 0 {
			if err := d.discoverTarget(ctx, request.WorldID, peerID); err != nil {
				return peerResponse{}, err
			}
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
	asset, ok := d.assetRef(request.AssetID)
	if !ok {
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
	if err != nil || !info.Mode().IsRegular() || info.Size() != asset.Bytes {
		return peerResponse{}, errors.New("asset_unavailable")
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
