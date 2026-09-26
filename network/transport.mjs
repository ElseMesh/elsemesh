// Contract for replaceable transport adapters. Implementations report route, not identity.
export class NetworkTransport {
  async start_node() { throw new Error('Not implemented'); }
  async stop_node() { throw new Error('Not implemented'); }
  node_id() { throw new Error('Not implemented'); }
  async discover_peer() { throw new Error('Not implemented'); }
  async connect_peer() { throw new Error('Not implemented'); }
  async disconnect_peer() { throw new Error('Not implemented'); }
  async open_stream() { throw new Error('Not implemented'); }
  async send_reliable() { throw new Error('Not implemented'); }
  async send_unreliable() { throw new Error('Not implemented'); }
  async advertise_service() { throw new Error('Not implemented'); }
  async discover_service() { throw new Error('Not implemented'); }
  connection_metrics() { throw new Error('Not implemented'); }
  is_direct() { throw new Error('Not implemented'); }
  relay_path() { throw new Error('Not implemented'); }
  local_addresses() { throw new Error('Not implemented'); }
  observed_addresses() { throw new Error('Not implemented'); }
}
