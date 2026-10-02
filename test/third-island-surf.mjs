import assert from 'node:assert/strict';
import { buildStations } from '../src/ocean/Breakers.js';
import { thirdIslandHeight } from '../src/world/ThirdIslandLayout.js';

const terrain={heightAt(x,z){return z>400?thirdIslandHeight(x,z):-z-30;}};
const result=buildStations(terrain);
let island=0, main=0;
for(let i=0;i<result.count;i++){
 const [x,z,nx,nz]=result.data.slice(i*4,i*4+4);
 assert.ok(Math.abs(terrain.heightAt(x,z))<.002,'station must lie on the actual waterline');
 assert.ok(Math.abs(Math.hypot(nx,nz)-1)<1e-5,'normal is unit length');
 assert.ok(terrain.heightAt(x+nx,z+nz)<0,'normal points seaward');
 if(z>400)island++;else main++;
}
assert.ok(island>1000&&main>500,'both original beach and third island covered');
console.log('Shoreline zero crossings and seaward normals passed:',{main,island});
