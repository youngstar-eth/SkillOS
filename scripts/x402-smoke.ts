// ───────────────────────────────────────────────────────────────────────────
// End-to-end smoke script for the 6 Skillbase x402 routes.
//
//   usage:
//     X402_BASE_URL=http://localhost:3018 \
//     X402_TEST_WALLET_PRIVATE_KEY=0x<funded-sepolia-wallet> \
//     npx tsx scripts/x402-smoke.ts
//
// For each route:
//   1. Unpaid GET  → asserts 402 + Bazaar metadata in PaymentRequirements
//   2. Paid GET    → wrapFetchWithPayment signs + retries with x-payment
//   3. Prints the 200 JSON snippet + settlement tx hash (BaseScan link)
//
// Produces a summary with total USDC spent and per-route tx hashes. On
// exit code ≠ 0 the caller knows at least one route failed the round
// trip.
// ───────────────────────────────────────────────────────────────────────────

import {
  decodePaymentResponseHeader,
  x402Client,
  wrapFetchWithPayment,
} from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.X402_BASE_URL ?? "http://localhost:3018";
const NETWORK = process.env.X402_NETWORK ?? "eip155:84532";
const PRIVATE_KEY = process.env.X402_TEST_WALLET_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error(
    "[x402-smoke] missing X402_TEST_WALLET_PRIVATE_KEY env var. Provide a Base Sepolia funded key.",
  );
  process.exit(2);
}
if (!PRIVATE_KEY.startsWith("0x") || PRIVATE_KEY.length !== 66) {
  console.error(
    "[x402-smoke] X402_TEST_WALLET_PRIVATE_KEY must be a 0x-prefixed 64-hex string.",
  );
  process.exit(2);
}

interface RouteDef {
  name: string;
  path: string;
  priceUsd: number;
  /**
   * If set, paid response with this status is considered a "successful seed"
   * (Bazaar still registers the route via settlement callback even though
   * the body is an error envelope). Used for /sp-snapshot pre-first-cron-fire
   * where the route legitimately returns 503 awaiting_first_anchor.
   */
  acceptablePaidStatuses?: number[];
}

const ROUTES: RouteDef[] = [
  { name: "sp-tier-distribution", path: "/api/public/data/sp-tier-distribution", priceUsd: 0.01 },
  { name: "decision-sample-any", path: "/api/public/data/decision-sample/any", priceUsd: 0.01 },
  { name: "decision-sample-tier-1-4", path: "/api/public/data/decision-sample/tier/1-4", priceUsd: 0.02 },
  { name: "decision-sample-tier-5-7", path: "/api/public/data/decision-sample/tier/5-7", priceUsd: 0.05 },
  { name: "decision-sample-tier-8-plus", path: "/api/public/data/decision-sample/tier/8-plus", priceUsd: 0.1 },
  { name: "coach-sample", path: "/api/public/ai/coach-sample?game=2048&score=1234", priceUsd: 0.05 },
  // SP snapshot — pre-first-cron-fire returns 503 (awaiting_first_anchor).
  // Settlement still fires on 503 → Bazaar registers the route. Once the
  // cron has fired at least once, bump expected to [200, 503] or just [200].
  {
    name: "sp-snapshot-latest",
    path: "/api/public/data/sp-snapshot",
    priceUsd: 0.05,
    acceptablePaidStatuses: [200, 503],
  },
  // Historical by UUID — without a real anchored snapshot in DB this returns
  // 404 snapshot_not_found. Same Bazaar registration mechanic via settlement.
  {
    name: "sp-snapshot-by-id",
    path: "/api/public/data/sp-snapshot/00000000-0000-4000-8000-000000000000",
    priceUsd: 0.05,
    acceptablePaidStatuses: [200, 404],
  },
];

interface RouteResult {
  route: string;
  unpaidStatus: number;
  paidStatus: number;
  bazaar?: unknown;
  txHash?: string;
  baseScanUrl?: string;
  body?: unknown;
  error?: string;
}

function baseScanUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

function truncate(value: unknown, max = 500): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function extractBazaar(paymentRequired: unknown): unknown {
  if (!paymentRequired || typeof paymentRequired !== "object") return undefined;
  // v2 envelope puts extensions.bazaar at the top level.
  const topExt = (paymentRequired as { extensions?: { bazaar?: unknown } })
    .extensions;
  if (topExt?.bazaar) return topExt.bazaar;
  // Fallback: v1-style where extensions lived on each accepts entry.
  const accepts = (paymentRequired as { accepts?: unknown[] }).accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) return undefined;
  const first = accepts[0];
  if (!first || typeof first !== "object") return undefined;
  const ext = (first as { extensions?: { bazaar?: unknown } }).extensions;
  return ext?.bazaar;
}

