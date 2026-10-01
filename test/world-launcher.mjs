import assert from 'node:assert/strict';
import { builtInWorldURL, listVisitedWorlds, parseWorldInviteURL, rememberWorldVisit, worldLauncherStorageKey } from '../src/network/WorldLauncher.js';

class MemoryStorage {
	items = new Map();
	getItem( key ) { return this.items.get( key ) ?? null; }
	setItem( key, value ) { this.items.set( key, value ); }
}

const pageURL = 'https://rebroad.github.io/tidewater/?worldId=tw-world:old&nodeId=old';
const peerId = '12D3KooW9fPds2JtYVx5aY6kWqRg9m9M1P2Q3R4S5T6U7V8W9XYZ';
const invite = `https://rebroad.github.io/tidewater/?worldId=tw-world%3Acave&nodeId=${peerId}&gateway=https%3A%2F%2Fworld.example&directory=https%3A%2F%2Fthruhold.org`;

assert.equal( builtInWorldURL( pageURL ), 'https://rebroad.github.io/tidewater/' );
assert.equal( parseWorldInviteURL( invite, pageURL ), invite );
assert.equal( parseWorldInviteURL( 'https://elsemesh.example/another-app/?worldId=tw-world:cave&gateway=https%3A%2F%2Fworld.example', pageURL ), 'https://rebroad.github.io/tidewater/?worldId=tw-world%3Acave&gateway=https%3A%2F%2Fworld.example' );
assert.throws( () => parseWorldInviteURL( 'https://rebroad.github.io/tidewater/?worldId=bad', pageURL ), /valid world ID/ );
assert.throws( () => parseWorldInviteURL( 'https://rebroad.github.io/tidewater/?worldId=tw-world:cave&gateway=http%3A%2F%2Fworld.example', pageURL ), /invalid or insecure gateway/ );
assert.throws( () => parseWorldInviteURL( `https://rebroad.github.io/tidewater/?worldId=tw-world:cave&padding=${'x'.repeat(4096)}`, pageURL ), /too long/ );

const localInvite = parseWorldInviteURL( 'http://127.0.0.1:5189/?worldId=tw-world:local&gateway=http%3A%2F%2F127.0.0.1%3A5222', 'http://127.0.0.1:5189/' );
assert.equal( new URL( localInvite ).searchParams.get( 'gateway' ), 'http://127.0.0.1:5222' );
assert.throws( () => parseWorldInviteURL( 'http://127.0.0.1:5189/?worldId=tw-world:local&gateway=http%3A%2F%2Fexample.com', 'http://127.0.0.1:5189/' ), /invalid or insecure gateway/ );

const storage = new MemoryStorage();
assert.equal( rememberWorldVisit( { pageURL, worldId: 'tw-world:cave', nodeId: peerId, gateway: 'https://world.example', directory: 'https://thruhold.org', title: 'LOZ Cave', storage, now: 10 } ), true );
assert.deepEqual( listVisitedWorlds( { pageURL, storage } ), [ { worldId: 'tw-world:cave', title: 'LOZ Cave', url: invite, updatedAt: 10 } ] );
rememberWorldVisit( { pageURL, worldId: 'tw-world:cave', nodeId: peerId, gateway: 'https://backup.example', title: 'LOZ Cave Updated', storage, now: 20 } );
assert.equal( listVisitedWorlds( { pageURL, storage } )[ 0 ].title, 'LOZ Cave Updated' );
assert.equal( listVisitedWorlds( { pageURL, storage } )[ 0 ].url.includes( 'backup.example' ), true );
for ( let i = 0; i < 14; i ++ ) rememberWorldVisit( { pageURL, worldId: `tw-world:test-${i}`, storage, now: 30 + i } );
assert.equal( listVisitedWorlds( { pageURL, storage } ).length, 12 );
storage.setItem( worldLauncherStorageKey(), JSON.stringify( [ { worldId: 'tw-world:external', url: 'https://evil.example/?worldId=tw-world:external' } ] ) );
assert.deepEqual( listVisitedWorlds( { pageURL, storage } ), [] );

console.log( 'world launcher routing and local visit storage passed' );
