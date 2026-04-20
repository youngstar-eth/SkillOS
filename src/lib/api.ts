/**
 * Browser-side fetch helpers for our Next.js API routes.
 *
 * Types mirror the backend's `sanitizeDuel` output in src/lib/http.ts.
 * The backend is the source of truth — update this file if the sanitize
 * shape changes.
 */

import type { Address, Hex } from "viem";

// ─── Types (canonical, match sanitizeDuel) ─────────────────────────────────

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

// ─── Low-level JSON helpers ────────────────────────────────────────────────

async function parseResponse<T>(res: Response, label: string): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  let body: unknown = null;
  if (ct.includes("application/json")) {
    body = await res.json().catch(() => null);
  }
  if (!res.ok) {
    const api = body as ApiError | null;
    const err = new Error(
      api?.message ?? `${label} failed: ${res.status}`,
    ) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = api?.error;
    throw err;
  }
  return body as T;
}

// ─── Queue (P1 enqueue OR P2 match) ────────────────────────────────────────

/**
 * P1 enqueue: client has just called `createChallenge(...)` on-chain and
 * passes its tx hash + the matchId it generated. Server inserts the
 * v2_duels row with status='queued'.
 */
export async function queueAsCreator(body: {
  address: Address;
  matchId: string;
  createTxHash: Hex;
}): Promise<MatchObject> {
  const res = await fetch("/api/duel/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse<MatchObject>(res, "queue");
}

/**
 * P2 match: client posts only their address. Server atomically claims the
 * oldest queued row (FIFO) and returns the match, or 404 with
 * error='no_queued_challenges'.
 */
export async function matchAsChallenger(body: {
  address: Address;
}): Promise<MatchObject> {
  const res = await fetch("/api/duel/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse<MatchObject>(res, "queue");
}

/**
 * P2 records the `acceptChallenge` tx hash after it confirms on-chain.
 */
export async function postAcceptTx(body: {
  matchId: string;
  acceptTxHash: Hex;
}): Promise<{ ok: true; matchId: string; acceptTxHash: Hex }> {
  const res = await fetch("/api/duel/queue/accept-tx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(res, "accept-tx");
}

// ─── Status ────────────────────────────────────────────────────────────────

export async function getMatchStatus(matchId: string): Promise<MatchObject> {
  const res = await fetch(
    `/api/duel/status?matchId=${encodeURIComponent(matchId)}`,
  );
  return parseResponse<MatchObject>(res, "status");
}

export async function getMatchByAddress(
  address: Address,
): Promise<MatchObject> {
  const res = await fetch(
    `/api/duel/status?address=${encodeURIComponent(address)}`,
  );
  return parseResponse<MatchObject>(res, "status");
}

// ─── Submit ────────────────────────────────────────────────────────────────

/**
 * Submit final score. No wallet signature required — the server signs a
 * settle attestation using the studio key once both players submit.
 */
export async function submitScore(body: {
  matchId: string;
  address: Address;
  score: number;
}): Promise<SubmitResponse> {
  const res = await fetch("/api/duel/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse<SubmitResponse>(res, "submit");
}
