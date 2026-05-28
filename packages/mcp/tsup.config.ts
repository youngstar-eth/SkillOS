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
  },
  {
    entry: {
      server: 'src/server.ts',
      // X32-4: expose the 2048 engine as a standalone subpath so the demo
      // orchestrator (and any external replay tool) can import it without
      // pulling in the full MCP server bundle.
      'engine-2048': 'src/engines/game2048.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false, // the cli build above already cleaned
    treeshake: true,
    target: 'node20',
    external,
  },
]);
