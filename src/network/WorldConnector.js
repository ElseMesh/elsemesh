import { validateWorldRequirements } from './WorldRules.js';

const ASSET_CHUNK_BYTES = 128 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const PRIORITY_ORDER = Object.freeze( [ 'portal-preview', 'visible', 'nearby', 'background' ] );

function invariant( value, message ) { if ( ! value ) throw new Error( message ); }

export function worldLinkFromLocation( location = globalThis.location ) {
	const params = new URLSearchParams( location.search );
	const worldId = params.get( 'worldId' );
	if ( ! worldId ) return null;
	return {
		worldId,
		nodeId: params.get( 'nodeId' ),
		gateway: params.get( 'gateway' ) || location.origin,
		directory: params.get( 'directory' ),
	};
}

export class WorldConnector {
	constructor( { worldId, nodeId, gateway = globalThis.location?.origin, directory = '', chunkBytes = ASSET_CHUNK_BYTES } = {} ) {
		invariant( /^tw-world:[\w.-]{1,128}$/.test( worldId || '' ), 'A valid worldId is required' );
		invariant( Number.isInteger( chunkBytes ) && chunkBytes > 0 && chunkBytes <= 192 * 1024, 'Invalid asset chunk size' );
		invariant( ! directory || validSecureOrigin( directory ), 'Directory must be an HTTPS origin' );
		this.worldId = worldId;
		this.nodeId = nodeId || '';
		this.gateway = gateway;
		this.directory = directory;
		this.chunkBytes = chunkBytes;
		this.manifest = null;
		this.assets = new Map();
		this.socket = null;
		this.webTransport = null;
		this.socketPromise = null;
		this.pending = new Map();
	}

	async getManifest() {
		let lastError = null;
		const attempted = new Set();
		if ( this.nodeId ) {
			attempted.add( `${this.nodeId}\n${this.gateway}` );
			try {
				return await this.#fetchManifest();
			} catch ( error ) {
				lastError = error;
				this.close();
				this.nodeId = '';
			}
		}
		let providers;
		try {
			providers = this.directory ? await this.#discoverDirectoryProviders() : await this.#discoverGatewayProviders();
		} catch ( error ) {
			throw lastError || error;
		}
		for ( const provider of providers ) {
			const nodeId = typeof provider === 'string' ? provider : provider.nodeId;
			const gateway = typeof provider === 'string' ? this.gateway : provider.gateway;
			const key = `${nodeId}\n${gateway}`;
			if ( attempted.has( key ) ) continue;
			attempted.add( key );
			this.nodeId = nodeId;
			this.gateway = gateway;
			try {
				return await this.#fetchManifest();
			} catch ( error ) {
				lastError = error;
				this.close();
				this.nodeId = '';
			}
		}
		throw lastError || new Error( 'No available provider could serve this world' );
	}