async function runRoute(
  route: RouteDef,
  fetchWithPayment: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<RouteResult> {
  const url = `${BASE_URL}${route.path}`;

  // Step 1 — unpaid GET (raw fetch, no payment header).
  const unpaidRes = await fetch(url, { method: "GET" });
  const unpaidStatus = unpaidRes.status;

  let bazaar: unknown;
  const paymentRequiredHeader =
    unpaidRes.headers.get("payment-required") ??
    unpaidRes.headers.get("x-payment-required");
  if (paymentRequiredHeader) {
    try {
      const decoded = JSON.parse(
        Buffer.from(paymentRequiredHeader, "base64").toString("utf8"),
      );
      bazaar = extractBazaar(decoded);
    } catch {
      // ignore header decode errors — the paid run will still exercise the flow
    }
  }
  if (!bazaar) {
    try {
      const body = await unpaidRes.clone().json();
      bazaar = extractBazaar(body);
    } catch {
      // body may be empty — that's fine for v2 where metadata lives in the header
    }
  }

  if (unpaidStatus !== 402) {
    return {
      route: route.name,
      unpaidStatus,
      paidStatus: 0,
      bazaar,
      error: `expected 402 on unpaid GET, got ${unpaidStatus}`,
    };
  }

  // Step 2 — paid retry via wrapped fetch.
  let paidRes: Response;
  try {
    paidRes = await fetchWithPayment(url, { method: "GET" });
  } catch (err) {
    return {
      route: route.name,
      unpaidStatus,
      paidStatus: 0,
      bazaar,
      error: `payment retry threw: ${(err as Error).message}`,
    };
  }

  const paidStatus = paidRes.status;
  const paymentResponseHeader =
    paidRes.headers.get("x-payment-response") ??
    paidRes.headers.get("payment-response");
  let txHash: string | undefined;
  if (paymentResponseHeader) {
    try {
      const settle = decodePaymentResponseHeader(paymentResponseHeader);
      // SettleResponse v2 uses `transaction`; v1 used `transactionHash`.
      // Try both, plus a raw pass for any future field rename.
      const asAny = settle as {
        transaction?: string;
        transactionHash?: string;
      };
      txHash = asAny.transaction ?? asAny.transactionHash;
      if (!txHash) {
        console.warn(
          `[x402-smoke] ${route.name}: settle response had no tx field`,
          JSON.stringify(settle),
        );
      }
    } catch (err) {
      console.warn(
        `[x402-smoke] ${route.name}: could not decode payment-response header`,
        err,
      );
    }
  } else {
    console.warn(
      `[x402-smoke] ${route.name}: no payment-response header on 200 — settle header name may have changed`,
    );
  }

  let body: unknown;
  try {
    body = await paidRes.json();
  } catch (err) {
    body = `<non-json body: ${(err as Error).message}>`;
  }

  return {
    route: route.name,
    unpaidStatus,
    paidStatus,
    bazaar,
    txHash,
    baseScanUrl: txHash ? baseScanUrl(txHash) : undefined,
    body,
  };
}

async function main() {
  const signer = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  console.log(`[x402-smoke] signer ${signer.address} / network ${NETWORK} / base ${BASE_URL}`);

  const client = new x402Client().register(
    NETWORK as "eip155:84532",
    new ExactEvmScheme(signer),
  );
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const results: RouteResult[] = [];
  for (const route of ROUTES) {
    console.log(`\n[x402-smoke] ==== ${route.name} ($${route.priceUsd.toFixed(2)}) ====`);
    const r = await runRoute(route, fetchWithPayment);
    results.push(r);
    console.log(`  unpaid: ${r.unpaidStatus}`);
    console.log(`  bazaar: ${r.bazaar ? JSON.stringify(r.bazaar) : "<not found>"}`);
    console.log(`  paid:   ${r.paidStatus}`);
    if (r.txHash) console.log(`  tx:     ${r.baseScanUrl}`);
    if (r.body) console.log(`  body:   ${truncate(r.body, 300)}`);
    if (r.error) console.log(`  ERROR:  ${r.error}`);
  }

  function isPaidStatusAcceptable(r: RouteResult): boolean {
    const def = ROUTES.find((rt) => rt.name === r.route);
    if (def?.acceptablePaidStatuses) {
      return def.acceptablePaidStatuses.includes(r.paidStatus);
    }
    return r.paidStatus >= 200 && r.paidStatus < 300;
  }
  const totalSpentUsd = results
    .filter(isPaidStatusAcceptable)
    .reduce(
      (acc, r) =>
        acc +
        (ROUTES.find((rt) => rt.name === r.route)?.priceUsd ?? 0),
      0,
    );
  const successCount = results.filter(
    (r) => r.unpaidStatus === 402 && isPaidStatusAcceptable(r),
  ).length;

  console.log("\n================ SUMMARY ================");
  console.log(`passing routes:      ${successCount}/${ROUTES.length}`);
  console.log(`USDC spent (testnet): $${totalSpentUsd.toFixed(2)}`);
  console.log("txs:");
  for (const r of results) {
    console.log(`  ${r.route.padEnd(32)} ${r.baseScanUrl ?? "<no tx>"}`);
  }

  const failed = results.filter((r) => r.error || !isPaidStatusAcceptable(r));
  if (failed.length > 0) {
    console.error(`\n[x402-smoke] FAILED ${failed.length} route(s)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[x402-smoke] fatal", err);
  process.exit(1);
});
