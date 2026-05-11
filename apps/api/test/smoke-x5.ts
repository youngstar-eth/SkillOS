// Sprint X5 smoke suite — x402 paywalled data tier.
//
// Verifies the 402 → PAYMENT-REQUIRED path on both paywalled endpoints.
// Does NOT exercise the full sign + retry → 200 flow; that requires a Base
// Sepolia wallet with USDC and EIP-3009 typed-data signing, which is heavy
// for a live smoke. Use the @x402/axios reference client or
// `npx @coinbase/payments-mcp` for the full E2E path.
//
// Usage:
//   npm run smoke:x5 -- https://api.skillos.network
//   npm run smoke:x5 -- http://localhost:3000

import { exit } from 'node:process';

const baseUrl = (process.argv[2] ?? 'https://api.skillos.network').replace(/\/$/, '');

// Hash-derived sample tournament id — matches Bytes32Hex regex; doesn't need
// to exist on-chain because the paywall short-circuits before the handler.
const SAMPLE_TOURNAMENT_ID =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const BASE_SEPOLIA_CAIP2 = 'eip155:84532' as const;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

type TestResult = { name: string; ok: boolean; detail: string };
const results: TestResult[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
};

interface DecodedRequirements {
  x402Version?: number;
  error?: string;
  resource?: { url?: string; description?: string; mimeType?: string };
  accepts?: Array<{
    scheme?: string;
    network?: string;
    // v2 field name; older v1 used maxAmountRequired.
    amount?: string;
    maxAmountRequired?: string;
    payTo?: string;
    asset?: string;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  }>;
}

const decodeRequirementsHeader = (raw: string | null): DecodedRequirements | null => {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(json) as DecodedRequirements;
  } catch {
    return null;
  }
};

const probePaywall = async (path: string, expectedAtomic: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
  });

  if (res.status !== 402) {
    record(`${path}: 402`, false, `got ${res.status} (expected 402)`);
    return;
  }
  record(`${path}: 402`, true, 'unauthenticated request gated');

  const headerName = ['PAYMENT-REQUIRED', 'Payment-Required', 'payment-required']
    .map((n) => res.headers.get(n))
    .find((v): v is string => v !== null) ?? null;
  if (!headerName) {
    record(`${path}: PAYMENT-REQUIRED header`, false, 'header missing');
    return;
  }
  record(`${path}: PAYMENT-REQUIRED header`, true, `${headerName.slice(0, 40)}...`);

  const decoded = decodeRequirementsHeader(headerName);
  if (!decoded || !decoded.accepts || decoded.accepts.length === 0) {
    record(`${path}: requirements decode`, false, 'header not base64-JSON or accepts[] empty');
    return;
  }
  const opt = decoded.accepts[0];

  const networkOk = opt.network === BASE_SEPOLIA_CAIP2;
  record(
    `${path}: network`,
    networkOk,
    networkOk ? BASE_SEPOLIA_CAIP2 : `got ${opt.network ?? 'undefined'}`,
  );

  const schemeOk = opt.scheme === 'exact';
  record(
    `${path}: scheme`,
    schemeOk,
    schemeOk ? 'exact' : `got ${opt.scheme ?? 'undefined'}`,
  );

  const advertisedAmount = opt.amount ?? opt.maxAmountRequired;
  const amountOk = advertisedAmount === expectedAtomic;
  record(
    `${path}: amount`,
    amountOk,
    amountOk
      ? `${expectedAtomic} (USDC 6dp)`
      : `got ${advertisedAmount ?? 'undefined'} (expected ${expectedAtomic})`,
  );

  const assetOk =
    typeof opt.asset === 'string' &&
    opt.asset.toLowerCase() === BASE_SEPOLIA_USDC.toLowerCase();
  record(
    `${path}: asset (USDC)`,
    assetOk,
    assetOk ? BASE_SEPOLIA_USDC : `got ${opt.asset ?? 'undefined'}`,
  );

  const payToOk = typeof opt.payTo === 'string' && ADDRESS_REGEX.test(opt.payTo);
  record(
    `${path}: payTo address`,
    payToOk,
    payToOk ? opt.payTo! : `got ${opt.payTo ?? 'undefined'}`,
  );
};

// ─── Regression: /v1/health remains 200 ───────────────────────────────────

const healthRegressionTest = async () => {
  const res = await fetch(`${baseUrl}/v1/health`);
  record(
    'regression: /v1/health',
    res.status === 200,
    res.status === 200 ? '200' : `got ${res.status}`,
  );
};

// ─── Run ──────────────────────────────────────────────────────────────────

console.log(`Running X5 smoke suite against ${baseUrl}\n`);

try {
  await healthRegressionTest();
  // $0.01 USDC at 6 decimals = 10000 atomic units
  await probePaywall(`/v1/data/match-replay/${SAMPLE_TOURNAMENT_ID}`, '10000');
  // $0.10 USDC at 6 decimals = 100000 atomic units
  await probePaywall('/v1/data/cohort-snapshot', '100000');
} catch (err) {
  console.error(`\nSmoke suite crashed: ${(err as Error).message}`);
  exit(2);
}

const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n${passed}/${total} tests passed`);
exit(passed === total ? 0 : 1);
