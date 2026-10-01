import assert from 'node:assert/strict';
import { alignPortalPreview, crossedPortalPlane, mapPortalCamera, portalExitClipPlane, rotatePortalVelocity } from '../src/network/PortalHandoff.js';
import { PerspectiveCamera } from '../src/engine/scene/Camera.js';
import { Vector3 } from '../src/engine/math/Vector3.js';
import { Material } from '../src/engine/render/Material.js';
import { buildMeshShader } from '../src/engine/render/MeshShader.js';
import { validateWorldSource } from '../src/network/WorldSource.js';
import { validateWorldComponents, validateWorldPortals } from '../src/network/WorldConnector.js';
import { worldLinkFromLocation, WorldConnector } from '../src/network/WorldConnector.js';
import { validateWorldRequirements } from '../src/network/WorldRules.js';
import { VEGETATION_PLACEMENT_KINDS, decodeVegetationPlacements, encodeVegetationPlacements } from '../src/network/VegetationPlacements.js';

const portal = { entry: { position: [ 0, 1, 0 ], yaw: 0 } };
assert.equal( crossedPortalPlane( { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: - 0.1 }, portal ), true, 'front-to-back crossing transfers' );
assert.equal( crossedPortalPlane( { x: 0, y: 1, z: - 1 }, { x: 0, y: 1, z: 0.1 }, portal ), false, 'back-to-front crossing does not transfer' );
assert.equal( crossedPortalPlane( { x: 2, y: 1, z: 1 }, { x: 2, y: 1, z: - 0.1 }, portal ), false, 'crossings outside the doorway width do not transfer' );
assert.equal( crossedPortalPlane( { x: 0, y: 4, z: 1 }, { x: 0, y: 4, z: - 0.1 }, portal ), false, 'crossings above the doorway do not transfer' );
assert.equal( crossedPortalPlane( { x: 1, y: 1, z: 1 }, { x: - 1, y: 1, z: - 1 }, { entry: { position: [ 0, 1, 0 ], yaw: Math.PI / 2 } } ), true, 'portal yaw rotates the entry plane' );

const velocity = rotatePortalVelocity( { x: 0, z: - 1 }, 0, Math.PI / 2 );
assert.ok( Math.abs( velocity.x + 1 ) < 1e-9 && Math.abs( velocity.z ) < 1e-9, 'velocity follows the destination orientation' );

const preview = { position: { set( x, y, z ) { this.x = x; this.y = y; this.z = z; } }, rotation: { y: 0 } };
alignPortalPreview( preview, { position: [ 10, 2, 20 ], yaw: Math.PI / 2 }, { position: [ 3, 4, 5 ], yaw: 0 } );
assert.ok( Math.abs( preview.position.x - 5 ) < 1e-9 && Math.abs( preview.position.y + 2 ) < 1e-9 && Math.abs( preview.position.z - 23 ) < 1e-9, 'preview aligns destination exit position with the local portal entry' );
assert.ok( Math.abs( preview.rotation.y - Math.PI / 2 ) < 1e-9, 'preview aligns destination exit orientation with the local portal entry' );

