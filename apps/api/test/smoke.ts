// Smoke suite for @skillos/app-api.
//
// Designed to run against any HTTPS (or HTTP, for local dev) base URL.
// Usage:
//   npm run smoke -- https://api.skillos.network
//   npm run smoke -- http://localhost:3000
//
// Three tests, each a single HTTP call. Goal is "is the deployment alive
// and serving the contract" — not exhaustive coverage. Real integration
// tests live in test/integration/* (none yet, Sprint X1 is read-only).

import { exit } from 'node:process';

const baseUrl = (process.argv[2] ?? 'https://api.skillos.network').replace(/\/$/, '');

interface TestResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: TestResult[] = [];

const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
};

const fetchJson = async (path: string): Promise<{ status: number; body: unknown }> => {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
  });
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => undefined);
  }
  return { status: res.status, body };
};

// ─── Test 1: /v1/health is 200 with the expected shape ────────────────────

const healthTest = async () => {
  const { status, body } = await fetchJson('/v1/health');
  if (status !== 200) {
    record('health: 200', false, `got ${status}`);
    return;
  }
  const b = body as Record<string, unknown>;
  const ok =
    typeof b.version === 'string' &&
    typeof b.commit === 'string' &&
    typeof b.uptimeSeconds === 'number' &&
    b.network === 'base-sepolia' &&
    b.chainId === 84532;
  record(
    'health: shape',
    ok,
    ok ? `v=${b.version} commit=${b.commit}` : `unexpected: ${JSON.stringify(b)}`,
  );
};

// ─── Test 2: /v1/tournaments is 200 with paginated array shape ────────────

const tournamentsTest = async () => {
  const { status, body } = await fetchJson('/v1/tournaments?limit=5');
  if (status !== 200) {
    record('tournaments: 200', false, `got ${status} body=${JSON.stringify(body).slice(0, 200)}`);
    return;
  }
  const b = body as { items?: unknown; pagination?: unknown };
  const ok = Array.isArray(b.items) && typeof b.pagination === 'object' && b.pagination !== null;
  record(
    'tournaments: shape',
    ok,
    ok ? `items=${(b.items as unknown[]).length}` : `unexpected: ${JSON.stringify(b).slice(0, 200)}`,
  );
};

// ─── Test 3: /openapi.json is 200, declares OpenAPI 3.1.0 ─────────────────

const openapiTest = async () => {
  const { status, body } = await fetchJson('/openapi.json');
  if (status !== 200) {
    record('openapi: 200', false, `got ${status}`);
    return;
  }
  const b = body as { openapi?: unknown; info?: { title?: unknown }; paths?: unknown };
  const isThirty1 = b.openapi === '3.1.0';
  const hasPaths = typeof b.paths === 'object' && b.paths !== null;
  const titleOk = b.info?.title === 'SkillOS API';
  const ok = isThirty1 && hasPaths && titleOk;
  record(
    'openapi: 3.1 spec served',
    ok,
    ok ? `openapi=${b.openapi} paths=${Object.keys(b.paths as object).length}` : `unexpected: ${JSON.stringify({ openapi: b.openapi, title: b.info?.title }).slice(0, 200)}`,
  );
};

// ─── Run ──────────────────────────────────────────────────────────────────

console.log(`Running smoke suite against ${baseUrl}\n`);

try {
  await healthTest();
  await tournamentsTest();
  await openapiTest();
} catch (err) {
  console.error(`\nSmoke suite crashed: ${(err as Error).message}`);
  exit(2);
}

const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n${passed}/${total} tests passed`);
exit(passed === total ? 0 : 1);
