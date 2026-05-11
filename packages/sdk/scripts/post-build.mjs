// Prepends `"use client";` to dist/react.js and dist/index.js so Next.js's
// React Server Components compiler treats them as client-only boundaries.
// Vanilla bundle deliberately omits the directive — it's Node/edge-safe.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, '..', 'dist');
const DIRECTIVE = '"use client";\n';

for (const name of ['react.js', 'index.js']) {
  const path = resolve(DIST, name);
  const body = readFileSync(path, 'utf8');
  if (body.startsWith('"use client"') || body.startsWith("'use client'")) {
    continue;
  }
  writeFileSync(path, DIRECTIVE + body);
  console.log(`[post-build] prepended "use client" → dist/${name}`);
}