const sourceCamera = new PerspectiveCamera();
sourceCamera.position.set( 0, 1, 2 );
sourceCamera.rotation.y = 0;
sourceCamera.updateMatrixWorld( true );
const destinationCamera = new PerspectiveCamera();
mapPortalCamera( sourceCamera, destinationCamera, { position: [ 0, 0, 0 ], yaw: 0 }, { position: [ 10, 2, 20 ], yaw: Math.PI / 2 } );
const destinationDirection = destinationCamera.getWorldDirection( new Vector3() );
assert.ok( Math.abs( destinationCamera.position.x - 12 ) < 1e-9 && Math.abs( destinationCamera.position.y - 3 ) < 1e-9 && Math.abs( destinationCamera.position.z - 20 ) < 1e-9, 'portal camera position maps from entry coordinates into the destination' );
assert.ok( Math.abs( destinationDirection.x + 1 ) < 1e-9 && Math.abs( destinationDirection.z ) < 1e-9, 'portal camera direction rotates through the destination orientation' );
const exitClipPlane = portalExitClipPlane( { position: [ 10, 2, 20 ], yaw: Math.PI / 2 } );
const clipDistance = ( point ) => exitClipPlane[ 0 ] * point[ 0 ] + exitClipPlane[ 1 ] * point[ 1 ] + exitClipPlane[ 2 ] * point[ 2 ] + exitClipPlane[ 3 ];
assert.ok( clipDistance( [ 12, 3, 20 ] ) > 0 && clipDistance( [ 8, 3, 20 ] ) < 0, 'exit-plane clipping keeps destination-side geometry and rejects geometry on the virtual camera side' );
const clippedShader = buildMeshShader( new Material( { lit: false } ), [ { name: 'position', location: 0, wgsl: 'vec3f' } ], { kind: 'main', defines: { PORTAL_CLIP: 1 } } );
assert.match( clippedShader.code, /frame\.portalClipPlane/, 'portal render pipelines discard fragments using the per-view exit plane' );

