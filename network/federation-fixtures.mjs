import { FEDERATION_CAPABILITIES } from './federation.mjs';

const transform = (position) => ({ position, yaw: 0 });
const rules = (changes = {}) => ({ gravity: 1, avatarScale: 1, environmentScale: 1, timeOfDay: 'LOCAL', weapons: 'ALLOW', movement: ['WALK', 'RUN', 'JUMP', 'SWIM'], requiredCapabilities: ['bh.rules/1', 'bh.handoff/1'], ...changes });

export function sampleRegions(lozNodeId, edNodeId) {
  const make = (regionId, ownerPlayerId, ownerNodeId, authorityNodeId, ruleChanges = {}) => ({
    protocol: 'bh.region/1', regionId, worldId: 'bh-world:burning-horizons', version: 1,
    ownerPlayerId, ownerNodeId, admins: [], hosts: [...new Set([ownerNodeId, authorityNodeId])],
    authority: { nodeId: authorityNodeId, epoch: 1 }, rules: rules(ruleChanges), assets: [], portals: [],
    participants: { players: [], npcs: [] },
  });
  const exterior = make('bh-region:island-exterior', 'player:loz', lozNodeId, lozNodeId);
  const underneath = make('bh-region:underneath', 'player:loz', lozNodeId, lozNodeId, { timeOfDay: 'NIGHT' });
  const edWorld = make('bh-region:ed-world', 'player:ed', edNodeId, edNodeId, { gravity: 0.5, weapons: 'DISALLOW' });
  const smallWorld = make('bh-region:small-world', 'player:ed', edNodeId, edNodeId, { avatarScale: 0.2, environmentScale: 0.5 });
  const alteredPhysics = make('bh-region:altered-physics', 'player:ed', edNodeId, edNodeId, { gravity: 0.35 });
  exterior.portals = ['bh-portal:cave-entry'];
  underneath.portals = ['bh-portal:ed-door', 'bh-portal:cave-return'];
  edWorld.portals = ['bh-portal:ed-return'];
  const makePortal = (portalId, sourceRegion, destinationRegion, visual, entry, exit) => ({
    protocol: 'bh.portal/1', portalId, sourceRegion, destinationRegion, visual,
    entry: transform(entry), exit: transform(exit), enabled: true, requiredCapabilities: ['bh.portal/1', 'bh.handoff/1'],
    access: { mode: 'PUBLIC', allowPlayers: [] }, handoffPolicy: 'SIGNED', revision: 1,
  });
  // Coordinates describe protocol entry and spawn points. The live game cave remains the existing scene.
  const caveEntry = makePortal('bh-portal:cave-entry', exterior.regionId, underneath.regionId, 'CAVE', [-340, 0, 80], [-320, 1.2, 80]);
  const caveReturn = makePortal('bh-portal:cave-return', underneath.regionId, exterior.regionId, 'CAVE', [-320, 1.2, 80], [-340, 0, 80]);
  const edDoor = makePortal('bh-portal:ed-door', underneath.regionId, edWorld.regionId, 'DOOR', [-216, 1.2, -29], [0, 1, 0]);
  const edReturn = makePortal('bh-portal:ed-return', edWorld.regionId, underneath.regionId, 'DOOR', [0, 1, 1], [-216, 1.2, -29]);
  return { exterior, underneath, edWorld, smallWorld, alteredPhysics, caveEntry, caveReturn, edDoor, edReturn, capabilities: FEDERATION_CAPABILITIES };
}
