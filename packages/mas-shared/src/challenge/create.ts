import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHALLENGE_ESCROW_ADDRESS,
  slugToBytes32,
  uuidToBytes32,
  USDC_ADDRESS,
} from "../contracts";
import { generateChallengeSeed } from "./seed";
import type {
  ChallengeDuration,
  ChallengeStake,
  CreateChallengeInput,
  CreateChallengeResponse,
} from "./types";
import type { Challenge } from "./types";

const ALLOWED_STAKES: Set<ChallengeStake> = new Set([0.5, 1, 5]);
const ALLOWED_DURATIONS: Set<ChallengeDuration> = new Set([
  3600, 86400, 604800,
]);
const SUPPORTED_GAMES = new Set(["wordle", "2048", "hillclimb"]);

/**
 * On-chain escrow model (F2b):
 *   1. We allocate a DB row in `pending_creator_stake` state with a
 *      UUID-derived bytes32 onchain id and the target contract address.
 *   2. We generate the deterministic game seed.
 *   3. The response tells the client exactly what to sign:
 *        - usdcAddress, stakeAtomic, challengeEscrowAddress, onchainId,
 *          gameSlugBytes32, durationSeconds
 *   4. Client signs USDC.approve(escrow, stake) + createChallenge(...).
 *   5. Client POSTs the tx hash to /confirm-create, which verifies the
 *      ChallengeCreated event on-chain before flipping status to 'open'.
 *
 * No server-side stake transfer is performed — this is non-custodial.
 */
export async function createChallenge(
  supabase: SupabaseClient,
  input: CreateChallengeInput,
): Promise<
  | { ok: true; response: CreateChallengeResponse }
  | { ok: false; error: string }
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
  if (
    input.creatorScore !== undefined &&
    (!Number.isFinite(input.creatorScore) || input.creatorScore < 0)
  ) {
    return { ok: false, error: "invalid_creator_score" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + input.durationSeconds * 1000,
  ).toISOString();

  const pre = await supabase
    .from("challenges")
    .insert({
      game_slug: input.gameSlug,
      creator_address: input.creatorAddress.toLowerCase(),
      creator_score: input.creatorScore ?? null,
      creator_stake_tx_hash: null,
      seed_data: {},
      stake_usdc: input.stakeUsdc,
      status: "pending_creator_stake",
      expires_at: expiresAt,
      created_at: nowIso,
      contract_address: CHALLENGE_ESCROW_ADDRESS,
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

  // Derive the bytes32 id the contract will see.
  const onchainId = uuidToBytes32(challengeId);

  const upd = await supabase
    .from("challenges")
    .update({ seed_data: seed, onchain_id: onchainId })
    .eq("id", challengeId);
  if (upd.error) {
    return { ok: false, error: `db_seed_update_failed: ${upd.error.message}` };
  }

  const stakeAtomic = BigInt(Math.round(input.stakeUsdc * 1_000_000));

  return {
    ok: true,
    response: {
      challengeId,
      studioWallet: CHALLENGE_ESCROW_ADDRESS, // kept for back-compat; contract is the counterparty
      stakeUsdcAtomic: stakeAtomic.toString(),
      usdcAddress: USDC_ADDRESS,
      expiresAt,
      seedPreview: seed,
      // F2b: on-chain context for the client
      onchainId,
      contractAddress: CHALLENGE_ESCROW_ADDRESS,
      gameSlugBytes32: slugToBytes32(input.gameSlug),
      durationSeconds: input.durationSeconds,
    } as CreateChallengeResponse,
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
