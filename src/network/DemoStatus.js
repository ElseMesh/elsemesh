// Presentation evidence only: never treat a stale or unrelated window as a peer.
export class DemoStatus {
  constructor(origin, sources, timeout = 2000) {
    this.origin = origin; this.sources = sources; this.timeout = timeout; this.states = new Map();
  }
  observe(event, now) {
    const data = event.data;
    if (event.origin !== this.origin || !data || data.type !== 'elsemesh-network-demo-status'
      || !['loz', 'ed'].includes(data.role) || event.source !== this.sources[data.role]
      || typeof data.connected !== 'boolean' || typeof data.verified !== 'boolean'
      || !Number.isSafeInteger(data.localSequence) || data.localSequence < 0
      || !Number.isSafeInteger(data.remoteSequence) || data.remoteSequence < -1) return false;
    this.states.set(data.role, { connected: data.connected, verified: data.verified, at: now });
    return true;
  }
  label(now) {
    const peers = ['loz', 'ed'].map(role => this.states.get(role));
    if (peers.some(peer => !peer)) return 'Waiting for both game viewports…';
    if (peers.some(peer => now - peer.at > this.timeout || !peer.connected)) return 'Connection lost or paused · local demo';
    return peers.every(peer => peer.verified) ? 'NETWORK VERIFIED · LOCAL ONLY' : 'Move Loz to verify both directions';
  }
}