	async #fetchManifest() {
		const reply = await this.#request( { type: 'manifest.get' } );
		invariant( reply.type === 'manifest' && reply.document, 'World gateway returned no manifest' );
		await verifySignedDocument( reply.document, 'tidewater.world/1' );
		invariant( reply.document.payload.protocol === 'tidewater.world/1' && reply.document.payload.worldId === this.worldId, 'Manifest belongs to another world or protocol' );
		validateWorldRequirements( reply.document.payload );
		validateWorldObjects( reply.document.payload.objects );
		validateWorldHosts( reply.document.payload.hosts );
		this.manifest = reply.document.payload;
		const hostGrant = this.manifest.hosts?.find( ( entry ) => entry.peerId === this.nodeId && entry.scopes?.includes( 'content-cache' ) && entry.expiresAt > Date.now() / 1000 );
		invariant( this.manifest.ownerPeerId === this.nodeId || hostGrant, 'Selected node is not authorized by the world owner to serve content' );
		this.authorityLease = null;
		if ( reply.authorityLease ) {
			await verifySignedDocument( reply.authorityLease, 'tidewater.authority/2' );
			const lease = reply.authorityLease.payload;
			invariant( lease.worldId === this.worldId && lease.authorityPeerId === reply.authorityLease.signer && Number.isSafeInteger( lease.grantEpoch ) && lease.grantEpoch > 0 && lease.epoch > this.manifest.authorityEpoch && Date.now() / 1000 >= lease.notBefore && Date.now() / 1000 < lease.expiresAt, 'Authority lease is not valid for this world at the current time' );
			const grant = this.manifest.hosts?.find( ( entry ) => entry.peerId === lease.authorityPeerId && entry.scopes.includes( 'failover-authority' ) && entry.epoch === lease.grantEpoch && entry.failoverAfter === lease.notBefore && entry.expiresAt >= lease.expiresAt && lease.expiresAt <= entry.failoverAfter + entry.failoverSeconds );
			invariant( grant, 'Authority lease has no matching owner grant' );
			this.authorityLease = lease;
		}
		return this.manifest;
	}

	async #discoverGatewayProviders() {
		const url = new URL( '/api/lookup', this.#httpBaseURL() );
		url.searchParams.set( 'worldId', this.worldId );
		const response = await fetch( url, { credentials: 'omit', cache: 'no-store' } );
		if ( ! response.ok ) throw new Error( `World lookup failed (${response.status})` );
		const result = await response.json();
		invariant( result.worldId === this.worldId && Array.isArray( result.providers ) && result.providers.length > 0, 'No node currently advertises this world' );
		const peerIDs = [ ...new Set( result.providers.filter( ( peerId ) => typeof peerId === 'string' && /^[A-Za-z0-9]{20,256}$/.test( peerId ) ) ) ];
		invariant( peerIDs.length > 0, 'World lookup returned no valid provider identities' );
		return peerIDs;
	}

	async #discoverDirectoryProviders() {
		const url = new URL( `/v1/worlds/${encodeURIComponent( this.worldId )}`, this.directory );
		const response = await fetch( url, { credentials: 'omit', cache: 'no-store' } );
		if ( ! response.ok ) throw new Error( `World directory lookup failed (${response.status})` );
		const result = await response.json();
		invariant( Array.isArray( result.providers ) && result.providers.length > 0, 'Directory has no provider for this world' );
		const providers = [];
		for ( const document of result.providers ) {
			try { await verifySignedDocument( document, 'tidewater.node/1' ); }
			catch { continue; }
			const node = document.payload;
			const now = Date.now() / 1000;
			if ( node.protocol !== 'tidewater.node/1' || node.nodeId !== document.signer || ! node.worldIds?.includes( this.worldId ) || ! validSecureGateway( node.gateway ) || node.issuedAt > now + 300 || node.issuedAt < now - 86400 || node.expiresAt <= now || node.expiresAt > node.issuedAt + 172800 ) continue;
			providers.push( { nodeId: node.nodeId, gateway: node.gateway } );
		}
		if ( providers.length === 0 ) throw new Error( 'Directory returned no valid signed provider for this world' );
		return providers;
	}

	async getAsset( assetId, { signal } = {} ) {
		invariant( this.manifest, 'Load and verify the world manifest first' );
		if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
		const asset = this.manifest.assets.find( ( entry ) => entry.id === assetId );
		invariant( asset && /^sha256:[0-9a-f]{64}$/.test( asset.id ), 'Asset is not declared by this world' );
		invariant( Number.isSafeInteger( asset.bytes ) && asset.bytes >= 0 && asset.bytes <= MAX_ASSET_BYTES, 'Asset size is outside the supported range' );
		if ( this.assets.has( assetId ) ) return this.assets.get( assetId );
		const parts = [];
		for ( let offset = 0; offset < asset.bytes; offset += this.chunkBytes ) {
			if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
			const length = Math.min( this.chunkBytes, asset.bytes - offset );
			const reply = await this.#request( { type: 'asset.get', assetId, offset, length }, { signal } );
			invariant( reply.type === 'asset.chunk' && reply.assetId === assetId && reply.offset === offset && reply.total === asset.bytes, `Invalid asset chunk response: ${JSON.stringify( { type: reply.type, assetId: reply.assetId, offset: reply.offset, total: reply.total } )}` );
			const bytes = decodeBase64( reply.chunk );
			invariant( bytes.byteLength === length, 'Asset chunk has an unexpected length' );
			parts.push( bytes );
		}
		const bytes = concatenate( parts, asset.bytes );
		const digest = hex( await crypto.subtle.digest( 'SHA-256', bytes ) );
		invariant( `sha256:${digest}` === assetId, 'Downloaded asset failed its content hash check' );
		this.assets.set( assetId, bytes );
		return bytes;
	}

	async preload( { priorities = PRIORITY_ORDER, through = 'background', after = null, assetIDs, signal, concurrency = 3 } = {} ) {
		invariant( this.manifest, 'Load and verify the world manifest first' );
		const ranks = new Map( priorities.map( ( priority, index ) => [ priority, index ] ) );
		invariant( Number.isInteger( concurrency ) && concurrency > 0 && concurrency <= 8, 'Invalid asset concurrency' );
		const endRank = ranks.get( through );
		const startRank = after === null ? 0 : ranks.get( after ) + 1;
		invariant( endRank !== undefined && startRank !== undefined && startRank <= endRank + 1, 'Invalid asset priority range' );
		const selected = assetIDs ? new Set( assetIDs ) : null;
		const queue = this.manifest.assets.map( ( asset, index ) => ( { asset, index, rank: ranks.get( asset.priority ) ?? 999 } ) )
			.filter( ( entry ) => entry.rank >= startRank && entry.rank <= endRank && ( selected === null || selected.has( entry.asset.id ) ) )
			.sort( ( a, b ) => a.rank - b.rank || a.index - b.index );
		const loaded = new Map();
		for ( let start = 0; start < queue.length; ) {
			const rank = queue[ start ].rank;
			let end = start;
			while ( end < queue.length && queue[ end ].rank === rank ) end ++;
			const group = queue.slice( start, end );
			for ( let offset = 0; offset < group.length; offset += concurrency ) {
				if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
				const batch = group.slice( offset, offset + concurrency );
				const results = await Promise.all( batch.map( ( { asset } ) => this.getAsset( asset.id, { signal } ) ) );
				for ( let i = 0; i < batch.length; i ++ ) loaded.set( batch[ i ].asset.id, results[ i ] );
			}
			start = end;
		}
		return loaded;
	}

	// Load portal-preview content first so it can appear beyond an open doorway while
	// the assets needed to enter the destination continue loading.
	async preparePortal( portal, { onPreview } = {} ) {
		invariant( portal && portal.enabled && portal.destinationWorldId && portal.destinationPeerId, 'Portal has no active destination' );
		const destination = new WorldConnector( {
			worldId: portal.destinationWorldId,
			nodeId: portal.destinationPeerId,
			gateway: portal.destinationGateway || this.gateway,
			directory: this.directory,
			chunkBytes: this.chunkBytes,
		} );
		await destination.getManifest();
		const previewAssets = await destination.preload( { through: 'portal-preview' } );
		const preview = onPreview ? await onPreview( { connector: destination, assets: previewAssets } ) : null;
		const assets = await destination.preload( { through: 'visible' } );
		return { connector: destination, manifest: destination.manifest, assets, previewAssetIDs: new Set( previewAssets.keys() ), preview };
	}

	async #connection() {
		if ( this.webTransport?.state === 'connected' ) return { kind: 'webtransport', session: this.webTransport };
		if ( this.socket?.readyState === WebSocket.OPEN ) return { kind: 'websocket', socket: this.socket };
		if ( this.socketPromise ) return this.socketPromise;
		const promise = ( async () => {
			const base = this.#httpBaseURL();
			if ( base.protocol === 'https:' && typeof globalThis.WebTransport === 'function' ) {
				try { return await this.#openWebTransport( base ); }
				catch ( error ) {
					this.webTransport?.close();
					this.webTransport = null;
					console.info( 'WebTransport unavailable; using the WebSocket gateway.', error );
				}
			}
			return { kind: 'websocket', socket: await this.#openWebSocket( base ) };
		} )();
		this.socketPromise = promise;
		try { return await promise; }
		finally { if ( this.socketPromise === promise ) this.socketPromise = null; }
	}

	async #openWebTransport( base ) {
		const url = new URL( base );
		url.pathname = '/gateway-webtransport';
		const session = this.webTransport = new globalThis.WebTransport( url.href );
		session.closed.then( () => { if ( this.webTransport === session ) this.webTransport = null; } ).catch( () => { if ( this.webTransport === session ) this.webTransport = null; } );
		await withTimeout( session.ready, 8000, 'WebTransport connection timed out' );
		const stream = await session.createBidirectionalStream();
		await writeJSONStream( stream.writable, { type: 'connect', worldId: this.worldId, targetPeerId: this.nodeId } );
		const response = await readJSONStream( stream.readable );
		invariant( response.type === 'connected' && response.worldId === this.worldId, response.error || 'WebTransport world connection failed' );
		return { kind: 'webtransport', session };
	}

	#openWebSocket( base ) {
		return new Promise( ( resolve, reject ) => {
			const url = new URL( base );
			url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
			url.pathname = '/gateway';
			const socket = this.socket = new WebSocket( url );
			let connected = false;
			const timeout = setTimeout( () => { socket.close(); reject( new Error( 'World gateway connection timed out' ) ); }, 20000 );
			const failPending = ( error ) => {
				for ( const pending of this.pending.values() ) { clearTimeout( pending.timeout ); pending.reject( error ); }
				this.pending.clear();
			};
			socket.addEventListener( 'open', () => socket.send( JSON.stringify( { type: 'connect', worldId: this.worldId, targetPeerId: this.nodeId } ) ), { once: true } );
			socket.addEventListener( 'message', ( event ) => {
				let response;
				try { response = JSON.parse( event.data ); } catch { socket.close(); reject( new Error( 'Invalid response from world gateway' ) ); return; }
				if ( ! connected ) {
					if ( response.type !== 'connected' || response.worldId !== this.worldId ) { socket.close(); reject( new Error( response.error || 'World connection failed' ) ); return; }
					connected = true;
					clearTimeout( timeout );
					resolve( socket );
					return;
				}
				const pending = this.pending.get( response.requestId );
				if ( ! pending ) return;
				this.pending.delete( response.requestId );
				clearTimeout( pending.timeout );
				if ( response.type === 'error' ) pending.reject( new Error( response.error || response.code || 'World request failed' ) );
				else pending.resolve( response );
			} );
			socket.addEventListener( 'error', () => { clearTimeout( timeout ); reject( new Error( 'World gateway connection failed' ) ); failPending( new Error( 'World gateway connection failed' ) ); }, { once: true } );
			socket.addEventListener( 'close', () => {
				clearTimeout( timeout );
				this.socket = null;
				const error = new Error( connected ? 'World gateway connection closed' : 'World gateway closed before connecting' );
				if ( ! connected ) reject( error );
				failPending( error );
			}, { once: true } );
		} );
	}

	#httpBaseURL() {
		const url = new URL( this.gateway, globalThis.location?.href );
		if ( url.protocol === 'wss:' ) url.protocol = 'https:';
		else if ( url.protocol === 'ws:' ) url.protocol = 'http:';
		invariant( url.protocol === 'https:' || url.protocol === 'http:', 'Gateway must use HTTP(S) or WebSocket(S)' );
		if ( globalThis.location?.protocol === 'https:' && url.protocol !== 'https:' ) throw new Error( 'Secure pages require an HTTPS/WSS world gateway' );
		url.pathname = '/';
		url.search = '';
		url.hash = '';
		return url;
	}

	async #request( message, { signal } = {} ) {
		const connection = await this.#connection();
		if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
		const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
		if ( connection.kind === 'webtransport' ) return requestWebTransport( connection.session, { ...message, requestId }, signal );
		const socket = connection.socket;
		return new Promise( ( resolve, reject ) => {
			const cleanup = () => { clearTimeout( timeout ); signal?.removeEventListener( 'abort', abort ); };
			const timeout = setTimeout( () => { this.pending.delete( requestId ); cleanup(); reject( new Error( 'World request timed out' ) ); }, 30000 );
			const abort = () => { clearTimeout( timeout ); this.pending.delete( requestId ); cleanup(); reject( signal.reason || new DOMException( 'Aborted', 'AbortError' ) ); };
			this.pending.set( requestId, { resolve: ( value ) => { cleanup(); resolve( value ); }, reject: ( error ) => { cleanup(); reject( error ); }, timeout } );
			signal?.addEventListener( 'abort', abort, { once: true } );
			try { socket.send( JSON.stringify( { ...message, requestId } ) ); }
			catch ( error ) { clearTimeout( timeout ); this.pending.delete( requestId ); reject( error ); }
		} );
	}

	close() {
		this.socket?.close();
		this.webTransport?.close();
		this.socket = null;
		this.webTransport = null;
	}
}

