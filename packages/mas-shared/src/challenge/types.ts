export type ChallengeStatus =
  | "pending_creator_stake"
  | "open"
  | "accepted"
  | "creator_played"
  | "challenger_played"
  | "both_played"
  | "settled"
  | "expired_refunded"
  | "walkover_creator"
  | "walkover_challenger"
  | "cancelled";

export type ChallengeStake = 0.5 | 1 | 5;
/** 1h / 24h / 7d — picked by the creator at create time. */
export type ChallengeDuration = 3600 | 86400 | 604800;

/** Seed payloads are game-specific. Shape validated per game in seed.ts. */
export type WordleSeed = { word: string };
export type TwoZeroFourEightSeed = {
  startingTiles: Array<{ row: number; col: number; value: number }>;
};
export type HillclimbSeed = { seed: number };
export type ChallengeSeedData = WordleSeed | TwoZeroFourEightSeed | HillclimbSeed;

export interface Challenge {
  id: string;
  game_slug: string;
  creator_address: string;
  /**
   * Pre-play duel: creator_score starts NULL and is filled when Alice
   * submits her score post-accept.
   */
  creator_score: number | null;
  creator_stake_tx_hash: string;
  challenger_address: string | null;
  challenger_score: number | null;
  challenger_stake_tx_hash: string | null;
  seed_data: ChallengeSeedData;
  stake_usdc: number;
  status: ChallengeStatus;
  winner_address: string | null;
  payout_tx_hash: string | null;
  refund_tx_hash: string | null;
  settle_failure_reason: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  settled_at: string | null;
}

export interface CreateChallengeInput {
  gameSlug: string;
  creatorAddress: string;
  /**
   * Pre-play duel model: creator doesn't need a score to create. Optional
   * for back-compat with any callers still passing one.
   */
  creatorScore?: number;
  stakeUsdc: ChallengeStake;
  durationSeconds: ChallengeDuration;
}

export interface CreateChallengeResponse {
  challengeId: string;
  studioWallet: `0x${string}`;
  stakeUsdcAtomic: string; // bigint as string for JSON
  usdcAddress: `0x${string}`;
  expiresAt: string;
  seedPreview: ChallengeSeedData;
}

export interface AcceptChallengeInput {
  challengeId: string;
  challengerAddress: string;
}

export interface AcceptChallengeResponse {
  challenge: Challenge;
  studioWallet: `0x${string}`;
  stakeUsdcAtomic: string;
  usdcAddress: `0x${string}`;
}

export interface ConfirmStakeInput {
  challengeId: string;
  role: "creator" | "challenger";
  txHash: `0x${string}`;
}
