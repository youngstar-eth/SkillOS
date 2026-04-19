/**
 * Shared USDC transfer helper.
 *
 * Single code path used by:
 *   - scripts/daily-payout.ts (cron: category + overall + game settle)
 *   - packages/mas-shared/src/api/handlers/payout-trigger.ts (Feature 1: instant)
 *   - packages/mas-shared/src/challenge/settle.ts (Feature 2: challenge settle)
 *
 * Race model (see migration 20260419000000_payouts_instant_scope.sql):
 *   - UNIQUE partial index on payouts(user_address, scope, day, game_slug,
 *     category, rank) WHERE status IN ('pending','sent') serializes concurrent
 *     callers for the same slot.
 *   - Two-phase write: INSERT pending → USDC.transfer → UPDATE sent.
 *   - Conflict on phase 1 means another caller owns the slot; we peek at its
 *     status and return a 'duplicate' result without touching the chain.
 *   - Stale 'pending' rows (>10 min, typically a crashed Node process) are
 *     lazily reclaimed as 'failed' and the operation retries once.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { SupabaseClient } from "@supabase/supabase-js";
import { USDC_ABI, USDC_ADDRESS } from "../contracts";

export type PayoutScope =
  | "game"
  | "category"
  | "overall"
  | "instant"
  | "challenge";

export type ChainPublicClient = ReturnType<typeof createPublicClient>;
export type ChainWalletClient = ReturnType<typeof createWalletClient>;

export interface TransferOptions {
  userAddress: string;
  /** USDC (decimal — e.g. 0.9, not 900000). */
  amount: number;
  scope: PayoutScope;
  category: string | null;
  gameSlug: string | null;
  /** YYYY-MM-DD. Part of the dedup key. */
  day: string;
  rank: number | null;
  /** Optional log label. */
  label?: string;
  /** Stale-pending cleanup threshold. Defaults to 10 minutes. */
  stalePendingMs?: number;
}

export type TransferResult =
  | { status: "sent"; txHash: Hex; payoutId: string; amount: number }
  | {
      status: "duplicate";
      existing: { id: string; status: string; tx_hash: string | null };
    }
  | { status: "dry_run"; payoutId: string; amount: number }
  | { status: "failed"; error: string; payoutId: string };

export interface TransferDeps {
  supabase: SupabaseClient;
  /** Optional — defaults to env-driven clients on base-sepolia. */
  pub?: ChainPublicClient;
  wallet?: ChainWalletClient;
  /** Skip both chain writes and DB reservation. */
  dryRun?: boolean;
}

// Return type inferred — viem's WalletClient type narrows on `account` and
// we don't want to widen it back by annotating.
export function defaultChainClients() {
  const pk = process.env.STUDIO_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("STUDIO_PRIVATE_KEY not set");
  const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  const account = privateKeyToAccount(pk);
  const pub = createPublicClient({
    chain: baseSepolia,
    transport: http(rpc),
  });
  const wallet = createWalletClient({
    chain: baseSepolia,
    transport: http(rpc),
    account,
  });
  return { pub, wallet };
}

function toUSDCAtomicUnits(n: number): bigint {
  return BigInt(Math.round(n * 1_000_000));
}

export async function transferUSDCWithLog(
  opts: TransferOptions,
  deps: TransferDeps,
): Promise<TransferResult> {
  const stalePendingMs = opts.stalePendingMs ?? 10 * 60 * 1000;
  const userAddr = opts.userAddress.toLowerCase();

  // Scoped lookup — exactly mirrors the composite UNIQUE partial index
  // uniq_payouts_active_slot. MUST include game_slug, category, rank, else
  // a retry for one (user,game) can surface another (user,different-game)
  // payout's tx_hash by accident.
  const findExisting = () => {
    let q = deps.supabase
      .from("payouts")
      .select("id, status, tx_hash, created_at")
      .eq("user_address", userAddr)
      .eq("scope", opts.scope)
      .eq("day", opts.day)
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(1);
    // coalesce(x, '') in the index → we match NULLs with .is(null) and
    // non-NULLs with .eq(...). Supabase's .eq(null) silently returns empty.
    q = opts.gameSlug === null ? q.is("game_slug", null) : q.eq("game_slug", opts.gameSlug);
    q = opts.category === null ? q.is("category", null) : q.eq("category", opts.category);
    q = opts.rank === null ? q.is("rank", null) : q.eq("rank", opts.rank);
    return q;
  };

  if (deps.dryRun) {
    // Check-only path: peek at the payouts table and report.
    const { data: existing } = await findExisting();
    const row = existing?.[0];
    if (row) {
      return {
        status: "duplicate",
        existing: {
          id: row.id,
          status: row.status,
          tx_hash: row.tx_hash ?? null,
        },
      };
    }
    return { status: "dry_run", payoutId: "", amount: opts.amount };
  }

  // Phase 1 — reserve the slot.
  const reservation = await deps.supabase
    .from("payouts")
    .insert({
      user_address: userAddr,
      amount_usdc: opts.amount,
      scope: opts.scope,
      category: opts.category,
      game_slug: opts.gameSlug,
      day: opts.day,
      rank: opts.rank,
      status: "pending",
    })
    .select("id")
    .single();

  const conflict =
    reservation.error &&
    (reservation.error.code === "23505" ||
      reservation.error.message?.includes("uniq_payouts_active_slot"));

  if (conflict) {
    const { data: existing } = await findExisting();
    const row = existing?.[0];
    if (
      row &&
      row.status === "pending" &&
      Date.now() - new Date(row.created_at).getTime() > stalePendingMs
    ) {
      await deps.supabase
        .from("payouts")
        .update({
          status: "failed",
          failure_reason: "stale_pending_reclaimed",
        })
        .eq("id", row.id);
      // Retry once — slot is free now.
      return transferUSDCWithLog(opts, deps);
    }

    return {
      status: "duplicate",
      existing: {
        id: row?.id ?? "",
        status: row?.status ?? "unknown",
        tx_hash: row?.tx_hash ?? null,
      },
    };
  }

  if (reservation.error) {
    throw new Error(`reservation failed: ${reservation.error.message}`);
  }

  const payoutId = reservation.data!.id as string;

  // Phase 2 — on-chain transfer.
  const { wallet, pub } =
    deps.wallet && deps.pub
      ? { wallet: deps.wallet, pub: deps.pub }
      : defaultChainClients();

  try {
    // writeContract is generically typed against the ABI + account; when the
    // caller supplies their own client (from daily-payout.ts or an HTTP
    // handler) the two client unions diverge in viem's types even though the
    // shape is identical. Cast through an untyped surface to sidestep the
    // structural mismatch — we're only using writeContract here.
    const wc = (wallet as { writeContract: (args: unknown) => Promise<Hex> })
      .writeContract;
    const hash = await wc({
      chain: baseSepolia,
      account: wallet.account!,
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "transfer",
      args: [userAddr as Address, toUSDCAtomicUnits(opts.amount)],
    });
    await (
      pub as { waitForTransactionReceipt: (args: { hash: Hex }) => Promise<unknown> }
    ).waitForTransactionReceipt({ hash });

    // Phase 3 — commit.
    await deps.supabase
      .from("payouts")
      .update({
        status: "sent",
        tx_hash: hash,
        sent_at: new Date().toISOString(),
      })
      .eq("id", payoutId);

    return { status: "sent", txHash: hash, payoutId, amount: opts.amount };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.supabase
      .from("payouts")
      .update({
        status: "failed",
        failure_reason: msg.slice(0, 200),
      })
      .eq("id", payoutId);
    return { status: "failed", error: msg, payoutId };
  }
}
