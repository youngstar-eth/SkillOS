import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { transferUSDCWithLog } from "../../payout";
import { getGameLeaderboard } from "../../leaderboard";

/**
 * POST /api/payout/trigger
 *
 * Body: { userAddress: string, gameSlug: string }
 *
 * Fires an off-chain USDC.transfer from the studio wallet to the caller
 * iff the caller currently holds rank 1 on `gameSlug`'s daily leaderboard.
 *
 * Feature-flagged behind NEXT_PUBLIC_INSTANT_PAYOUT=1 so the cron and the
 * instant-payout UX can be toggled independently.
 *
 * Trust model:
 *   - Client NEVER chooses the amount — server looks it up by gameSlug.
 *   - Client NEVER chooses the rank — server verifies against daily_ranks.
 *   - Double-pay is blocked by UNIQUE partial index on payouts (see
 *     migration 20260419000000_payouts_instant_scope.sql).
 *
 * Basescan URL assumes base-sepolia. Update when promoting to mainnet.
 */

const INSTANT_PAYOUT_AMOUNT_USDC: Record<string, number> = {
  wordle: 0.9,
  "2048": 0.9,
  hillclimb: 0.9,
};

const BASESCAN_HOST = "https://sepolia.basescan.org";

export async function payoutTriggerHandler(req: Request) {
  if (process.env.NEXT_PUBLIC_INSTANT_PAYOUT !== "1") {
    return NextResponse.json(
      { error: "instant_payout_disabled" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    userAddress?: string;
    gameSlug?: string;
  } | null;

  if (!body?.userAddress || !body?.gameSlug) {
    return NextResponse.json(
      { error: "missing_fields", need: ["userAddress", "gameSlug"] },
      { status: 400 },
    );
  }

  const amount = INSTANT_PAYOUT_AMOUNT_USDC[body.gameSlug];
  if (!amount) {
    return NextResponse.json(
      { error: "unsupported_game", gameSlug: body.gameSlug },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 500 },
    );
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Rank-1 verification. Leaderboard is live-computed from game_scores for
  // today, so the just-submitted score is reflected immediately.
  const today = new Date().toISOString().slice(0, 10);
  let leaderboard: Awaited<ReturnType<typeof getGameLeaderboard>> = [];
  try {
    leaderboard = await getGameLeaderboard(body.gameSlug, today, 3);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "leaderboard_read_failed", message: msg },
      { status: 500 },
    );
  }

  const top = leaderboard[0];
  if (!top || top.user_address.toLowerCase() !== body.userAddress.toLowerCase()) {
    return NextResponse.json(
      {
        error: "not_rank_1",
        youAre: leaderboard.findIndex(
          (r) => r.user_address.toLowerCase() === body.userAddress?.toLowerCase(),
        ),
        top3: leaderboard,
      },
      { status: 403 },
    );
  }

  try {
    const result = await transferUSDCWithLog(
      {
        userAddress: body.userAddress,
        amount,
        scope: "instant",
        category: null,
        gameSlug: body.gameSlug,
        day: today,
        rank: 1,
        label: `instant:${body.gameSlug}:${body.userAddress.slice(0, 8)}`,
      },
      { supabase },
    );

    switch (result.status) {
      case "sent":
        return NextResponse.json({
          ok: true,
          amount: result.amount,
          txHash: result.txHash,
          basescanUrl: `${BASESCAN_HOST}/tx/${result.txHash}`,
          payoutId: result.payoutId,
        });
      case "duplicate":
        return NextResponse.json({
          ok: true,
          duplicate: true,
          status: result.existing.status,
          txHash: result.existing.tx_hash,
          basescanUrl: result.existing.tx_hash
            ? `${BASESCAN_HOST}/tx/${result.existing.tx_hash}`
            : null,
        });
      case "failed":
        return NextResponse.json(
          {
            error: "transfer_failed",
            message: result.error,
            payoutId: result.payoutId,
          },
          { status: 502 },
        );
      case "dry_run":
        return NextResponse.json({ ok: true, dryRun: true });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "handler_error", message: msg },
      { status: 500 },
    );
  }
}
