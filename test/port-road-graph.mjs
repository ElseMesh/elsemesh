import assert from 'node:assert/strict';
import test from 'node:test';
import { PORT, PORT_EDGES, PORT_NODES, ROAD_CLASSES, connectedEdges, findRoadRoute, portIslandHeight, roadPosition, routePose, continuousRoutePose } from '../src/world/PortRoadGraph.js';
import { JUNCTION_TRIM, junctionBoundary, triangulateRoadBoundary } from '../src/world/PortRoadJunction.js';

test('port graph is connected with two usable loops and road hierarchy', () => {
  assert.equal(PORT_EDGES.length, 15);
  assert.equal(new Set(PORT_EDGES.map(edge => edge.roadClass)).size, 3);
  for (const id of Object.keys(PORT_NODES)) {
    assert.ok(connectedEdges(id).length >= 2, `${id} is a dead end`);
    assert.ok(findRoadRoute('gate', id)?.length || id === 'gate');
  }
  assert.ok(PORT_EDGES.length > Object.keys(PORT_NODES).length);
});

test('lane pose reverses consistently and remains inside road width', () => {
  const edge = PORT_EDGES[0];
  const outbound = routePose({ edgeId: edge.id, from: edge.from, to: edge.to }, .3);
  const inbound = routePose({ edgeId: edge.id, from: edge.to, to: edge.from }, .7);
  assert.ok(Math.hypot(outbound.x - inbound.x, outbound.z - inbound.z) < 3.31);
  assert.ok(1.65 < edge.width / 2);
  assert.equal(roadPosition(edge, 0).x, PORT_NODES[edge.from].x);
  assert.ok(ROAD_CLASSES.arterial.speed > ROAD_CLASSES.service.speed);
});

test('port land is bounded and supports road and quay locations', () => {
  assert.equal(portIslandHeight(PORT.x, PORT.z), 5);
  assert.ok(portIslandHeight(PORT_NODES.quay.x, PORT_NODES.quay.z) > 4.9);
  assert.equal(portIslandHeight(PORT.x + PORT.radiusX * 1.4, PORT.z), -90);
  for (const [x,z] of [[-127,-93],[-79.5,-127.5],[94,-120],[122,104],[-156,-43.5]])
    assert.equal(portIslandHeight(PORT.x+x,PORT.z+z),5,'occupied peripheral foundations must not float over the old beach slope');
});

test('all authored junctions triangulate and all turn centres stay on their paved footprint', () => {
  const inside = (p, polygon) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
  };
  for (const node of Object.values(PORT_NODES)) {
    const { boundary } = junctionBoundary(node, PORT_EDGES, PORT_NODES);
    assert.equal(triangulateRoadBoundary(boundary).length, (boundary.length - 2) * 3);
    const edges = connectedEdges(node.id);
    for (const incoming of edges) for (const outgoing of edges) {
      if (incoming === outgoing) continue;
      const a = { edgeId: incoming.id, from: incoming.from === node.id ? incoming.to : incoming.from, to: node.id };
      const b = { edgeId: outgoing.id, from: node.id, to: outgoing.from === node.id ? outgoing.to : outgoing.from };
      const left = continuousRoutePose(a, 1, null, b, 1.55);
      const right = continuousRoutePose(b, 0, a, null, 1.55);
      assert.ok(Math.hypot(left.x - right.x, left.z - right.z) < 1e-6);
      assert.ok(Math.abs(left.yaw - right.yaw) < 1e-6);
      for (let i = 1; i < 20; i++) {
        const p = i <= 10 ? continuousRoutePose(a, 1 - JUNCTION_TRIM / incoming.length + i / 10 * JUNCTION_TRIM / incoming.length, null, b, 1.55)
          : continuousRoutePose(b, (i - 10) / 10 * JUNCTION_TRIM / outgoing.length, a, null, 1.55);
        assert.ok(inside({ x: p.x - node.x, z: p.z - node.z }, boundary), `${node.id}: ${incoming.id} to ${outgoing.id} sample ${i}`);
      }
    }
  }
});
