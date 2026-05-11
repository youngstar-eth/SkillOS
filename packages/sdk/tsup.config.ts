import { defineConfig } from 'tsup';

// ESM-only multi-entry. Two configs because tsup applies banners per-config,
// and only the React entry needs the `'use client'` directive — putting it on
// the vanilla bundle would falsely mark Node-only code as a React Server
// Components client boundary.
//
// External peer deps are NOT bundled — see package.json peerDependencies.
const external = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'wagmi',
  'viem',
  '@tanstack/react-query',
  '@base-org/account',
  '@base-org/account-ui',
];

export default defineConfig([
  {
    entry: { vanilla: 'src/vanilla.ts', index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external,
  },
  {
    entry: { react: 'src/react.tsx' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: false, // second pass — don't wipe the first pass's output
    treeshake: true,
    external,
  },
]);
