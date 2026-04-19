import type { SupabaseClient } from "@supabase/supabase-js";
import { USDC_ADDRESS } from "../contracts/arcade-pool";
import { generateChallengeSeed } from "./seed";
import { getStudioWalletAddress } from "./studio-wallet";
import type {
  Challenge,
  ChallengeDuration,
  ChallengeStake,
  CreateChallengeInput,
  CreateChallengeResponse,
} from "./types";

const ALLOWED_STAKES: Set<ChallengeStake> = new Set([0.5, 1, 5]);
const ALLOWED_DURATIONS: Set<ChallengeDuration> = new Set([
  3600, 86400, 604800,
]);
const SUPPORTED_GAMES = new Set(["wordle", "2048", "hillclimb"]);

/**
 * Create a DB row in `pending_creator_stake`. Alice then sends USDC to the
 * studio wallet and calls confirm-stake with the tx hash. We generate the
 * seed upfront so the challengeId is known before Alice's tx lands.
 */
export async function createChallenge(
  supabase: SupabaseClient,
  input: CreateChallengeInput,
): Promise<
  { ok: true; response: CreateChallengeResponse } | { ok: false; error: string }
> {
  if (!SUPPORTED_GAMES.has(input.gameSlug)) {
    return { ok: false, error: `unsupported_game: ${input.gameSlug}` };
  }
  if (!ALLOWED_STAKES.has(input.stakeUsdc)) {
    return { ok: false, error: "invalid_stake (allowed: 0.5 / 1 / 5)" };
  }
  if (!ALLOWED_DURATIONS.has(input.durationSeconds)) {
    return {
      ok: false,
      error: "invalid_duration (allowed: 3600 / 86400 / 604800)",
    };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.creatorAddress)) {
    return { ok: false, error: "invalid_creator_address" };
  }
  if (!Number.isFinite(input.creatorScore) || input.creatorScore < 0) {
    return { ok: false, error: "invalid_creator_score" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + input.durationSeconds * 1000,
  ).toISOString();

  // Seed depends on challengeId, which Postgres generates on insert. So we
  // do a pre-insert (id is a uuid default) then UPDATE the seed once we
  // know the id. Two writes, still atomic for the client.
  const pre = await supabase
    .from("challenges")
    .insert({
      game_slug: input.gameSlug,
      creator_address: input.creatorAddress.toLowerCase(),
      creator_score: input.creatorScore,
      creator_stake_tx_hash: "", // filled in on confirm-stake
      seed_data: {}, // placeholder
      stake_usdc: input.stakeUsdc,
      status: "pending_creator_stake",
      expires_at: expiresAt,
      created_at: nowIso,
    })
    .select("id, created_at")
    .single();

  if (pre.error || !pre.data) {
    return {
      ok: false,
      error: `db_insert_failed: ${pre.error?.message ?? "unknown"}`,
    };
  }

  const challengeId = pre.data.id as string;
  const createdAt = (pre.data.created_at as string) ?? nowIso;
  const seed = generateChallengeSeed(input.gameSlug, challengeId, createdAt);

  const upd = await supabase
    .from("challenges")
    .update({ seed_data: seed })
    .eq("id", challengeId);

  if (upd.error) {
    return { ok: false, error: `db_seed_update_failed: ${upd.error.message}` };
  }

  const studioWallet = getStudioWalletAddress();
  const stakeAtomic = BigInt(Math.round(input.stakeUsdc * 1_000_000));

  return {
    ok: true,
    response: {
      challengeId,
      studioWallet,
      stakeUsdcAtomic: stakeAtomic.toString(),
      usdcAddress: USDC_ADDRESS,
      expiresAt,
      seedPreview: seed,
    },
  };
}

export async function getChallenge(
  supabase: SupabaseClient,
  id: string,
): Promise<Challenge | null> {
  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getChallenge: ${error.message}`);
  return (data as Challenge | null) ?? null;
}
