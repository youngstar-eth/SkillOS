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

export type QueueResponse = {
  matchId: string;
  status: MatchStatus;
};

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
