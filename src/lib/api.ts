/**
 * Client-side helpers for our own Next.js API routes.
 * Agent 2 owns the server implementations; this file is the frontend's view
 * of the contract.
 */

export type MatchStatus =
  | "queued"
  | "matched"
  | "in_progress"
  | "awaiting_opponent"
  | "settling"
  | "settled"
  | "refunded"
  | "cancelled";

export type MatchObject = {
  id: string;
  status: MatchStatus;
  seed: string;
  stake_amount_usdc: string;
  player1_address: string;
  player2_address: string | null;
  player1_score: number | null;
  player2_score: number | null;
  winner_address: string | null;
  create_tx_hash: string | null;
  accept_tx_hash: string | null;
  settle_tx_hash: string | null;
  created_at?: string;
  started_at?: string | null;
  ends_at?: string | null;
};

/**
 * Queue response. Fields marked `?` are landing in Agent 2's next drop —
 * treat them as optional until integration, then tighten to required.
 *
 * Role derivation:
 *   - `opponent` present → we are P2 (matched against an existing challenge)
 *   - otherwise         → we are P1 (created a new challenge, waiting to be
 *                                     accepted)
 */
export type QueueResponse = {
  matchId: string;
  status: MatchStatus;

  // Future Agent 2 fields (currently absent from mock endpoint):
  challengeId?: `0x${string}`; // bytes32 on-chain id
  seed?: `0x${string}`; // 64 hex chars — passed to Game2048
  stakeAmount?: string; // atomic units, e.g. "1000000" for 1 USDC
  opponent?: `0x${string}`; // P2-only — address of the challenge creator
};

export type Role = "p1" | "p2";

/** Derive role from the queue response. */
export function roleFromQueueResponse(res: QueueResponse): Role {
  return res.opponent ? "p2" : "p1";
}

/** Post the stake tx to the backend and join the queue. */
export async function queueDuel(body: {
  address: string;
  txHash: string;
}): Promise<QueueResponse> {
  const res = await fetch("/api/duel/queue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`queue failed: ${res.status}`);
  return res.json();
}

/** Fetch current match state. */
export async function getMatchStatus(
  matchId: string,
): Promise<MatchObject | { matchId: string; status: MatchStatus }> {
  const res = await fetch(`/api/duel/status?matchId=${encodeURIComponent(matchId)}`);
  if (!res.ok) throw new Error(`status failed: ${res.status}`);
  return res.json();
}

/** Cancel a queued duel (refund path). */
export async function cancelDuel(matchId: string): Promise<{ ok: boolean }> {
  const res = await fetch("/api/duel/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ matchId }),
  });
  if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
  return res.json();
}

/** Submit a final score + attestation signature. */
export async function submitScore(body: {
  matchId: string;
  score: number;
  signature: string;
}): Promise<{ settled: boolean }> {
  const res = await fetch("/api/duel/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status}`);
  return res.json();
}