function validateWorldObjects( objects ) {
	invariant( Array.isArray( objects ) && objects.length <= 10000, 'World manifest has an invalid object list' );
	for ( const object of objects ) {
		invariant( object?.priority === undefined || [ 'portal-preview', 'visible', 'nearby', 'background' ].includes( object.priority ), `World object ${object.id || '(unknown)'} has an invalid streaming priority` );
		if ( object?.streamingBounds !== undefined ) {
			const bounds = object.streamingBounds;
			invariant( bounds && validVector( bounds.center ) && bounds.center.every( ( value ) => Math.abs( value ) <= 10000 ) && Number.isFinite( bounds.radius ) && bounds.radius > 0 && bounds.radius <= 10000, `World object ${object.id || '(unknown)'} has invalid streaming bounds` );
		}
		if ( object?.transform?.rotation !== undefined ) {
			const rotation = object.transform.rotation;
			invariant( Array.isArray( rotation ) && rotation.length === 4 && rotation.every( Number.isFinite ) && Math.abs( Math.hypot( ...rotation ) - 1 ) <= 1e-4 && object.collision?.enabled !== true, `World object ${object.id || '(unknown)'} has an invalid quaternion transform` );
		}
		const collision = object?.collision;
		if ( collision?.enabled !== true ) continue;
		const box = collision.shape === 'box' && validVector( collision.center ) && validVector( collision.halfExtents ) && collision.halfExtents.every( ( value ) => value > 0 && value <= 1000 ) && typeof collision.walkable === 'boolean' && typeof collision.solid === 'boolean';
		const heightfield = collision.shape === 'heightfield' && Number.isInteger( collision.columns ) && Number.isInteger( collision.rows ) && collision.columns >= 2 && collision.rows >= 2 && collision.columns <= 4097 && collision.rows <= 4097 && collision.columns * collision.rows <= 4194304 && collision.walkable === true && collision.solid === true;
		invariant( box || heightfield, `World object ${object.id || '(unknown)'} has invalid collision bounds` );
	}
}