const source = {
	protocol: 'tidewater.world-source/1', worldId: 'tw-world:source', title: 'Source',
	coordinateSystem: 'right-handed-y-up-meters', styleGuide: '',
	rules: { gravity: 1, avatarComplexity: 1000, physicsProfile: 'tidewater-default' },
	objects: [], updatedAt: '2026-09-30T12:00:00Z',
	portals: [ {
		id: 'tw-portal:door', destinationWorldId: 'tw-world:destination', destinationPeerId: '12D3KooW12345678901234567890',
		destinationGateway: 'https://world.example', entry: { position: [ 0, 0, 0 ], yaw: 0 },
		exit: { position: [ 0, 0, 0 ], yaw: 0 }, openView: true, enabled: true,
	} ],
};
assert.doesNotThrow( () => validateWorldSource( source ), 'portal may pin a separate secure destination gateway' );
assert.throws( () => validateWorldSource( { ...source, portals: [ { ...source.portals[ 0 ], destinationGateway: 'http://world.example' } ] } ), 'insecure destination gateways must be rejected' );
const runtimePortal = { id: 'tw-portal:runtime-door', destinationWorldId: 'tw-world:destination', destinationPeerId: '12D3KooW12345678901234567890', entry: { position: [ 0, 0, 0 ], yaw: 0 }, exit: { position: [ 0, 0, 0 ], yaw: 0 }, openView: true, enabled: true };
const runtimeIDs = new Set( [ 'tw-object:asset' ] );
assert.doesNotThrow( () => validateWorldPortals( [ runtimePortal ], runtimeIDs ), 'browser accepts a valid signed portal' );
assert.throws( () => validateWorldPortals( [ { ...runtimePortal, id: 'tw-object:asset' } ], new Set( [ 'tw-object:asset' ] ) ), /duplicate portal ID/, 'browser rejects cross-kind entity ID collisions' );
assert.throws( () => validateWorldPortals( [ { ...runtimePortal, destinationGateway: 'http://world.example' } ] ), /destination gateway/, 'browser rejects insecure portal gateways' );
assert.throws( () => validateWorldComponents( [ { id: 'tw-component:duplicate', type: 'tidewater.procedural-island-vegetation/1', seed: 7 } ], { requiredFeatures: [ 'tidewater.procedural-island-vegetation/1' ] }, new Set( [ 'tw-component:duplicate' ] ) ), /duplicate component ID/, 'browser rejects duplicate IDs across entity kinds' );
const islandOcean = { id: 'tw-component:island-ocean', type: 'tidewater.island-ocean/1', priority: 'portal-preview' };
assert.doesNotThrow( () => validateWorldComponents( [ islandOcean ], { requiredFeatures: [ islandOcean.type ] } ), 'browser accepts the versioned example-island ocean component' );
assert.doesNotThrow( () => validateWorldRequirements( { rules: { gravity: 1, avatarComplexity: 1, physicsProfile: 'default', requiredFeatures: [ islandOcean.type ] } } ), 'browser recognizes the example-ocean runtime capability' );
assert.throws( () => validateWorldComponents( [ { ...islandOcean, seaLevel: 3 } ], { requiredFeatures: [ islandOcean.type ] } ), /Unsupported or invalid world component/, 'browser rejects undeclared island-ocean parameters' );
assert.throws( () => validateWorldComponents( [ islandOcean, { ...islandOcean, id: 'tw-component:island-ocean-copy' } ], { requiredFeatures: [ islandOcean.type ] } ), /only one island ocean/, 'browser rejects duplicate infinite ocean components' );
const placementAssetId = `sha256:${'a'.repeat( 64 )}`;
const vegetationComponent = { id: 'tw-component:portable-vegetation', type: 'tidewater.procedural-island-vegetation/1', seed: 7, placementAssetId };
const placementAsset = [ { id: placementAssetId, kind: 'vegetation-placement/1', priority: 'portal-preview' } ];
assert.doesNotThrow( () => validateWorldComponents( [ vegetationComponent ], { requiredFeatures: [ vegetationComponent.type ] }, new Set(), placementAsset ), 'browser accepts a declared JSON placement asset available for portal preview' );
assert.throws( () => validateWorldComponents( [ vegetationComponent ], { requiredFeatures: [ vegetationComponent.type ] }, new Set(), [] ), /placement asset reference/, 'browser rejects a component that points at undeclared placement data' );
assert.throws( () => validateWorldComponents( [ { ...vegetationComponent, extra: true } ], { requiredFeatures: [ vegetationComponent.type ] }, new Set(), placementAsset ), /Unsupported or invalid world component/, 'browser rejects unknown fields on signed vegetation components' );
assert.throws( () => validateWorldSource( { ...source, rules: { ...source.rules, requiredFeatures: [ vegetationComponent.type ] }, components: [ { ...vegetationComponent, extra: true } ] } ), /Invalid or duplicate world component/, 'authoring rejects unknown fields on vegetation components' );
const portablePlacements = { villagePalms: 0, ...Object.fromEntries( VEGETATION_PLACEMENT_KINDS.map( ( kind ) => [ kind, [] ] ) ) };
const portablePlacementBytes = encodeVegetationPlacements( portablePlacements, 12345 );
assert.deepEqual( decodeVegetationPlacements( portablePlacementBytes ), portablePlacements, 'terrain-independent placement data accepts its own deterministic embedded seed' );
const staticVegetation = { id: 'tw-component:static-foliage', type: 'tidewater.static-vegetation/1', placementAssetId };
assert.doesNotThrow( () => validateWorldComponents( [ staticVegetation ], { requiredFeatures: [ staticVegetation.type ] }, new Set(), placementAsset ), 'browser accepts portable world-space foliage placements' );
assert.throws( () => validateWorldComponents( [ { id: staticVegetation.id, type: staticVegetation.type } ], { requiredFeatures: [ staticVegetation.type ] } ), /requires placement data/, 'browser requires a placement asset for static vegetation' );
assert.doesNotThrow( () => validateWorldSource( { ...source, rules: { ...source.rules, requiredFeatures: [ staticVegetation.type ] }, components: [ staticVegetation ] } ), 'authoring accepts portable static vegetation without island-only seed fields' );
const directoryLink = worldLinkFromLocation( { search: '?worldId=tw-world:coast&directory=https%3A%2F%2Fthruhold.org', origin: 'https://rebroad.github.io' } );
assert.equal( directoryLink.directory, 'https://thruhold.org', 'browser link can opt into the community directory' );
assert.throws( () => new WorldConnector( { worldId: 'tw-world:coast', directory: 'http://thruhold.org' } ), 'directory endpoints must use HTTPS' );
console.log( 'ok   portal crossing geometry and orientation handoff' );
