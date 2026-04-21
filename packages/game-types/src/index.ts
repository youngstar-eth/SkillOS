// ───────────────────────────────────────────────────────────────────────────
// Shared TypeScript types for the Skillbase duel system.
//
// These describe the wire shape between backend API routes and client
// consumers. The server's `sanitizeDuel` (in @skillbase/lib-shared) is the
// source of truth for the shape — keep these in sync if it changes.
// ───────────────────────────────────────────────────────────────────────────

import type { Address, Hex } from "viem";

export type DuelStatus =
  | "queued"
  | "matched"
  | "player1_submitted"
  | "player2_submitted"
  | "settled"
  | "refunded";

export interface PlayerSlot {
  address: Address;
  score: number | null;
  submittedAt: string | null;
}

export interface MatchObject {
  matchId: string;
  challengeId: Hex | null;
  status: DuelStatus;
  seed: Hex;
  stakeAmount: string; // stringified bigint
  player1: PlayerSlot;
  player2: PlayerSlot | null;
  matchedAt: string | null;
  settledAt: string | null;
  winnerAddress: Address | null;
  createTxHash: Hex | null;
  acceptTxHash: Hex | null;
  settleTxHash: Hex | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface SubmitResponse {
  submitted: boolean;
  settled: boolean;
  winner: Address | null;
  settleTxHash: Hex | null;
}

export interface ApiError {
  error: string;
  message: string;
  [k: string]: unknown;
}

/** Row shape for the v2_duels table (Supabase). */
export interface Duel {
  id: string;
  /** 0x-prefixed bytes32 hex matching ChallengeEscrow challenges[id]. */
  onchain_id: string | null;
  status: DuelStatus;
  player1_address: string;
  player1_score: number | null;
  player1_submitted_at: string | null;
  player2_address: string | null;
  player2_score: number | null;
  player2_submitted_at: string | null;
  /** 0x + 64 hex, shared with the game engine for deterministic RNG. */
  seed: string;
  stake_amount_usdc: number;
  matched_at: string | null;
  settled_at: string | null;
  winner_address: string | null;
  create_tx_hash: string | null;
  accept_tx_hash: string | null;
  settle_tx_hash: string | null;
  created_at: string;
  updated_at: string | null;
}
