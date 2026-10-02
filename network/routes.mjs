// Deterministic route-selection model. Probe function is injected by adapters.
// Scope prevents two unrelated RFC1918 sites being collapsed by identical IP.
export class RouteTable {
  #routes = new Map();
  set(nodeId, candidates) {
    if (!/^elsemesh-node:[0-9a-f]{64}$/.test(nodeId) || !Array.isArray(candidates) || candidates.length > 32) throw new Error('Invalid route set');
    for (const candidate of candidates) {
      if (!candidate || !['direct', 'relay'].includes(candidate.kind) || typeof candidate.address !== 'string' || typeof candidate.scope !== 'string') throw new Error('Invalid route');
    }
    this.#routes.set(nodeId, candidates.map((route) => ({ ...route })));
  }
  get(nodeId) { return this.#routes.get(nodeId)?.map((route) => ({ ...route })) ?? []; }
  async connect(nodeId, probe) {
    const routes = this.get(nodeId).sort((a, b) => Number(a.kind === 'relay') - Number(b.kind === 'relay'));
    for (const route of routes) if (await probe(route)) return { nodeId, ...route };
    throw new Error('No reachable route');
  }
}
