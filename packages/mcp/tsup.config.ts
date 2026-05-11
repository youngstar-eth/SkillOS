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

export default defineConfig({
  entry: { index: 'src/index.ts', server: 'src/server.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  external,
});
