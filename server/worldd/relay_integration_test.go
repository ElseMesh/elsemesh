package main

import (
	"context"
	"testing"
	"time"

	libp2p "github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/peerstore"
	"github.com/libp2p/go-libp2p/p2p/protocol/ping"
	ma "github.com/multiformats/go-multiaddr"
)

func TestWorlddStaticRelayForwardsToPrivatePeer(t *testing.T) {
	relayOptions, err := worlddRelayOptions(true, nil)
	if err != nil {
		t.Fatal(err)
	}
	relay, err := libp2p.New(append([]libp2p.Option{
		libp2p.Identity(testKey(t)),
		libp2p.ForceReachabilityPublic(),
	}, relayOptions...)...)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = relay.Close() })

	if len(relay.Addrs()) == 0 {
		t.Fatal("relay has no reachable listen address")
	}
	relayAddresses := make([]string, 0, len(relay.Addrs()))
	for _, address := range relay.Addrs() {
		relayAddresses = append(relayAddresses, address.Encapsulate(ma.StringCast("/p2p/"+relay.ID().String())).String())
	}
	privateOptions, err := worlddRelayOptions(false, relayAddresses)
	if err != nil {
		t.Fatal(err)
	}
	privateHostOptions := append([]libp2p.Option{
		libp2p.Identity(testKey(t)),
		libp2p.EnableAutoNATv2(),
		libp2p.EnableHolePunching(),
	}, privateOptions...)
	privateHostOptions = append(privateHostOptions, libp2p.ForceReachabilityPrivate())
	privatePeer, err := libp2p.New(privateHostOptions...)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = privatePeer.Close() })

	client, err := libp2p.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	client.Peerstore().AddAddrs(relay.ID(), relay.Addrs(), time.Minute)
	circuitAddress := ma.StringCast("/p2p/" + relay.ID().String() + "/p2p-circuit")
	client.Peerstore().AddAddr(privatePeer.ID(), circuitAddress, peerstore.TempAddrTTL)

	deadline := time.Now().Add(10 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		result := <-ping.Ping(ctx, client, privatePeer.ID())
		cancel()
		if result.Error == nil {
			for _, connection := range client.Network().ConnsToPeer(privatePeer.ID()) {
				for _, component := range connection.RemoteMultiaddr().Protocols() {
					if component.Code == ma.P_CIRCUIT {
						return
					}
				}
			}
			t.Fatal("ping succeeded without a circuit-relay connection")
		}
		lastErr = result.Error
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("static relay did not forward to private peer within 10 seconds: %v; relay=%s, peer=%s; private-relay connections=%d", lastErr, relay.ID(), privatePeer.ID(), len(privatePeer.Network().ConnsToPeer(relay.ID())))
}
