import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

const commitSha = execFileSync( 'git', [ 'rev-parse', 'HEAD' ], { encoding: 'utf8' } ).trim();
if ( ! /^[\da-f]{40}$/i.test( commitSha ) ) throw new Error( 'Git HEAD must be a full 40-character commit SHA' );
const commitShort = commitSha.slice( 0, 8 ).toLowerCase();

export default defineConfig( {
	// relative asset paths: the build runs from any sub-path (GitHub Pages serves it under /tidewater/)
	base: './',
	plugins: [ {
		name: 'elsemesh-build-commit',
		transformIndexHtml( html ) {
			if ( ! html.includes( '%ELSEMESH_COMMIT%' ) ) throw new Error( 'Build commit placeholder is missing from index.html' );
			return html.replaceAll( '%ELSEMESH_COMMIT%', commitShort );
		},
	} ],
	build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
	server: { port: 5188, strictPort: true, host: '127.0.0.1' },
} );
