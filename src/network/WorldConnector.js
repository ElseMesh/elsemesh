const ASSET_CHUNK_BYTES = 128 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const PRIORITY_ORDER = Object.freeze( [ 'portal-preview', 'visible', 'nearby', 'background' ] );

function invariant( value, message ) { if ( ! value ) throw new Error( message ); }

export function federationLink( location = globalThis.location ) {
	const params = new URLSearchParams( location.search );
	const worldId = params.get( 'worldId' );
	if ( ! worldId ) return null;
	return {
		worldId,
		nodeId: params.get( 'nodeId' ),
		gateway: params.get( 'gateway' ) || location.origin,
	};
}

export class WorldConnector {
	constructor( { worldId, nodeId, gateway = globalThis.location?.origin, chunkBytes = ASSET_CHUNK_BYTES } = {} ) {
		invariant( /^tw-world:[\w.-]{1,128}$/.test( worldId || '' ), 'A valid worldId is required' );
		invariant( Number.isInteger( chunkBytes ) && chunkBytes > 0 && chunkBytes <= 192 * 1024, 'Invalid asset chunk size' );
		this.worldId = worldId;
		this.nodeId = nodeId || '';
		this.gateway = gateway;
		this.chunkBytes = chunkBytes;
		this.manifest = null;
		this.socket = null;
		this.socketPromise = null;
		this.pending = new Map();
	}

	async getManifest() {
		if ( ! this.nodeId ) this.nodeId = await this.#discoverProvider();
		const reply = await this.#request( { type: 'manifest.get' } );
		invariant( reply.type === 'manifest' && reply.document, 'World gateway returned no manifest' );
		await verifySignedDocument( reply.document, 'tidewater.world/1' );
		invariant( reply.document.payload.worldId === this.worldId, 'Manifest belongs to another world' );
		this.manifest = reply.document.payload;
		this.authorityLease = null;
		if ( reply.authorityLease ) {
			await verifySignedDocument( reply.authorityLease, 'tidewater.authority/1' );
			const lease = reply.authorityLease.payload;
			invariant( lease.worldId === this.worldId && lease.authorityPeerId === reply.authorityLease.signer && lease.epoch > this.manifest.authorityEpoch && Date.now() / 1000 >= lease.notBefore && Date.now() / 1000 < lease.expiresAt, 'Authority lease is not valid for this world at the current time' );
			const grant = this.manifest.hosts?.find( ( entry ) => entry.peerId === lease.authorityPeerId && entry.scopes?.includes( 'failover-authority' ) && entry.failoverAfter === lease.notBefore && entry.expiresAt >= lease.expiresAt && lease.expiresAt <= entry.failoverAfter + entry.failoverSeconds );
			invariant( grant, 'Authority lease has no matching owner grant' );
			this.authorityLease = lease;
		}
		return this.manifest;
	}

	async #discoverProvider() {
		const url = new URL( '/api/lookup', this.gateway );
		url.searchParams.set( 'worldId', this.worldId );
		const response = await fetch( url, { credentials: 'omit', cache: 'no-store' } );
		if ( ! response.ok ) throw new Error( `World lookup failed (${response.status})` );
		const result = await response.json();
		invariant( Array.isArray( result.providers ) && result.providers.length > 0, 'No node currently advertises this world' );
		return result.providers[ 0 ];
	}

	async getAsset( assetId, { signal } = {} ) {
		invariant( this.manifest, 'Load and verify the world manifest first' );
		const asset = this.manifest.assets.find( ( entry ) => entry.id === assetId );
		invariant( asset && /^sha256:[0-9a-f]{64}$/.test( asset.id ), 'Asset is not declared by this world' );
		invariant( Number.isSafeInteger( asset.bytes ) && asset.bytes >= 0 && asset.bytes <= MAX_ASSET_BYTES, 'Asset size is outside the supported range' );
		const parts = [];
		for ( let offset = 0; offset < asset.bytes; offset += this.chunkBytes ) {
			if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
			const length = Math.min( this.chunkBytes, asset.bytes - offset );
			const reply = await this.#request( { type: 'asset.get', assetId, offset, length }, { signal } );
			invariant( reply.type === 'asset.chunk' && reply.assetId === assetId && reply.offset === offset && reply.total === asset.bytes, 'Invalid asset chunk response' );
			const bytes = decodeBase64( reply.chunk );
			invariant( bytes.byteLength === length, 'Asset chunk has an unexpected length' );
			parts.push( bytes );
		}
		const bytes = concatenate( parts, asset.bytes );
		const digest = hex( await crypto.subtle.digest( 'SHA-256', bytes ) );
		invariant( `sha256:${digest}` === assetId, 'Downloaded asset failed its content hash check' );
		return bytes;
	}

	async preload( priorities = PRIORITY_ORDER ) {
		invariant( this.manifest, 'Load and verify the world manifest first' );
		const ranks = new Map( priorities.map( ( priority, index ) => [ priority, index ] ) );
		const queue = this.manifest.assets.slice().sort( ( a, b ) => ( ranks.get( a.priority ) ?? 999 ) - ( ranks.get( b.priority ) ?? 999 ) );
		const loaded = new Map();
		for ( const asset of queue ) loaded.set( asset.id, await this.getAsset( asset.id ) );
		return loaded;
	}

	// Called as soon as an open portal enters view. The destination's portal-preview
	// content is loaded before the player crosses; visible/nearby detail can follow.
	async preparePortal( portal ) {
		invariant( portal && portal.enabled && portal.destinationWorldId && portal.destinationPeerId, 'Portal has no active destination' );
		const destination = new WorldConnector( {
			worldId: portal.destinationWorldId,
			nodeId: portal.destinationPeerId,
			gateway: this.gateway,
			chunkBytes: this.chunkBytes,
		} );
		await destination.getManifest();
		const preview = await destination.preload( [ 'portal-preview', 'visible' ] );
		return { connector: destination, manifest: destination.manifest, assets: preview };
	}

	async #connection() {
		if ( this.socket?.readyState === WebSocket.OPEN ) return this.socket;
		if ( this.socketPromise ) return this.socketPromise;
		this.socketPromise = new Promise( ( resolve, reject ) => {
			const url = new URL( this.gateway );
			url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol;
			invariant( url.protocol === 'wss:' || url.protocol === 'ws:', 'Gateway must use HTTP(S) or WebSocket(S)' );
			url.pathname = `${url.pathname.replace( /\/$/, '' )}/gateway`;
			url.search = '';
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
				this.socketPromise = null;
				const error = new Error( connected ? 'World gateway connection closed' : 'World gateway closed before connecting' );
				if ( ! connected ) reject( error );
				failPending( error );
			}, { once: true } );
		} );
		try { return await this.socketPromise; }
		catch ( error ) { this.socketPromise = null; throw error; }
	}

	async #request( message, { signal } = {} ) {
		const socket = await this.#connection();
		if ( signal?.aborted ) throw signal.reason || new DOMException( 'Aborted', 'AbortError' );
		const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
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
		this.socket = null;
	}
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
