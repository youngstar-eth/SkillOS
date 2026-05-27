import { defineConfig } from 'tsup';

// Keep heavy peers external so the bundle stays small and consumers
// share a single instance of the MCP SDK / OpenAI SDK / zod across
// workspace packages.
const external = ['@modelcontextprotocol/sdk', 'openai', 'zod'];

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'node20',
  external,
});
