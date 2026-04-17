import { NextResponse, type NextRequest } from "next/server";
import type { Address } from "viem";
import { verifyBearer } from "../quick-auth";
import { createAdminSupabase } from "../../supabase/server";
import { signScore } from "../score-signer";
import { ARCADE_POOL_ADDRESS } from "../../contracts/arcade-pool";

type ScoreBody = {
  tournamentId?: unknown;
  score?: unknown;
  maxTile?: unknown;
  moves?: unknown;
  durationMs?: unknown;
  won?: unknown;
  grid?: unknown;
};

function asNonNegInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || !Number.isInteger(v)) return null;
  return v;
}

/**
 * Shared `/api/score` POST handler. Game-agnostic: reads env vars for
 * contract + signer, accepts whatever game data the client puts in
 * `grid`. Each game's route.ts re-exports this as `POST` while keeping
 * `runtime` / `dynamic` segment config local.
 */
export async function scoreHandler(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: ScoreBody;
  try {
    body = (await req.json()) as ScoreBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const score = asNonNegInt(body.score);
  const maxTile = asNonNegInt(body.maxTile) ?? 0;
  const moves = asNonNegInt(body.moves) ?? 0;
  const durationMs = asNonNegInt(body.durationMs) ?? 0;
  const won = Boolean(body.won);
  if (score === null) {
    return NextResponse.json({ error: "invalid_score" }, { status: 400 });
  }

  let tournamentId: bigint;
  try {
    tournamentId = BigInt(
      typeof body.tournamentId === "number" || typeof body.tournamentId === "string"
        ? body.tournamentId
        : 0,
    );
    if (tournamentId < 0n) throw new Error();
  } catch {
    return NextResponse.json(
      { error: "invalid_tournament_id" },
      { status: 400 },
    );
  }

  const admin = createAdminSupabase();

  const { data: user, error: userErr } = await admin
    .from("users")
    .select("id, wallet_address")
    .eq("fid", auth.fid)
    .maybeSingle();

  if (userErr) {
    return NextResponse.json(
      { error: "db_error", detail: userErr.message },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json(
      { error: "user_not_found", hint: "call /api/user/upsert first" },
      { status: 404 },
    );
  }

  const { data: session, error: insErr } = await admin
    .from("game_sessions")
    .insert({
      user_id: user.id,
      score,
      max_tile: maxTile,
      moves,
      duration_ms: durationMs,
      won,
      grid: (body.grid as never) ?? null,
    })
    .select("id")
    .single();

  if (insErr || !session) {
    return NextResponse.json(
      { error: "insert_failed", detail: insErr?.message },
      { status: 500 },
    );
  }

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
  const contract: Address =
    ARCADE_POOL_ADDRESS ?? "0x0000000000000000000000000000000000000000";

  try {
    const { signature, nonce, signer } = await signScore({
      sessionId: session.id,
      tournamentId,
      player: user.wallet_address as Address,
      score: BigInt(score),
      chainId,
      contract,
    });
    return NextResponse.json({
      sessionId: session.id,
      signature,
      nonce: nonce.toString(),
      signer,
      player: user.wallet_address,
      score,
      tournamentId: tournamentId.toString(),
      chainId,
      contract,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "signer_failed";
    return NextResponse.json(
      { error: "signer_failed", detail: message },
      { status: 500 },
    );
  }
}
