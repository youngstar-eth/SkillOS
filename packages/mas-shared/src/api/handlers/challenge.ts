import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Address, Hex } from "viem";
import {
  createChallenge,
  getChallenge,
  listOpenChallenges,
  signSettleAttestation,
  verifyChallengeAcceptedTx,
  verifyChallengeCreatedTx,
  verifyChallengeSettledTx,
} from "../../challenge";
import type {
  ChallengeDuration,
  ChallengeStake,
} from "../../challenge/types";
import { CHALLENGE_ESCROW_ADDRESS } from "../../contracts";

/**
 * F2b — On-chain ChallengeEscrow integration.
 *
 *   POST /api/challenge/create
 *   POST /api/challenge/:id/confirm-create   — verifies ChallengeCreated event
 *   GET  /api/challenge/:id/prepare-accept   — stake instructions for Bob
 *   POST /api/challenge/:id/accept           — verifies ChallengeAccepted event
 *   POST /api/challenge/:id/submit-score     — role-based, no auto-settle
 *   POST /api/challenge/:id/settle           — signs attestation, returns sig
 *   POST /api/challenge/:id/confirm-settle   — verifies ChallengeSettled event
 *   POST /api/challenge/:id/confirm-stake    — legacy shim, routes to confirm-create
 *   GET  /api/challenge/:id
 *   GET  /api/challenges?game=<slug>
 *
 * Non-custodial: the server never transfers USDC. All transfers happen
 * inside the ChallengeEscrow contract. The server only signs the winner
 * attestation that the client submits to settle().
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

  if (!body)
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  const { gameSlug, creatorAddress, creatorScore, stakeUsdc, durationSeconds } =
    body;
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

// ─── POST /api/challenge/:id/confirm-create ────────────────────────────────
// Client calls after createChallenge() tx mines. We verify the event + flip
// status: pending_creator_stake → open.
export async function challengeConfirmCreateHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const body = (await req.json().catch(() => null)) as {
    creatorAddress?: string;
    txHash?: Hex;
  } | null;
  if (!body?.creatorAddress || !body?.txHash) {
    return NextResponse.json(
      { error: "missing_fields", need: ["creatorAddress", "txHash"] },
      { status: 400 },
    );
  }

  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.status !== "pending_creator_stake") {
    return NextResponse.json(
      { error: `already_confirmed_in:${c.status}` },
      { status: 409 },
    );
  }
  if (c.creator_address.toLowerCase() !== body.creatorAddress.toLowerCase()) {
    return NextResponse.json({ error: "creator_mismatch" }, { status: 403 });
  }
  if (!c.onchain_id || !c.contract_address) {
    return NextResponse.json(
      { error: "challenge_missing_onchain_fields" },
      { status: 500 },
    );
  }

  const verify = await verifyChallengeCreatedTx(
    body.txHash,
    c.onchain_id as Hex,
    c.creator_address as Address,
    c.contract_address as Address,
  );
  if (!verify.verified) {
    return NextResponse.json(
      { error: "verify_failed", reason: verify.reason },
      { status: 422 },
    );
  }

  const upd = await sb
    .from("challenges")
    .update({
      status: "open",
      creator_stake_tx_hash: body.txHash,
      onchain_create_tx_hash: body.txHash,
      // Sync expires_at with what the contract actually recorded (block.timestamp + duration)
      expires_at: verify.expiresAt
        ? new Date(Number(verify.expiresAt) * 1000).toISOString()
        : c.expires_at,
    })
    .eq("id", ctx.params.id)
    .eq("status", "pending_creator_stake")
    .select("id, status, expires_at")
    .maybeSingle();
  if (upd.error || !upd.data) {
    return NextResponse.json(
      { error: upd.error?.message ?? "transition_lost_race" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true, status: "open", expiresAt: upd.data.expires_at });
}

// Legacy alias — old route path was `/confirm-stake` with role=creator.
// Keep it as a redirect-equivalent so in-flight deploys don't break.
export async function challengeConfirmStakeHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const body = (await req.json().catch(() => null)) as {
    role?: "creator" | "challenger";
    txHash?: Hex;
  } | null;
  if (body?.role !== "creator") {
    return NextResponse.json(
      { error: "use_confirm_create_or_accept_endpoint" },
      { status: 400 },
    );
  }
  // Fetch creator address from the row so legacy clients don't need to send it.
  const sb = gate();
  if (sb instanceof NextResponse) return sb;
  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return challengeConfirmCreateHandler(
    new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatorAddress: c.creator_address,
        txHash: body.txHash,
      }),
    }),
    ctx,
  );
}

// ─── GET /api/challenge/:id/prepare-accept ────────────────────────────────
// Returns the data Bob needs to sign USDC.approve + acceptChallenge().
export async function challengePrepareAcceptHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const url = new URL(req.url);
  const challengerAddress = url.searchParams.get("challenger");
  if (!challengerAddress) {
    return NextResponse.json({ error: "missing_challenger" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(challengerAddress)) {
    return NextResponse.json(
      { error: "invalid_challenger_address" },
      { status: 400 },
    );
  }

  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.status !== "open") {
    return NextResponse.json(
      { error: `cannot_accept_in_state:${c.status}` },
      { status: 409 },
    );
  }
  if (c.creator_address.toLowerCase() === challengerAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "self_accept_forbidden" },
      { status: 403 },
    );
  }
  if (new Date(c.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (!c.onchain_id || !c.contract_address) {
    return NextResponse.json(
      { error: "challenge_missing_onchain_fields" },
      { status: 500 },
    );
  }

  const stakeAtomic = BigInt(Math.round(c.stake_usdc * 1_000_000));
  return NextResponse.json({
    ok: true,
    challenge: c,
    studioWallet: c.contract_address, // legacy field name
    stakeUsdcAtomic: stakeAtomic.toString(),
    usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    onchainId: c.onchain_id,
    contractAddress: c.contract_address,
  });
}

// ─── POST /api/challenge/:id/accept ────────────────────────────────────────
// Bob already signed USDC.approve + acceptChallenge(). We verify the
// ChallengeAccepted event and flip status: open → accepted.
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
  if (!/^0x[0-9a-fA-F]{40}$/.test(body.challengerAddress)) {
    return NextResponse.json(
      { error: "invalid_challenger_address" },
      { status: 400 },
    );
  }

  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.status !== "open") {
    return NextResponse.json(
      { error: `cannot_accept_in_state:${c.status}` },
      { status: 409 },
    );
  }
  if (c.creator_address.toLowerCase() === body.challengerAddress.toLowerCase()) {
    return NextResponse.json({ error: "self_accept_forbidden" }, { status: 403 });
  }
  if (!c.onchain_id || !c.contract_address) {
    return NextResponse.json(
      { error: "challenge_missing_onchain_fields" },
      { status: 500 },
    );
  }

  const verify = await verifyChallengeAcceptedTx(
    body.txHash,
    c.onchain_id as Hex,
    body.challengerAddress as Address,
    c.contract_address as Address,
  );
  if (!verify.verified) {
    return NextResponse.json(
      { error: "verify_failed", reason: verify.reason },
      { status: 422 },
    );
  }

  const upd = await sb
    .from("challenges")
    .update({
      status: "accepted",
      challenger_address: body.challengerAddress.toLowerCase(),
      challenger_stake_tx_hash: body.txHash,
      onchain_accept_tx_hash: body.txHash,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", ctx.params.id)
    .eq("status", "open")
    .is("challenger_address", null)
    .select("id")
    .maybeSingle();
  if (upd.error || !upd.data) {
    return NextResponse.json(
      { error: upd.error?.message ?? "already_accepted_or_expired" },
      { status: 409 },
    );
  }

  const latest = await getChallenge(sb, ctx.params.id);
  return NextResponse.json({ ok: true, challenge: latest });
}

// ─── GET /api/challenge/:id ────────────────────────────────────────────────
export async function challengeGetHandler(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;
  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, challenge: c });
}

// ─── POST /api/challenge/:id/submit-score ─────────────────────────────────
// Off-chain score record. State machine:
//   accepted         → creator_played / challenger_played
//   challenger_played → both_played (if creator submits)
//   creator_played   → both_played (if challenger submits)
// No auto-settle on both_played — client must call /settle to get the
// attestation signature, then submit contract.settle() on-chain.
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

  const addr = body.userAddress.toLowerCase();
  const isCreator = addr === c.creator_address.toLowerCase();
  const isChallenger =
    c.challenger_address !== null &&
    addr === c.challenger_address.toLowerCase();
  if (!isCreator && !isChallenger) {
    return NextResponse.json({ error: "not_a_player" }, { status: 403 });
  }

  const creatorCanSubmit =
    isCreator &&
    (c.status === "accepted" || c.status === "challenger_played");
  const challengerCanSubmit =
    isChallenger &&
    (c.status === "accepted" || c.status === "creator_played");
  if (!creatorCanSubmit && !challengerCanSubmit) {
    return NextResponse.json(
      { error: `cannot_submit_in:${c.status}` },
      { status: 409 },
    );
  }

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

  const nextStatus = isCreator
    ? c.status === "accepted"
      ? "creator_played"
      : "both_played"
    : c.status === "accepted"
      ? "challenger_played"
      : "both_played";

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
    .eq("status", c.status)
    .select("id, status")
    .maybeSingle();
  if (upd.error) {
    return NextResponse.json(
      { error: `state_update_failed: ${upd.error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    score: body.score,
    status: nextStatus,
  });
}

// ─── POST /api/challenge/:id/settle ───────────────────────────────────────
// Both sides played. Determine winner, sign attestation, return signature.
// Client then submits contract.settle(id, winner, cScore, chScore, sig).
export async function challengeSettleHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.status !== "both_played") {
    return NextResponse.json(
      { error: `cannot_settle_in:${c.status}` },
      { status: 409 },
    );
  }
  if (
    !c.onchain_id ||
    !c.contract_address ||
    c.creator_score === null ||
    c.challenger_score === null ||
    !c.challenger_address
  ) {
    return NextResponse.json(
      { error: "challenge_incomplete_for_settle" },
      { status: 409 },
    );
  }

  const pk = process.env.STUDIO_PRIVATE_KEY as Hex | undefined;
  if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    return NextResponse.json(
      { error: "signer_not_configured" },
      { status: 503 },
    );
  }

  // Winner: higher score; tie goes to creator. Matches ChallengeEscrow's
  // on-chain permitted winners (must be creator or challenger).
  const winner = (c.challenger_score > c.creator_score
    ? c.challenger_address
    : c.creator_address) as Address;

  const chainId = BigInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");

  const { signature } = await signSettleAttestation({
    challengeId: c.onchain_id as Hex,
    winner,
    creatorScore: BigInt(c.creator_score),
    challengerScore: BigInt(c.challenger_score),
    contractAddress: c.contract_address as Address,
    chainId,
    signerPrivateKey: pk,
  });

  await sb
    .from("challenges")
    .update({ winner_address: winner.toLowerCase(), settle_signature: signature })
    .eq("id", c.id);

  return NextResponse.json({
    ok: true,
    winner,
    creatorScore: c.creator_score,
    challengerScore: c.challenger_score,
    signature,
    onchainId: c.onchain_id,
    contractAddress: c.contract_address,
  });
}

// ─── POST /api/challenge/:id/confirm-settle ───────────────────────────────
// Client submitted contract.settle() — we verify the ChallengeSettled
// event and flip status to settled.
export async function challengeConfirmSettleHandler(
  req: Request,
  ctx: { params: { id: string } },
) {
  const sb = gate();
  if (sb instanceof NextResponse) return sb;

  const body = (await req.json().catch(() => null)) as {
    txHash?: Hex;
  } | null;
  if (!body?.txHash) {
    return NextResponse.json({ error: "missing_tx_hash" }, { status: 400 });
  }

  const c = await getChallenge(sb, ctx.params.id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (c.status === "settled") {
    return NextResponse.json({
      ok: true,
      status: "settled",
      txHash: c.onchain_settle_tx_hash,
    });
  }
  if (c.status !== "both_played") {
    return NextResponse.json(
      { error: `cannot_confirm_in:${c.status}` },
      { status: 409 },
    );
  }
  if (!c.onchain_id || !c.contract_address || !c.winner_address) {
    return NextResponse.json(
      { error: "challenge_missing_onchain_fields" },
      { status: 500 },
    );
  }

  const verify = await verifyChallengeSettledTx(
    body.txHash,
    c.onchain_id as Hex,
    c.winner_address as Address,
    c.contract_address as Address,
  );
  if (!verify.verified) {
    return NextResponse.json(
      { error: "verify_failed", reason: verify.reason },
      { status: 422 },
    );
  }

  await sb
    .from("challenges")
    .update({
      status: "settled",
      onchain_settle_tx_hash: body.txHash,
      payout_tx_hash: body.txHash,
      settled_at: new Date().toISOString(),
    })
    .eq("id", c.id);

  return NextResponse.json({
    ok: true,
    status: "settled",
    txHash: body.txHash,
    payout: verify.payout?.toString(),
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

// Silence unused-import warning for CHALLENGE_ESCROW_ADDRESS import that
// future handlers may read; keep the re-export for callers convenience.
export { CHALLENGE_ESCROW_ADDRESS };
