// ───────────────────────────────────────────────────────────────────────────
// Server-side HTTP helpers for Next.js API routes.
//
// Thin layer intentionally — each route is short enough that a framework
// of its own would be overkill. These helpers just remove the handful of
// repeated patterns: JSON responses, address normalization, format checks,
// row sanitization for outbound payloads.
//
// NOTE: server-only (NextResponse, Next.js runtime). Browser fetch helpers
// live in @skillbase/ui's api-client.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { type Address, getAddress, isAddress } from "viem";
import type { Duel } from "@skillbase/game-types";

export function jsonOk<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function jsonError(
  code: string,
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

export function parseAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value)) return null;
  // Return EIP-55 checksummed form — keeps LEAST/GREATEST index consistent.
  return getAddress(value);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

const TX_HASH_RE = /^0x[0-9a-f]{64}$/i;
export function isTxHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && TX_HASH_RE.test(value);
}

/**
 * Serialize a v2_duels row for public consumption. The backend doesn't
 * store any secret per-row state today, but this gives us a seam to
 * filter later without touching call sites.
 */
export function sanitizeDuel(duel: Duel) {
  return {
    matchId: duel.id,
    challengeId: duel.onchain_id,
    status: duel.status,
    seed: duel.seed,
    stakeAmount: duel.stake_amount_usdc.toString(),
    player1: {
      address: duel.player1_address,
      score: duel.player1_score,
      submittedAt: duel.player1_submitted_at,
    },
    player2: duel.player2_address
      ? {
          address: duel.player2_address,
          score: duel.player2_score,
          submittedAt: duel.player2_submitted_at,
        }
      : null,
    matchedAt: duel.matched_at,
    settledAt: duel.settled_at,
    winnerAddress: duel.winner_address,
    createTxHash: duel.create_tx_hash,
    acceptTxHash: duel.accept_tx_hash,
    settleTxHash: duel.settle_tx_hash,
    createdAt: duel.created_at,
    updatedAt: duel.updated_at,
  };
}
