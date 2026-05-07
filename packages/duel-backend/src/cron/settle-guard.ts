// ───────────────────────────────────────────────────────────────────────────
// Cron settle-guard: on-chain TournamentPool state pre-check.
//
// Mirrors the duel.ts settle-guard pattern (packages/duel-backend/src/
// settle-guard.ts) that resolved the May 1 lie-state bug in the duel path.
// The cron settle path historically caught state mismatches POST-tx via
// the TournamentAlreadySettled revert classification, which is correct
// for happy-path idempotency but wastes gas on the redundant broadcast
// AND misses the not-found case (DB has on_chain_id but the contract
// doesn't — which the post-tx catch surfaces as a generic error).
//
// readSettleGuard reads getTournament(id) up-front and classifies:
//   - already_settled — contract.settled === true
//   - not_found       — sponsor is the zero address (struct never written)
//   - ends_after_now  — contract.endsAt > now (DB lied; defense-in-depth,
//                       impossible under the current pending fetch's
//                       lt('ends_at', now()) filter but cheap to assert)
//   - ok-to-settle    — guard returns ok:true; caller proceeds with settle()
//
// Throws only if the RPC itself fails — never swallows errors, so callers
// can retry transient network issues separately from logic failures.
// Same convention as readChallengeGuard.
//
// Multicall: TODO PR #5. Once the .limit(20) cap is removed, fold these
// view reads into publicClient.multicall({ contracts: [...] }) so the per-
// run RPC count stays bounded as pending tournament counts grow.
// ───────────────────────────────────────────────────────────────────────────

import { TOURNAMENT_POOL_ABI, TOURNAMENT_POOL_V2_ADDRESS } from "@skillbase/contracts";
import type { Hex } from "viem";

/** Why the on-chain state prevents settle() from succeeding. */
export type CronSettleGuardReason =
  | "not_found" // sponsor === 0x0 — bytes32 id has no entry on-chain
  | "already_settled" // tournament.settled === true
  | "ends_after_now"; // endsAt > now — submission window still open

export type CronSettleGuardResult =
  | {
      ok: true;
      settled: false;
      endsAt: bigint;
      sponsor: `0x${string}`;
    }
  | {
      ok: false;
      reason: CronSettleGuardReason;
      settled: boolean;
      endsAt: bigint;
      sponsor: `0x${string}`;
    };

/**
 * Minimal interface surface — just the readContract call shape we need.
 * Trivially mockable in tests without pulling the full viem PublicClient
 * generic union. Production callers pass getPublicClient().
 *
 * The args parameter is loosely typed: viem's actual readContract is a
 * generic that narrows on the abi, and TypeScript's strict contravariance
 * makes a precise mock signature reject the production client. Loose
 * typing keeps mocks trivial AND lets us pass a real viem PublicClient
 * unchanged. Runtime safety lives in the readContract impl, not the
 * call-site signature.
 */
export interface CronGuardPublicClient {
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) => Promise<unknown>;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

/**
 * Read tournament state from the pool contract and classify it.
 *
 * @param publicClient  Anything implementing readContract — getPublicClient()
 *                      in production, a mock object in tests.
 * @param onChainId     The bytes32 tournament identifier.
 * @param nowSec        Current time in unix seconds. Defaulted to Date.now()
 *                      in production; tests inject a deterministic value.
 */
export async function readSettleGuard(
  publicClient: CronGuardPublicClient,
  onChainId: Hex,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<CronSettleGuardResult> {
  const raw = await publicClient.readContract({
    address: TOURNAMENT_POOL_V2_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: "getTournament",
    args: [onChainId],
  });

  // viem decodes the named-tuple output as an object. Defensive narrowing
  // so a malformed response surfaces as not_found rather than crashing.
  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      reason: "not_found",
      settled: false,
      endsAt: 0n,
      sponsor: ZERO_ADDR,
    };
  }

  const t = raw as {
    sponsor?: unknown;
    endsAt?: unknown;
    settled?: unknown;
  };
  const sponsor =
    typeof t.sponsor === "string" && t.sponsor.startsWith("0x")
      ? (t.sponsor as `0x${string}`)
      : ZERO_ADDR;
  const endsAt =
    typeof t.endsAt === "bigint"
      ? t.endsAt
      : typeof t.endsAt === "number"
        ? BigInt(t.endsAt)
        : 0n;
  const settled = typeof t.settled === "boolean" ? t.settled : false;

  // Existence check: zero-init Tournament struct returns sponsor=0x0.
  if (sponsor === ZERO_ADDR) {
    return { ok: false, reason: "not_found", settled, endsAt, sponsor };
  }

  if (settled) {
    return { ok: false, reason: "already_settled", settled, endsAt, sponsor };
  }

  if (endsAt > BigInt(nowSec)) {
    return { ok: false, reason: "ends_after_now", settled, endsAt, sponsor };
  }

  return { ok: true, settled: false, endsAt, sponsor };
}
