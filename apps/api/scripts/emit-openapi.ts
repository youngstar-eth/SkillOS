// Emit the OpenAPI 3.1 document from the in-process Hono app — no dev server,
// no network, no DB. Mirrors the x23-3-openapi-delta.ts startup-env pattern.
//
// Output path is the first CLI arg (default: ./openapi.spec.json in cwd).
// Used by the X24.3 codegen-drift CI guard to produce a deterministic,
// same-commit spec source for SDK type regen — see
// .github/workflows/codegen-drift-check.yml.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal dummy env so app construction (Supabase client, SIWA, JWT, x402)
// does not throw at import time. No real services are contacted — we only
// render the static OpenAPI document from the zod route schemas.
process.env.SUPABASE_URL ??= 'http://supabase.test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'a'.repeat(40);
process.env.SIWA_RECEIPT_SECRET ??= 'a'.repeat(32);
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.X402_RECEIVER_ADDRESS ??= '0x000000000000000000000000000000000000dEaD';

const { default: app } = await import('../src/app.js');

const res = await app.request('/openapi.json');
if (res.status !== 200) {
  console.error('[emit-openapi] /openapi.json fetch failed:', res.status, await res.text());
  process.exit(1);
}

const spec = await res.json();
const out = resolve(process.cwd(), process.argv[2] ?? 'openapi.spec.json');
writeFileSync(out, JSON.stringify(spec, null, 2));
console.log(`[emit-openapi] wrote ${out}`);
