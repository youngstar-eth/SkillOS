import type { SupabaseClient } from "@supabase/supabase-js";
import type { Address } from "viem";
import { USDC_ADDRESS } from "../contracts/arcade-pool";
import { getStudioWalletAddress } from "./studio-wallet";
import type { AcceptChallengeInput, AcceptChallengeResponse, Challenge } from "./types";

/**
 * Step 1 of accept: Bob fetches the challenge and the stake instructions.
 * State machine stays `open`; we just hand out the stake destination +
 * amount. Bob then signs USDC.transfer(studio, stake) and calls
 * /confirm-stake to advance state → `accepted`.
 *
 * We don't reserve anything here — reservation happens atomically in
 * confirm-stake via the conditional UPDATE guard, so races between two
 * potential accepters resolve on "first valid tx wins".
 */
export async function prepareAcceptChallenge(
  supabase: SupabaseClient,
  input: AcceptChallengeInput,
): Promise<
  | { ok: true; response: AcceptChallengeResponse }
  | { ok: false; error: string; status?: number }
> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.challengerAddress)) {
    return { ok: false, error: "invalid_challenger_address", status: 400 };
  }

  const { data, error } = await supabase
    .from("challenges")
    .select("*")
    .eq("id", input.challengeId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: `db_read: ${error.message}`, status: 500 };
  }
  const c = data as Challenge | null;
  if (!c) return { ok: false, error: "not_found", status: 404 };

  if (c.status !== "open") {
    return {
      ok: false,
      error: `cannot_accept_in_state:${c.status}`,
      status: 409,
    };
  }
  if (new Date(c.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "expired", status: 410 };
  }
  if (c.creator_address.toLowerCase() === input.challengerAddress.toLowerCase()) {
    return { ok: false, error: "self_accept_forbidden", status: 403 };
  }

  const studioWallet = getStudioWalletAddress() as Address;
  const stakeAtomic = BigInt(Math.round(c.stake_usdc * 1_000_000));

  return {
    ok: true,
    response: {
      challenge: c,
      studioWallet,
      stakeUsdcAtomic: stakeAtomic.toString(),
      usdcAddress: USDC_ADDRESS,
    },
  };
}

/**
 * Transition `open → accepted` — called from confirm-stake after Bob's
 * on-chain USDC.transfer is verified. Guarded by an atomic UPDATE that
 * only succeeds if the row is still `open`, so the second of two
 * simultaneous Bobs gets `already_accepted`.
 */
export async function markAccepted(
  supabase: SupabaseClient,
  challengeId: string,
  challengerAddress: string,
  txHash: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const upd = await supabase
    .from("challenges")
    .update({
      status: "accepted",
      challenger_address: challengerAddress.toLowerCase(),
      challenger_stake_tx_hash: txHash,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", challengeId)
    .eq("status", "open") // atomic guard — loses to first concurrent accept
    .is("challenger_address", null)
    .select("id")
    .maybeSingle();

  if (upd.error) return { ok: false, error: upd.error.message };
  if (!upd.data) return { ok: false, error: "already_accepted_or_expired" };
  return { ok: true };
}
