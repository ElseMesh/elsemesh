import { readFile } from 'node:fs/promises';
import { buildRecipe } from '../../src/world/PortalInteriorRecipe.js';

const manifestUrl = new URL('./reference-detail-v1.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const recipe = buildRecipe();
const names = new Set(recipe.objects.map(object => object.name));
const missingObjects = manifest.expectedObjects.filter(name => !names.has(name));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const checks = {
  expectedObjects: missingObjects.length === 0,
  arrivalZone: same(recipe.zones.arrival, manifest.protectedInvariants.arrivalZone),
  retroZone: same(recipe.zones.retro, manifest.protectedInvariants.retroZone),
  building001Separate: manifest.protectedInvariants.building001MustRemainSeparate === true,
  building002Separate: manifest.protectedInvariants.building002MustRemainSeparate === true,
  stairCollisionProtected: manifest.protectedInvariants.stairAndMezzanineCollisionMustRemain === true,
  c64InteractionProtected: manifest.protectedInvariants.c64InteractionMustRemain === true,
};
const passed = Object.values(checks).every(Boolean);
const evidence = {
  schema: 'agent-control.portal-interior-reference-detail-evidence/v1',
  operation: manifest.id,
  status: passed ? 'PASS' : 'FAIL',
  checks,
  missingObjects,
  measured: {
    objects: recipe.objects.length,
    materials: Object.keys(recipe.materials).length,
    lights: recipe.lights.length,
    colliders: recipe.objects.filter(object => object.collider).length,
  },
};
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (!passed) process.exitCode = 1;
