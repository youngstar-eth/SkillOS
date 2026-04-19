import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Address, Hex } from "viem";
import {
  createChallenge,
  getChallenge,
  prepareAcceptChallenge,
  markAccepted,
  settleChallenge,
  listOpenChallenges,
  verifyStakeTx,
  getStudioWalletAddress,
} from "../../challenge";
import type {
  ChallengeStake,
  ChallengeDuration,
  ConfirmStakeInput,
} from "../../challenge/types";

/**
 * Challenge handlers. All share the same service-role Supabase client so
 * row-level writes aren't blocked by RLS.
 *
 * Gated behind NEXT_PUBLIC_CHALLENGES=1 so the feature ships dark.
 */

function featureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHALLENGES === "1";
}

function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function gate() {
  if (!featureEnabled()) {
    return NextResponse.json({ error: "challenges_disabled" }, { status: 403 });
  }
  const s = svc();
  if (!s)
    return NextResponse.json(
      { error: "supabase_not_configured" },
      { status: 500 },
    );
  return s;
}

// ─── POST /api/challenge/create ─────────────────────────────────────────────
export async function challengeCreateHandler(req: Request) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const body = (await req.json().catch(() => null)) as {
    gameSlug?: string;
    creatorAddress?: string;
    creatorScore?: number;
    stakeUsdc?: number;
    durationSeconds?: number;
  } | null;

  if (!body) return NextResponse.json({ error: "bad_json" }, { status: 400 });
  const { gameSlug, creatorAddress, creatorScore, stakeUsdc, durationSeconds } =
    body;
  // creatorScore is OPTIONAL in the pre-play duel model.
  if (
    !gameSlug ||
    !creatorAddress ||
    typeof stakeUsdc !== "number" ||
    typeof durationSeconds !== "number"
  ) {
    return NextResponse.json(
      {
        error: "missing_fields",
        need: ["gameSlug", "creatorAddress", "stakeUsdc", "durationSeconds"],
      },
      { status: 400 },
    );
  }

  const res = await createChallenge(sb, {
    gameSlug,
    creatorAddress,
    creatorScore:
      typeof creatorScore === "number" ? creatorScore : undefined,
    stakeUsdc: stakeUsdc as ChallengeStake,
    durationSeconds: durationSeconds as ChallengeDuration,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, ...res.response });
}

// ─── POST /api/challenge/:id/confirm-stake ─────────────────────────────────
// Verifies the on-chain USDC.transfer from the staker to the studio wallet,
// writes the tx hash to the row, and advances state.
export async function challengeConfirmStakeHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const body = (await req.json().catch(() => null)) as
    | Omit<ConfirmStakeInput, "challengeId">
    | null;
  if (!body?.role || !body?.txHash) {
    return NextResponse.json(
      { error: "missing_fields", need: ["role", "txHash"] },
      { status: 400 },
    );
  }

  const challengeId = ctx.params.id;
  const c = await getChallenge(sb, challengeId);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const studioWallet = getStudioWalletAddress();

  if (body.role === "creator") {
    if (c.status !== "pending_creator_stake") {
      return NextResponse.json(
        { error: `cannot_confirm_creator_in:${c.status}` },
        { status: 409 },
      );
    }
    const verify = await verifyStakeTx({
      txHash: body.txHash,
      expectedSender: c.creator_address as Address,
      studioWallet: studioWallet as Address,
      stakeUsdc: c.stake_usdc,
    });
    if (!verify.ok) {
      return NextResponse.json(
        { error: "verify_failed", reason: verify.reason },
        { status: 400 },
      );
    }
    const upd = await sb
      .from("challenges")
      .update({
        status: "open",
        creator_stake_tx_hash: body.txHash,
      })
      .eq("id", challengeId)
      .eq("status", "pending_creator_stake")
      .select("id")
      .maybeSingle();
    if (upd.error || !upd.data) {
      return NextResponse.json(
        { error: upd.error?.message ?? "transition_lost_race" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, status: "open" });
  }

  // role === 'challenger' — rejected here; use /accept instead (that
  // endpoint handles verify + state transition in one shot).
  return NextResponse.json(
    { error: "use_accept_endpoint" },
    { status: 400 },
  );
}

// ─── POST /api/challenge/:id/accept ────────────────────────────────────────
// Unified accept endpoint: verifies Bob's stake tx AND flips state.
// Body: { challengerAddress, txHash }
export async function challengeAcceptHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const body = (await req.json().catch(() => null)) as {
    challengerAddress?: string;
    txHash?: Hex;
  } | null;
  if (!body?.challengerAddress || !body?.txHash) {
    return NextResponse.json(
      { error: "missing_fields", need: ["challengerAddress", "txHash"] },
      { status: 400 },
    );
  }

  const prep = await prepareAcceptChallenge(sb, {
    challengeId: ctx.params.id,
    challengerAddress: body.challengerAddress,
  });
  if (!prep.ok) {
    return NextResponse.json(
      { error: prep.error },
      { status: prep.status ?? 400 },
    );
  }

  const studioWallet = getStudioWalletAddress();
  const verify = await verifyStakeTx({
    txHash: body.txHash,
    expectedSender: body.challengerAddress as Address,
    studioWallet: studioWallet as Address,
    stakeUsdc: prep.response.challenge.stake_usdc,
  });
  if (!verify.ok) {
    return NextResponse.json(
      { error: "verify_failed", reason: verify.reason },
      { status: 400 },
    );
  }

  const upd = await markAccepted(
    sb,
    ctx.params.id,
    body.challengerAddress,
    body.txHash,
  );
  if (!upd.ok)
    return NextResponse.json({ error: upd.error }, { status: 409 });
  const latest = await getChallenge(sb, ctx.params.id);
  return NextResponse.json({ ok: true, challenge: latest });
}