function validateWorldHosts( hosts = [] ) {
	invariant( Array.isArray( hosts ) && hosts.length <= 256, 'World manifest has an invalid host grant list' );
	const peerIDs = new Set();
	for ( const grant of hosts ) {
		invariant( grant && typeof grant.peerId === 'string' && /^[A-Za-z0-9]{20,256}$/.test( grant.peerId ) && ! peerIDs.has( grant.peerId ) && Number.isSafeInteger( grant.epoch ) && grant.epoch > 0 && Number.isSafeInteger( grant.expiresAt ) && grant.expiresAt > 0 && Array.isArray( grant.scopes ) && grant.scopes.length > 0 && grant.scopes.length <= 2 && new Set( grant.scopes ).size === grant.scopes.length && grant.scopes.every( ( scope ) => scope === 'content-cache' || scope === 'failover-authority' ), 'World manifest contains an invalid host grant' );
		const failover = grant.scopes.includes( 'failover-authority' );
		invariant( failover ? Number.isSafeInteger( grant.failoverAfter ) && grant.failoverAfter > 0 && Number.isSafeInteger( grant.failoverSeconds ) && grant.failoverSeconds >= 1 && grant.failoverSeconds <= 3600 && grant.failoverAfter <= grant.expiresAt - grant.failoverSeconds : grant.failoverAfter === undefined && grant.failoverSeconds === undefined, 'World manifest contains an invalid host grant failover window' );
		peerIDs.add( grant.peerId );
	}
}

