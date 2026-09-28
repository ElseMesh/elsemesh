import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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
  for(const expected of ['polished tiled warehouse floor','deep mezzanine front beam','rusted RSJ splice plate','subtle stair runner','stair amber tread light','near wall graffiti colour stroke','tall black houseplant pot','muted warehouse photograph','office chair chrome column','retro library timber shelf','rainbow computer club fruit band','arched factory window transom','roof junction rivet','soft sofa throw','lounge floor lamp shade','kitchen under cabinet light','built in oven surround','large dining rug','dining place setting plate','dining flower head','c64 desk drawer pedestal','retro archive drawer cabinet','retro room stereo receiver','retro bookshelf speaker','near wall graffiti overspray','mezzanine leather swivel seat']) assert.ok(names.includes(expected),expected);
  assert.deepEqual(recipe.zones.arrival,[0,1,0]);
  assert.deepEqual(recipe.zones.retro,[-7.5,4,10]);
});

test('Agent Control reference-detail operation is complete and preserves protected zones', async () => {
  const recipe=buildRecipe(), names=new Set(recipe.objects.map(object=>object.name));
  const operation=JSON.parse(await readFile(new URL('../tools/portal_interior/reference-detail-v1.json',import.meta.url),'utf8'));
  assert.equal(operation.schema,'agent-control.portal-interior-reference-detail/v1');
  assert.equal(operation.governance.controller,'Agent Control');
  for(const expected of operation.expectedObjects)assert.ok(names.has(expected),expected);
  assert.deepEqual(recipe.zones.arrival,operation.protectedInvariants.arrivalZone);
  assert.deepEqual(recipe.zones.retro,operation.protectedInvariants.retroZone);
});

test('C64 interaction uses a modal terminal and Building 001 sign remains', async () => {
  const c64=await readFile(new URL('../src/world/C64Computer.js',import.meta.url),'utf8');
  const portal=await readFile(new URL('../src/world/PortalInterior.js',import.meta.url),'utf8');
  assert.match(c64,/COMMODORE 64/); assert.match(c64,/showModal/); assert.match(c64,/LOGIN:/);
  assert.match(c64,/commandQueue/);
  assert.match(portal,/Use Commodore 64/); assert.match(portal,/WAREHOUSE LOFT/);
});

test('Esmie is an internal Alba voice with no popup and remembers Edinburgh landmarks', async () => {
  const ghost=await readFile(new URL('../src/world/WarehouseGhost.js',import.meta.url),'utf8');
  const portal=await readFile(new URL('../src/world/PortalInterior.js',import.meta.url),'utf8');
  const app=await readFile(new URL('../src/App.js',import.meta.url),'utf8');
  assert.match(ghost,/this\.elapsed>=60/);
  assert.match(ghost,/this\.quoteElapsed>=300/);
  assert.match(ghost,/audio\/esmie/); assert.match(ghost,/voice\.volume=\.28/);
  assert.doesNotMatch(ghost,/createElement|caption|speechSynthesis|SpeechSynthesisUtterance|this\.active|setActive|paused/);
  assert.doesNotMatch(portal,/WarehouseGhost|this\.ghost|ghost\.setActive/);
  assert.match(app,/this\.esmie = new WarehouseGhost\( this \)/);
  assert.match(app,/this\.esmie\.update\( dt \)/);
  for(const landmark of ['Royal Mile','Calton Hill','Edinburgh Castle','Water of Leith','Greyfriars','Arthur\'s Seat','Waverley Station']) assert.match(ghost,new RegExp(landmark.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(ghost,/ship/); assert.match(ghost,/treasure/); assert.match(ghost,/Esmie, from Edinburgh/);
  const manifest=JSON.parse(await readFile(new URL('../public/audio/esmie/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.voice,'Alba'); assert.equal(manifest.serviceHost,'Sentinel'); assert.equal(manifest.records.length,8);
  assert.ok(manifest.records[0].durationSeconds>=28&&manifest.records[0].durationSeconds<=32);
  for(const record of manifest.records){const file=new URL(`../public/audio/esmie/${record.file}`,import.meta.url);assert.ok((await stat(file)).size>100000);assert.equal((await readFile(file)).subarray(0,4).toString(),'RIFF');}
});
