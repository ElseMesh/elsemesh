package main

import (
	"context"
	"net"

	libp2p "github.com/libp2p/go-libp2p"
)

type zeroTierRuntime interface {
	Address() net.IP
	NodeID() string
	Libp2pOptions() []libp2p.Option
	StartBridge(context.Context, int) error
	Close() error
}
