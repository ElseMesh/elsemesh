package main

import (
    "bufio"
    "context"
    "encoding/json"
    "flag"
    "fmt"
    "io"
    "os"
    "path/filepath"
    "time"

    libp2p "github.com/libp2p/go-libp2p"
    crypto "github.com/libp2p/go-libp2p/core/crypto"
    network "github.com/libp2p/go-libp2p/core/network"
    peer "github.com/libp2p/go-libp2p/core/peer"
    protocol "github.com/libp2p/go-libp2p/core/protocol"
    ma "github.com/multiformats/go-multiaddr"
)

const proto = protocol.ID("/burning-horizons/qualify/1.0.0")

type sample struct { Kind string `json:"kind"`; Data string `json:"data"`; Time int64 `json:"time"` }

func loadKey(path string) (crypto.PrivKey, error) {
    if bytes, err := os.ReadFile(path); err == nil { return crypto.UnmarshalPrivateKey(bytes) }
    key, _, err := crypto.GenerateEd25519Key(nil)
    if err != nil { return nil, err }
    bytes, err := crypto.MarshalPrivateKey(key)
    if err != nil { return nil, err }
    if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil { return nil, err }
    if err := os.WriteFile(path, bytes, 0600); err != nil { return nil, err }
    return key, nil
}

func main() {
    mode := flag.String("mode", "serve", "serve or probe")
    keyPath := flag.String("key", "", "private key path outside repository")
    port := flag.Int("port", 42901, "QUIC UDP port")
    target := flag.String("target", "", "remote /ip4/.../udp/.../quic-v1/p2p/... multiaddr")
    flag.Parse()
    if *keyPath == "" { panic("-key required") }
    key, err := loadKey(*keyPath)
    if err != nil { panic(err) }
    host, err := libp2p.New(libp2p.Identity(key), libp2p.ListenAddrStrings(fmt.Sprintf("/ip4/0.0.0.0/udp/%d/quic-v1", *port)))
    if err != nil { panic(err) }
    defer host.Close()
    host.SetStreamHandler(proto, func(stream network.Stream) {
        defer stream.Close()
        reader := bufio.NewReader(io.LimitReader(stream, 1<<20))
        writer := bufio.NewWriter(stream)
        for {
            line, err := reader.ReadBytes('\n')
            if err != nil { return }
            if len(line) > 65536 { return }
            if _, err = writer.Write(line); err != nil { return }
            if err = writer.Flush(); err != nil { return }
        }
    })
    fmt.Printf("{\"event\":\"listening\",\"peerId\":%q,\"port\":%d}\n", host.ID().String(), *port)
    if *mode == "serve" { select {} }
    if *target == "" { panic("-target required for probe") }
    addr, err := ma.NewMultiaddr(*target)
    if err != nil { panic(err) }
    info, err := peer.AddrInfoFromP2pAddr(addr)
    if err != nil { panic(err) }
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    start := time.Now()
    if err = host.Connect(ctx, *info); err != nil { panic(err) }
    established := time.Since(start)
    stream, err := host.NewStream(ctx, info.ID, proto)
    if err != nil { panic(err) }
    defer stream.Close()
    reader := bufio.NewReader(stream)
    writer := bufio.NewWriter(stream)
    var rtts []float64
    for i := 0; i < 8; i++ {
        payload, _ := json.Marshal(sample{Kind: "ping", Data: fmt.Sprintf("%d", i), Time: time.Now().UnixNano()})
        sent := time.Now()
        writer.Write(payload); writer.WriteByte('\n'); writer.Flush()
        line, err := reader.ReadBytes('\n')
        if err != nil { panic(err) }
        var reply sample
        if err := json.Unmarshal(line, &reply); err != nil || reply.Data != fmt.Sprintf("%d", i) { panic("bad echo") }
        rtts = append(rtts, float64(time.Since(sent).Microseconds())/1000)
    }
    // Same bounded asset and manifest message sizes as the reference workload.
    for _, kind := range []string{"asset-request", "asset-reply", "manifest", "handoff"} {
        payload, _ := json.Marshal(sample{Kind: kind, Data: "Burning Horizons bounded transport qualification", Time: time.Now().UnixNano()})
        writer.Write(payload); writer.WriteByte('\n'); writer.Flush()
        line, err := reader.ReadBytes('\n')
        if err != nil { panic(err) }
        var reply sample
        if err := json.Unmarshal(line, &reply); err != nil || reply.Kind != kind { panic("bad workload echo") }
    }
    conn := host.Network().ConnsToPeer(info.ID)[0]
    result := map[string]any{"event":"probe-complete", "transport":"libp2p-quic", "peerId":host.ID().String(), "remotePeerId":info.ID.String(), "establishedMs":float64(established.Microseconds())/1000, "rttMs":rtts, "remoteMultiaddr":conn.RemoteMultiaddr().String(), "security":conn.ConnState().Security, "streamMuxer":conn.ConnState().StreamMultiplexer}
    json.NewEncoder(os.Stdout).Encode(result)
}