// ─── GET /api/challenge/:id/prepare-accept ─────────────────────────────────
// Returns the stake instructions (studio wallet + amount) without any state
// transition. Bob calls this to know where to send the USDC.
export async function challengePrepareAcceptHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const url = new URL(req.url);
  const challengerAddress = url.searchParams.get("challenger");
  if (!challengerAddress) {
    return NextResponse.json(
      { error: "missing_challenger" },
      { status: 400 },
    );
  }

  const prep = await prepareAcceptChallenge(sb, {
    challengeId: ctx.params.id,
    challengerAddress,
  });
  if (!prep.ok) {
    return NextResponse.json(
      { error: prep.error },
      { status: prep.status ?? 400 },
    );
  }
  return NextResponse.json({ ok: true, ...prep.response });
}

// ─── GET /api/challenge/:id ────────────────────────────────────────────────
export async function challengeGetHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;
  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, challenge: c });
}

// ─── POST /api/challenge/:id/submit-score ─────────────────────────────────
// Thin wrapper: write into game_scores with game_data.challenge_id, so
// settle() can pick up each player's best score.
export async function challengeSubmitScoreHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const body = (await req.json().catch(() => null)) as {
    userAddress?: string;
    score?: number;
    gameData?: Record<string, unknown>;
  } | null;
  if (!body?.userAddress || typeof body?.score !== "number") {
    return NextResponse.json(
      { error: "missing_fields", need: ["userAddress", "score"] },
      { status: 400 },
    );
  }

  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Pre-play duel: submission allowed from `accepted` onwards, until each
  // side has already played. Creator can submit on {accepted,
  // challenger_played}; challenger on {accepted, creator_played}. Any other
  // state is terminal for submissions.
  const addr = body.userAddress.toLowerCase();
  const isCreator = addr === c.creator_address.toLowerCase();
  const isChallenger =
    c.challenger_address !== null &&
    addr === c.challenger_address.toLowerCase();
  if (!isCreator && !isChallenger) {
    return NextResponse.json({ error: "not_a_player" }, { status: 403 });
  }

  const creatorCanSubmit = isCreator
    && (c.status === "accepted" || c.status === "challenger_played");
  const challengerCanSubmit = isChallenger
    && (c.status === "accepted" || c.status === "creator_played");
  if (!creatorCanSubmit && !challengerCanSubmit) {
    return NextResponse.json(
      { error: `cannot_submit_in:${c.status}` },
      { status: 409 },
    );
  }

  // 1. Write to game_scores (existing AutoSubmitScore table) with challenge
  //    id embedded — makes the run visible on the daily leaderboard too.
  const gs = await sb.from("game_scores").insert({
    user_address: addr,
    game_slug: c.game_slug,
    score: body.score,
    game_data: { ...(body.gameData ?? {}), challenge_id: c.id },
  });
  if (gs.error) {
    return NextResponse.json(
      { error: `game_scores_insert: ${gs.error.message}` },
      { status: 500 },
    );
  }

  // 2. Atomic state transition: update the score field AND advance status.
  //    Guarded by a status=WHERE clause so concurrent submits from the same
  //    side can't double-advance.
  const nextStatus = isCreator
    ? c.status === "accepted" ? "creator_played" : "both_played"
    : c.status === "accepted" ? "challenger_played" : "both_played";

  const update: Record<string, unknown> = { status: nextStatus };
  if (isCreator) {
    if (c.creator_score === null || body.score > c.creator_score) {
      update.creator_score = body.score;
    }
  } else {
    if (c.challenger_score === null || body.score > c.challenger_score) {
      update.challenger_score = body.score;
    }
  }

  const upd = await sb
    .from("challenges")
    .update(update)
    .eq("id", c.id)
    .eq("status", c.status) // guard
    .select("id, status")
    .maybeSingle();
  if (upd.error) {
    return NextResponse.json(
      { error: `state_update_failed: ${upd.error.message}` },
      { status: 500 },
    );
  }

  // 3. If we just hit both_played, trigger settle inline. Settle is
  //    idempotent and itself guarded against re-entry.
  let settleResult: Awaited<ReturnType<typeof settleChallenge>> | null = null;
  if (nextStatus === "both_played") {
    settleResult = await settleChallenge(sb, c.id);
  }

  return NextResponse.json({
    ok: true,
    score: body.score,
    status: nextStatus,
    settled: settleResult && settleResult.ok ? true : false,
    settle: settleResult,
  });
}

// ─── POST /api/challenge/:id/settle ────────────────────────────────────────
export async function challengeSettleHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;
  const res = await settleChallenge(sb, ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    status: res.status,
    txHashes: res.txHashes,
  });
}

// ─── GET /api/challenges?game=<slug>&limit=N ──────────────────────────────
export async function challengesListHandler(req: Request) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;
  const url = new URL(req.url);
  const gameSlug = url.searchParams.get("game") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;

  try {
    const rows = await listOpenChallenges(sb, { gameSlug, limit });
    return NextResponse.json({ ok: true, challenges: rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