function validVector( value ) {
	return Array.isArray( value ) && value.length === 3 && value.every( ( item ) => Number.isFinite( item ) && Math.abs( item ) <= 1e6 );
}

function validSecureOrigin( value ) {
	try {
		const url = new URL( value );
		return url.protocol === 'https:' && ! url.username && ! url.password && ( url.pathname === '' || url.pathname === '/' ) && ! url.search && ! url.hash;
	} catch {
		return false;
	}
}

function validSecureGateway( value ) {
	try {
		const url = new URL( value );
		return [ 'https:', 'wss:' ].includes( url.protocol ) && ! url.username && ! url.password && ( url.pathname === '' || url.pathname === '/' ) && ! url.search && ! url.hash;
	} catch {
		return false;
	}
}

async function requestWebTransport( session, message, signal ) {
	if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
	const stream = await session.createBidirectionalStream();
	const abort = () => { stream.writable.abort( signal.reason ).catch( () => {} ); stream.readable.cancel( signal.reason ).catch( () => {} ); };
	signal?.addEventListener( 'abort', abort, { once: true } );
	try {
		await writeJSONStream( stream.writable, message );
		const response = await withTimeout( readJSONStream( stream.readable ), 30000, 'World request timed out' );
		if ( response.type === 'error' ) throw new Error( response.error || response.code || 'World request failed' );
		invariant( response.requestId === message.requestId, 'World response does not match its request' );
		return response;
	} finally { signal?.removeEventListener( 'abort', abort ); }
}

