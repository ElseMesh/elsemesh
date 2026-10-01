# Browser WebGPU diagnostic

Open `/gpu-diagnostic/` from a secure origin (HTTPS or `http://localhost`). The page reports whether `navigator.gpu` is exposed, whether an adapter can be requested, whether device creation succeeds, and whether a small storage buffer can be allocated. Use **Copy report** to capture the JSON for debugging.

This exercises the standard WebGPU API in the page's own origin. It does not read browser internals, alter command-line flags, or bypass browser policy. A pass proves the basic adapter/device/buffer path only; it does not prove that Tidewater's shaders, scene buffers, or GPU memory budget will succeed.

For local development, start the Vite server with `npm run dev` and open `http://localhost:5189/gpu-diagnostic/`. Vite may serve this standalone HTML path directly. For a published diagnostic, deploy the page as part of the site and open the same path under HTTPS.
