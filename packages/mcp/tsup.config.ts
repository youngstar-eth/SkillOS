import { defineConfig } from 'tsup';

// ESM bundle for both the bin entry and the server module (so library
// consumers — e.g. a hosted MCP gateway — can import buildServer directly
// without spawning the CLI). Peers and platform packages stay external to
// keep the bundle small and avoid duplicating viem/zod across consumers.
const external = [
  '@modelcontextprotocol/sdk',
  '@skillos/sdk',
  '@buildersgarden/siwa',
  '@x402/axios',
  '@x402/core',
  '@x402/evm',
  'axios',
  'viem',
  'zod',
];

// Δ6: the shared engines package is a build-time devDependency that we
// deliberately BUNDLE into the dist artifacts (rather than externalize) so the
// published @skillos/mcp — and the `./engine/2048` subpath the smoke drives —
// stays self-contained with no new runtime dependency. `noExternal` forces
// this regardless of how the dependency is otherwise classified by tsup.
const noExternal = ['@skillos/engines'];

// The banner only belongs on the CLI bin entry; library entries (server,
// engine-2048) should NOT have the shebang because consumers import them
// as modules. tsup applies a single `banner` to every entry, so we split
// into two defineConfig calls in one default array.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    external,
    noExternal,
  },
  // Server library entry (no banner)
  {
    entry: {
      server: 'src/server.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'node20',
    external,
    noExternal,
    splitting: false,
  },
  // X32-4: 2048 engine as dedicated standalone subpath entry.
  // Separate config ensures reliable emission of dist/engine-2048.js + .d.ts
  // for the exports map (used by smoke tests and future Δ6 replay).
  {
    entry: {
      'engine-2048': 'src/engines/game2048.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    target: 'node20',
    external,
    noExternal,
    splitting: false,
  },
]);