async function writeJSONStream( writable, value ) {
	const writer = writable.getWriter();
	try { await writer.write( new TextEncoder().encode( JSON.stringify( value ) ) ); }
	finally { await writer.close(); writer.releaseLock(); }
}

async function readJSONStream( readable ) {
	const reader = readable.getReader();
	const chunks = [];
	let length = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if ( done ) break;
			length += value.byteLength;
			invariant( length <= 384 * 1024, 'World gateway response exceeds the size limit' );
			chunks.push( value );
		}
	} finally { reader.releaseLock(); }
	const bytes = new Uint8Array( length );
	let offset = 0;
	for ( const chunk of chunks ) { bytes.set( chunk, offset ); offset += chunk.byteLength; }
	return JSON.parse( new TextDecoder().decode( bytes ) );
}

function withTimeout( promise, milliseconds, message ) {
	let timeout;
	return Promise.race( [ promise, new Promise( ( _, reject ) => { timeout = setTimeout( () => reject( new Error( message ) ), milliseconds ); } ) ] ).finally( () => clearTimeout( timeout ) );
}

async function verifySignedDocument( document, protocol ) {
	invariant( document?.protocol === protocol && typeof document.signer === 'string' && typeof document.publicKey === 'string' && typeof document.signature === 'string' && document.payload, 'Invalid signed world document' );
	const protobufKey = decodeBase64( document.publicKey );
	invariant( protobufKey.length === 36 && protobufKey[ 0 ] === 8 && protobufKey[ 1 ] === 1 && protobufKey[ 2 ] === 18 && protobufKey[ 3 ] === 32, 'Unsupported world signing key' );
	invariant( peerIdFromEd25519( protobufKey ) === document.signer, 'World signer does not match its public key' );
	const unsigned = { protocol: document.protocol, signer: document.signer, publicKey: document.publicKey, payload: document.payload };
	const key = await crypto.subtle.importKey( 'raw', protobufKey.subarray( 4 ), { name: 'Ed25519' }, false, [ 'verify' ] );
	const valid = await crypto.subtle.verify( 'Ed25519', key, decodeBase64( document.signature ), new TextEncoder().encode( canonicalJSON( unsigned ) ) );
	invariant( valid, 'World signature verification failed' );
}

function canonicalJSON( value ) {
	if ( Array.isArray( value ) ) return `[${value.map( canonicalJSON ).join( ',' )}]`;
	if ( value && typeof value === 'object' ) return `{${Object.keys( value ).sort().map( ( key ) => `${canonicalString( key )}:${canonicalJSON( value[ key ] )}` ).join( ',' )}}`;
	return typeof value === 'string' ? canonicalString( value ) : JSON.stringify( value );
}

// encoding/json escapes HTML-sensitive characters and U+2028/U+2029 even in canonical payloads.
function canonicalString( value ) { return JSON.stringify( value ).replace( /[<>&\u2028\u2029]/g, ( char ) => `\\u${char.charCodeAt( 0 ).toString( 16 ).padStart( 4, '0' )}` ); }

function peerIdFromEd25519( protobufKey ) {
	const multihash = new Uint8Array( 2 + protobufKey.length );
	multihash[ 0 ] = 0; // identity multihash
	multihash[ 1 ] = protobufKey.length;
	multihash.set( protobufKey, 2 );
	return base58( multihash );
}

function base58( bytes ) {
	const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
	let value = 0n;
	for ( const byte of bytes ) value = value * 256n + BigInt( byte );
	let encoded = '';
	while ( value > 0n ) { const remainder = Number( value % 58n ); encoded = alphabet[ remainder ] + encoded; value /= 58n; }
	for ( const byte of bytes ) { if ( byte !== 0 ) break; encoded = `1${encoded}`; }
	return encoded;
}

function decodeBase64( value ) {
	const normalized = value.replace( /-/g, '+' ).replace( /_/g, '/' );
	const binary = atob( normalized + '='.repeat( ( 4 - normalized.length % 4 ) % 4 ) );
	return Uint8Array.from( binary, ( char ) => char.charCodeAt( 0 ) );
}

function concatenate( parts, length ) {
	const bytes = new Uint8Array( length );
	let offset = 0;
	for ( const part of parts ) { bytes.set( part, offset ); offset += part.length; }
	return bytes;
}

function hex( bytes ) { return Array.from( new Uint8Array( bytes ), ( byte ) => byte.toString( 16 ).padStart( 2, '0' ) ).join( '' ); }
