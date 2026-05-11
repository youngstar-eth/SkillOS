import { defineConfig } from 'tsup';

// ESM bin bundle. External peers stay external to keep the install size
// small; npm dedupes shared deps (siwa, viem, x402) when colocated with
// @skillos/mcp on the same machine.
const external = [
  '@skillos/sdk',
  '@buildersgarden/siwa',
  '@x402/axios',
  '@x402/core',
  '@x402/evm',
  'axios',
  'citty',
  'siwe',
  'viem',
];

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  external,
});
