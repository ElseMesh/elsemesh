import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig( {
	// relative asset paths: the build runs from any sub-path (GitHub Pages serves it under /elsemesh/)
	base: './',
	build: { target: 'esnext', chunkSizeWarningLimit: 4000, rollupOptions: { input: { main: resolve( 'index.html' ), networkDemo: resolve( 'network-demo.html' ), playOnline: resolve( 'play-online.html' ) } } },
	server: { port: 5188, strictPort: true, host: '127.0.0.1' },
} );
