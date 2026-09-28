import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Interpreter } from '../src/vendor/basic-m6502/interpreter.js';
import { buildRecipe } from '../src/world/PortalInteriorRecipe.js';

test('vendored Microsoft 6502 BASIC executes an editable program', async () => {
  const output=[];
  const io={print:text=>output.push(String(text)),printLine:text=>output.push(String(text??'')),readLine:async()=>'',readChar:async()=>'',clearScreen(){},getPosition:()=>0,setPosition(){},lineLength:40,columnWidth:10};
  const basic=new Interpreter(io);
  await basic.processInput('10 FOR I=1 TO 3');
  await basic.processInput('20 PRINT I');
  await basic.processInput('30 NEXT I');
  await basic.processInput('RUN');
  assert.match(output.join('\n'),/1[\s\S]*2[\s\S]*3/);
});

test('portal warehouse retains reference detail without changing circulation zones', () => {
  const recipe=buildRecipe(), names=recipe.objects.map(object=>object.name);
  for(const expected of ['polished tiled warehouse floor','deep mezzanine front beam','rusted RSJ splice plate','subtle stair runner','stair amber tread light','near wall graffiti colour stroke','tall black houseplant pot','muted warehouse photograph','office chair chrome column','retro library timber shelf','rainbow computer club fruit band']) assert.ok(names.includes(expected),expected);
  assert.deepEqual(recipe.zones.arrival,[0,1,0]);
  assert.deepEqual(recipe.zones.retro,[-7.5,4,10]);
});

test('C64 interaction uses a modal terminal and Building 001 sign remains', async () => {
  const c64=await readFile(new URL('../src/world/C64Computer.js',import.meta.url),'utf8');
  const portal=await readFile(new URL('../src/world/PortalInterior.js',import.meta.url),'utf8');
  assert.match(c64,/COMMODORE 64/); assert.match(c64,/showModal/); assert.match(c64,/LOGIN:/);
  assert.match(c64,/commandQueue/);
  assert.match(portal,/Use Commodore 64/); assert.match(portal,/WAREHOUSE LOFT/);
});

test('Esmie waits a minute, uses faint speech and remembers Edinburgh landmarks', async () => {
  const ghost=await readFile(new URL('../src/world/WarehouseGhost.js',import.meta.url),'utf8');
  assert.match(ghost,/this\.elapsed >= 60/);
  assert.match(ghost,/this\.quoteElapsed >= 300/);
  assert.match(ghost,/utterance\.volume = \.28/);
  for(const landmark of ['Royal Mile','Calton Hill','Edinburgh Castle','Water of Leith','Greyfriars','Arthur\'s Seat','Waverley Station']) assert.match(ghost,new RegExp(landmark.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(ghost,/ship/); assert.match(ghost,/treasure/); assert.match(ghost,/Esmie, from Edinburgh/);
});
