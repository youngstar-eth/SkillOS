// Verify OpenAPI delta: load the Hono app in-process and dump the paths
// matching /v1/ratings/*. No dev server required.

process.env.SUPABASE_URL ??= 'http://supabase.test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'a'.repeat(40);
process.env.SIWA_RECEIPT_SECRET ??= 'a'.repeat(32);
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.X402_RECEIVER_ADDRESS ??= '0x000000000000000000000000000000000000dEaD';

const { default: app } = await import('../src/app.js');

const res = await app.request('/openapi.json');
if (res.status !== 200) {
  console.error('openapi.json fetch failed:', res.status, await res.text());
  process.exit(1);
}
const doc = (await res.json()) as { paths: Record<string, unknown> };
const ratingsPaths = Object.keys(doc.paths)
  .filter((p) => p.includes('/v1/ratings'))
  .sort();

console.log('Rating endpoints in OpenAPI:');
for (const p of ratingsPaths) {
  const methods = Object.keys(doc.paths[p] as Record<string, unknown>);
  console.log(`  ${methods.join(',').toUpperCase()} ${p}`);
}
console.log(`\nTotal: ${ratingsPaths.length} paths`);
if (ratingsPaths.length !== 3) {
  console.error('Expected 3 rating paths, got', ratingsPaths.length);
  process.exit(1);
}
