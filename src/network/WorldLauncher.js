const STORAGE_KEY = 'elsemesh.visited-worlds.v1';
const MAX_VISITED_WORLDS = 12;
const MAX_INVITE_URL_CHARS = 4096;

function appPageURL( value ) {
	const url = new URL( value );
	if ( ! [ 'http:', 'https:' ].includes( url.protocol ) ) throw new Error( 'World links must use HTTP or HTTPS' );
	url.search = '';
	url.hash = '';
	return url;
}

function isLoopback( hostname ) {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

function validGateway( value, page ) {
	try {
		const gateway = new URL( value );
		if ( gateway.username || gateway.password || ! [ '', '/' ].includes( gateway.pathname ) || gateway.search || gateway.hash ) return false;
		if ( [ 'https:', 'wss:' ].includes( gateway.protocol ) ) return true;
		return page.protocol === 'http:' && isLoopback( page.hostname ) && [ 'http:', 'ws:' ].includes( gateway.protocol ) && isLoopback( gateway.hostname );
	} catch {
		return false;
	}
}

function normalizedWorldURL( { pageURL, worldId, nodeId = '', gateway = '', directory = '' } ) {
	const page = appPageURL( pageURL );
	if ( ! /^tw-world:[\w.-]{1,128}$/.test( worldId || '' ) ) throw new Error( 'Invite does not contain a valid world ID' );
	if ( nodeId && ! /^[A-Za-z0-9]{20,256}$/.test( nodeId ) ) throw new Error( 'Invite contains an invalid provider ID' );
	if ( gateway && ! validGateway( gateway, page ) ) throw new Error( 'Invite contains an invalid or insecure gateway' );
	if ( directory ) {
		const directoryURL = new URL( directory );
		if ( directoryURL.protocol !== 'https:' || directoryURL.username || directoryURL.password || ! [ '', '/' ].includes( directoryURL.pathname ) || directoryURL.search || directoryURL.hash ) throw new Error( 'Invite contains an invalid directory URL' );
	}
	if ( page.protocol === 'https:' && gateway && ! [ 'https:', 'wss:' ].includes( new URL( gateway ).protocol ) ) throw new Error( 'Secure pages require a secure world gateway' );
	page.searchParams.set( 'worldId', worldId );
	if ( nodeId ) page.searchParams.set( 'nodeId', nodeId );
	if ( gateway ) page.searchParams.set( 'gateway', gateway );
	if ( directory ) page.searchParams.set( 'directory', directory );
	return page;
}

export function builtInWorldURL( pageURL = globalThis.location?.href ) {
	return appPageURL( pageURL ).href;
}

export function parseWorldInviteURL( value, pageURL = globalThis.location?.href ) {
	const page = appPageURL( pageURL );
	const input = String( value ).trim();
	if ( input.length > MAX_INVITE_URL_CHARS ) throw new Error( 'Invite URL is too long' );
	let invite;
	try {
		invite = new URL( input, page );
	} catch {
		throw new Error( 'Enter a valid ElseMesh world invite URL' );
	}
	if ( ! [ 'http:', 'https:' ].includes( invite.protocol ) || invite.username || invite.password ) throw new Error( 'Enter a valid ElseMesh world invite URL' );
	const params = invite.searchParams;
	return normalizedWorldURL( {
		pageURL: page.href,
		worldId: params.get( 'worldId' ),
		nodeId: params.get( 'nodeId' ) || '',
		gateway: params.get( 'gateway' ) || '',
		directory: params.get( 'directory' ) || '',
	} ).href;
}

function getStorage( storage ) {
	if ( storage !== undefined ) return storage;
	try { return globalThis.localStorage; } catch { return null; }
}

function readVisitedWorlds( pageURL, storage ) {
	if ( ! storage ) return [];
	let raw;
	try { raw = JSON.parse( storage.getItem( STORAGE_KEY ) || '[]' ); } catch { return []; }
	if ( ! Array.isArray( raw ) ) return [];
	const visited = [];
	for ( const item of raw ) {
		if ( ! item || typeof item.url !== 'string' ) continue;
		try {
			const page = appPageURL( pageURL );
			const storedURL = new URL( item.url );
			if ( storedURL.origin !== page.origin || storedURL.pathname !== page.pathname || storedURL.username || storedURL.password ) continue;
			const url = parseWorldInviteURL( item.url, pageURL );
			const worldId = new URL( url ).searchParams.get( 'worldId' );
			const title = typeof item.title === 'string' ? item.title.trim().slice( 0, 80 ) : '';
			visited.push( { worldId, title: title || worldId, url, updatedAt: Number.isFinite( item.updatedAt ) ? item.updatedAt : 0 } );
		} catch {}
	}
	const byWorld = new Map();
	for ( const item of visited.sort( ( a, b ) => b.updatedAt - a.updatedAt ) ) if ( ! byWorld.has( item.worldId ) ) byWorld.set( item.worldId, item );
	return [ ...byWorld.values() ].slice( 0, MAX_VISITED_WORLDS );
}

export function listVisitedWorlds( { pageURL = globalThis.location?.href, storage } = {} ) {
	return readVisitedWorlds( pageURL, getStorage( storage ) );
}

export function rememberWorldVisit( { pageURL = globalThis.location?.href, worldId, nodeId = '', gateway = '', directory = '', title = '', storage, now = Date.now() } = {} ) {
	const url = normalizedWorldURL( { pageURL, worldId, nodeId, gateway, directory } ).href;
	const targetStorage = getStorage( storage );
	if ( ! targetStorage ) return false;
	const visited = readVisitedWorlds( pageURL, targetStorage ).filter( item => item.worldId !== worldId );
	visited.unshift( { worldId, title: String( title || worldId ).trim().slice( 0, 80 ), url, updatedAt: now } );
	try {
		targetStorage.setItem( STORAGE_KEY, JSON.stringify( visited.slice( 0, MAX_VISITED_WORLDS ) ) );
		return true;
	} catch {
		return false;
	}
}

export function worldLauncherStorageKey() {
	return STORAGE_KEY;
}
