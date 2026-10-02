import assert from 'node:assert/strict';
import fs from 'node:fs';

const operation = JSON.parse(fs.readFileSync(new URL('./island-biome-recreation-v1.json', import.meta.url)));
assert.equal(operation.schema, 'agent-control.outer-island-biomes/v1');
assert.equal(operation.author, 'Agent Control');
assert.equal(operation.constraints.preserveExistingWorld, true);
assert.equal(operation.islands.find(({id}) => id === 'island-five').style, 'realistic');
const cartoon = operation.islands.find(({id}) => id === 'island-four');
assert.equal(cartoon.name, 'Cartoon Island');
for (const feature of ['banana trees', 'curved banana bunches', 'articulated cartoon monkeys']) assert.ok(cartoon.features.includes(feature));
console.log('Agent Control: outer island biome recreation contract passed');
