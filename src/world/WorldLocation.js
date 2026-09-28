import { FOURTH, fourthIslandContains } from './FourthIslandLayout.js';
import { ISLAND_FIVE, islandFiveContains } from './IslandFiveLayout.js';
import { THIRD } from './ThirdIslandLayout.js';
import { RAIL } from './MonorailRoute.js';

// Agent Control: one deterministic location resolver feeds the HUD in every movement mode.
export function resolveWorldLocation(x, y, z, terrainHeight = -90) {
  if (fourthIslandContains(x, z, 3)) return 'Cartoon Island · Island 4';
  if (islandFiveContains(x, z)) return 'Forest Island · Island 5';
  if (Math.hypot(x - THIRD.x, z - THIRD.z) <= THIRD.radius + 22) return 'Helicopter Island · Island 3';
  if (Math.hypot(x - RAIL.island.x, z - RAIL.island.z) <= RAIL.island.radius + 8) return 'Station Island · Island 2';
  if (y < -5) return 'UNDERNEATH';
  if (terrainHeight > -2.5) return 'Home Island · Island 1';
  return 'Open Sea';
}

export function reviewCameraMinimumHeight(terrainHeight, colliderHeight, waterHeight) {
  const ground = Math.max(Number.isFinite(terrainHeight) ? terrainHeight : -90, Number.isFinite(colliderHeight) ? colliderHeight : -90);
  return ground > -2 ? ground + 1.7 : (Number.isFinite(waterHeight) ? waterHeight : 0) + 0.45;
}

export const OUTER_ISLAND_NAMES = Object.freeze({
  [FOURTH.x + ',' + FOURTH.z]: 'Cartoon Island · Island 4',
  [ISLAND_FIVE.center.x + ',' + ISLAND_FIVE.center.z]: 'Forest Island · Island 5'
});
