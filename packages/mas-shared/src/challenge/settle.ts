import type { SupabaseClient } from "@supabase/supabase-js";
import { transferUSDCWithLog } from "../payout";
import type { Challenge } from "./types";

/**
 * Settle a challenge based on current state + submitted scores.
 * Idempotent: if the row is already in a terminal state, re-return the
 * previous tx hash(es) without any chain writes.
 *
 * Terminal paths:
 *   accepted + both submitted  → pay winner (2x stake − 10% fee)
 *   open + expired             → refund Alice full stake
 *   accepted + expired + only
 *     Alice submitted          → Alice wins by walkover (rare; same as above payout)
 *   accepted + expired + neither
 *     submitted                → refund both (no platform fee)
 *
 * The "both-no-submit" case refunds both at 100% — no platform fee — per
 * plan. This is kinder than the F1 settle model because the players did
 * stake; they just ran out of time.
 */

const PLATFORM_FEE_BPS = 1000n; // 10%

export async function settleChallenge(
  supabase: SupabaseClient,
  challengeId: string,
): Promise<
  | { ok: true; status: string; txHashes: string[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (error) return { ok: false, error: `db_read: ${error.message}` };
  const c = data as Challenge | null;
  if (!c) return { ok: false, error: "not_found" };

  // Already terminal — idempotent return
  if (c.status === "settled") {
    return {
      ok: true,
      status: "settled",
      txHashes: c.payout_tx_hash ? [c.payout_tx_hash] : [],
    };
  }
  if (c.status === "expired_refunded") {
    return {
      ok: true,
      status: "expired_refunded",
      txHashes: c.refund_tx_hash ? [c.refund_tx_hash] : [],
    };
  }

  const now = Date.now();
  const expired = new Date(c.expires_at).getTime() < now;
  const bothSubmitted =
    c.challenger_score !== null && c.challenger_address !== null;

  // Case A: both submitted — pay the winner
  if (c.status === "accepted" && bothSubmitted) {
    const winner = pickWinner(c);
    const totalPool = c.stake_usdc * 2;
    const feeAtomic = (BigInt(Math.round(totalPool * 1_000_000)) * PLATFORM_FEE_BPS) / 10000n;
    const prizeUsdc = totalPool - Number(feeAtomic) / 1_000_000;

    const res = await transferUSDCWithLog(
      {
        userAddress: winner,
        amount: prizeUsdc,
        scope: "challenge",
        category: null,
        gameSlug: c.game_slug,
        day: today(),
        rank: 1,
        label: `challenge:${c.id.slice(0, 8)}:winner`,
      },
      { supabase },
    );

    if (res.status === "sent" || res.status === "duplicate") {
      const txHash =
        res.status === "sent" ? res.txHash : res.existing.tx_hash;
      await supabase
        .from("challenges")
        .update({
          status: "settled",
          winner_address: winner,
          payout_tx_hash: txHash,
          settled_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      return { ok: true, status: "settled", txHashes: txHash ? [txHash] : [] };
    }
    if (res.status === "failed") {
      await supabase
        .from("challenges")
        .update({ settle_failure_reason: res.error })
        .eq("id", c.id);
      return { ok: false, error: `payout_failed: ${res.error}` };
    }
    return { ok: false, error: `unexpected_transfer_result` };
  }

  // Case B: open but expired → refund Alice
  if (c.status === "open" && expired) {
    return refundSingle(supabase, c, c.creator_address, "open_expired");
  }

  // Case C: accepted + expired + neither submitted → refund both, no fee
  if (c.status === "accepted" && expired && !bothSubmitted) {
    // Neither submitted (Alice's score is in the DB pre-stake but that's
    // the bar score, not an in-challenge submit). Treat as both-refund if
    // we want to be strict — per plan, refund both.
    return refundBoth(supabase, c);
  }

  // Case D: accepted + expired + only one submitted → that one wins
  if (c.status === "accepted" && expired && c.challenger_score !== null) {
    const winner = pickWinner(c);
    return payWinner(supabase, c, winner);
  }

  // Not ready to settle yet
  return {
    ok: false,
    error: `not_settleable status=${c.status} expired=${expired} bothSubmitted=${bothSubmitted}`,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────

function pickWinner(c: Challenge): string {
  const alice = c.creator_score;
  const bob = c.challenger_score ?? -1;
  if (bob > alice) return c.challenger_address as string;
  if (alice > bob) return c.creator_address;
  // Tie → creator wins (arbitrary but deterministic)
  return c.creator_address;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function payWinner(
  supabase: SupabaseClient,
  c: Challenge,
  winner: string,
): Promise<
  | { ok: true; status: string; txHashes: string[] }
  | { ok: false; error: string }
> {
  const totalPool = c.stake_usdc * 2;
  const feeAtomic = (BigInt(Math.round(totalPool * 1_000_000)) * PLATFORM_FEE_BPS) / 10000n;
  const prizeUsdc = totalPool - Number(feeAtomic) / 1_000_000;

  const res = await transferUSDCWithLog(
    {
      userAddress: winner,
      amount: prizeUsdc,
      scope: "challenge",
      category: null,
      gameSlug: c.game_slug,
      day: today(),
      rank: 1,
      label: `challenge:${c.id.slice(0, 8)}:walkover`,
    },
    { supabase },
  );
  if (res.status === "sent" || res.status === "duplicate") {
    const txHash = res.status === "sent" ? res.txHash : res.existing.tx_hash;
    await supabase
      .from("challenges")
      .update({
        status: "settled",
        winner_address: winner,
        payout_tx_hash: txHash,
        settled_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    return { ok: true, status: "settled", txHashes: txHash ? [txHash] : [] };
  }
  return { ok: false, error: `payout_failed: ${res.status === "failed" ? res.error : "unexpected"}` };
}

async function refundSingle(
  supabase: SupabaseClient,
  c: Challenge,
  addr: string,
  reasonLabel: string,
): Promise<
  | { ok: true; status: string; txHashes: string[] }
  | { ok: false; error: string }
> {
  const res = await transferUSDCWithLog(
    {
      userAddress: addr,
      amount: c.stake_usdc,
      scope: "challenge",
      category: null,
      gameSlug: c.game_slug,
      day: today(),
      rank: 1,
      label: `challenge:${c.id.slice(0, 8)}:refund:${reasonLabel}`,
    },
    { supabase },
  );
  if (res.status === "sent" || res.status === "duplicate") {
    const txHash = res.status === "sent" ? res.txHash : res.existing.tx_hash;
    await supabase
      .from("challenges")
      .update({
        status: "expired_refunded",
        refund_tx_hash: txHash,
        settled_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    return { ok: true, status: "expired_refunded", txHashes: txHash ? [txHash] : [] };
  }
  return { ok: false, error: `refund_failed: ${res.status === "failed" ? res.error : "unexpected"}` };
}

async function refundBoth(
  supabase: SupabaseClient,
  c: Challenge,
): Promise<
  | { ok: true; status: string; txHashes: string[] }
  | { ok: false; error: string }
> {
  const addrs = [c.creator_address, c.challenger_address as string];
  const txs: string[] = [];
  for (const [idx, addr] of addrs.entries()) {
    const res = await transferUSDCWithLog(
      {
        userAddress: addr,
        amount: c.stake_usdc,
        scope: "challenge",
        category: null,
        gameSlug: c.game_slug,
        day: today(),
        rank: idx === 0 ? 1 : 2, // distinct slot keys for the UNIQUE index
        label: `challenge:${c.id.slice(0, 8)}:refund:both:${idx}`,
      },
      { supabase },
    );
    if (res.status === "sent") txs.push(res.txHash);
    else if (res.status === "duplicate" && res.existing.tx_hash)
      txs.push(res.existing.tx_hash);
    else if (res.status === "failed")
      return { ok: false, error: `refund_failed[${idx}]: ${res.error}` };
  }
  await supabase
    .from("challenges")
    .update({
      status: "expired_refunded",
      refund_tx_hash: txs[0] ?? null, // store the first; both in payouts table
      settled_at: new Date().toISOString(),
    })
    .eq("id", c.id);
  return { ok: true, status: "expired_refunded", txHashes: txs };
}
