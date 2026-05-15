// X15.3 — chargeRetryFee orchestration for solo agent paid retries.
//
// Sits between the x402-gated /v1/agents/matches/start-solo handler and the
// agent run loop. Job:
//   1. Read soloSubmissionCount[tournamentId][agent] on-chain.
//   2. If priorSolo == 0 → contract's free-first slot, no fee due. Skip.
//   3. If priorSolo >= 1 → ensure agent's USDC allowance ≥ RETRY_FEE for
//      TournamentPool, max-approve once if not, then chargeRetryFee.
//   4. Record an x15_payment_attempts row regardless (placeholder until
//      the X15.8 migration ships the table; INSERT failure is swallowed).
//
// Why the priorSolo check still lives here even though the route always
// charges x402: the on-chain economy and the off-chain pricing live in
// different ledgers (TournamentPool retry-fee accumulator vs the x402
// receiver float). The contract STILL gives the first solo for free
// per-(tournament, agent) regardless of what the gateway charged; calling
// chargeRetryFee for priorSolo == 0 would just pre-pay the next slot and
// over-bill the agent. The cleanest behaviour is to honour the contract.
//
// On revert: the helper records the failure row and re-throws so the
// caller can map the exception to a 5xx for the client and mark the
// duel_runs row as 'error'. The agent's x402 payment is NOT refunded —
// the operator must reconcile manually (X16 will automate this).

import {
  type Address,
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  maxUint256,
} from 'viem';

import {
  ERC20_ABI,
  TOURNAMENT_POOL_ABI,
} from '../contracts-vendored/abi.js';
import {
  RETRY_FEE,
  TOURNAMENT_POOL_V21_ADDRESS,
  USDC_ADDRESS,
} from '../contracts-vendored/addresses.js';
import { getAgentWalletClient } from '../contracts-vendored/wallet-client.js';
import { dataSuffixForGame, type KnownGame } from '../games.js';
import { getSupabaseClient } from '../supabase.js';
import { getPublicClient } from '../viem.js';

export interface ChargeRetryFeeArgs {
  tournamentId: Hex;
  agentAddress: Address;
  runId: string;
  game: KnownGame;
}

export type ChargeRetryFeeResult =
  | { charged: false; reason: 'free-first'; priorSolo: 0 }
  | {
      charged: true;
      txHash: Hex;
      approveTxHash?: Hex;
      priorSolo: number;
    };

// Deps are split out for test injection. Production callers omit `deps`
// and pick up the cached module-level singletons. Tests pass stubs whose
// surface matches the methods we actually use here (readContract /
// writeContract / waitForTransactionReceipt / .from().insert()).
export interface ChargeRetryFeeDeps {
  publicClient?: Pick<
    ReturnType<typeof getPublicClient>,
    'readContract' | 'waitForTransactionReceipt'
  >;
  agentWalletClient?: Pick<
    ReturnType<typeof getAgentWalletClient>,
    'writeContract'
  >;
  supabase?: ReturnType<typeof getSupabaseClient>;
}

export async function chargeRetryFeeIfRequired(
  args: ChargeRetryFeeArgs,
  deps: ChargeRetryFeeDeps = {},
): Promise<ChargeRetryFeeResult> {
  const publicClient = deps.publicClient ?? getPublicClient();
  const supabase = deps.supabase ?? getSupabaseClient();

  const priorSoloRaw = await publicClient.readContract({
    address: TOURNAMENT_POOL_V21_ADDRESS,
    abi: TOURNAMENT_POOL_ABI,
    functionName: 'soloSubmissionCount',
    args: [args.tournamentId, args.agentAddress],
  });
  const priorSolo = Number(priorSoloRaw);

  if (priorSolo === 0) {
    await recordPaymentAttempt(supabase, {
      runId: args.runId,
      agentAddress: args.agentAddress,
      tournamentId: args.tournamentId,
      status: 'skipped',
      reason: 'free-first',
      priorSolo,
    });
    return { charged: false, reason: 'free-first', priorSolo: 0 };
  }

  try {
    const walletClient = deps.agentWalletClient ?? getAgentWalletClient();

    const allowance = (await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [args.agentAddress, TOURNAMENT_POOL_V21_ADDRESS],
    })) as bigint;

    let approveTxHash: Hex | undefined;
    if (allowance < RETRY_FEE) {
      // Idempotent max-approve. Paying USDC gas on a small allowance bump
      // for every retry is wasteful; max-approve up front means subsequent
      // chargeRetryFee calls only spend gas on the pull. The blast radius
      // is bounded to TournamentPool — the contract can only pull RETRY_FEE
      // per call, and only when chargeRetryFee is invoked by the player.
      approveTxHash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TOURNAMENT_POOL_V21_ADDRESS, maxUint256],
      });
      // Wait for confirmation before chargeRetryFee — otherwise both can
      // mine in the same block in arbitrary order and the charge reverts
      // ERC20InsufficientAllowance against pre-approve state.
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    }

    const dataSuffix = dataSuffixForGame(args.game);
    const txHash = await walletClient.writeContract({
      address: TOURNAMENT_POOL_V21_ADDRESS,
      abi: TOURNAMENT_POOL_ABI,
      functionName: 'chargeRetryFee',
      args: [args.tournamentId, args.agentAddress],
      dataSuffix,
    });

    await recordPaymentAttempt(supabase, {
      runId: args.runId,
      agentAddress: args.agentAddress,
      tournamentId: args.tournamentId,
      status: 'success',
      txHash,
      approveTxHash,
      priorSolo,
    });

    return { charged: true, txHash, approveTxHash, priorSolo };
  } catch (err) {
    const errorMessage = describeRevert(err);
    await recordPaymentAttempt(supabase, {
      runId: args.runId,
      agentAddress: args.agentAddress,
      tournamentId: args.tournamentId,
      status: 'error',
      errorMessage,
      priorSolo,
    });
    throw err;
  }
}

function describeRevert(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      return `revert ${reverted.data?.errorName ?? 'unknown'}`;
    }
    return err.shortMessage.slice(0, 500);
  }
  if (err instanceof Error) return err.message.slice(0, 500);
  return 'unknown error';
}

interface PaymentAttemptRow {
  runId: string;
  agentAddress: Address;
  tournamentId: Hex;
  status: 'success' | 'error' | 'skipped';
  reason?: string;
  txHash?: Hex;
  approveTxHash?: Hex;
  errorMessage?: string;
  priorSolo: number;
}

// X15.8 placeholder. The x15_payment_attempts table doesn't exist yet —
// the INSERT will fail with code 42P01 ("relation does not exist") until
// the migration lands. We swallow the failure here so the orchestration
// stays functional during the interleaved sprint; once X15.8 ships, the
// inserts start succeeding and the audit trail goes live.
async function recordPaymentAttempt(
  sb: ReturnType<typeof getSupabaseClient>,
  row: PaymentAttemptRow,
): Promise<void> {
  try {
    const { error } = await sb.from('x15_payment_attempts').insert({
      run_id: row.runId,
      agent_address: row.agentAddress.toLowerCase(),
      tournament_id: row.tournamentId,
      status: row.status,
      reason: row.reason ?? null,
      tx_hash: row.txHash ?? null,
      approve_tx_hash: row.approveTxHash ?? null,
      error_message: row.errorMessage ?? null,
      prior_solo: row.priorSolo,
    });
    if (error) {
      console.warn(
        '[charge-retry-fee] x15_payment_attempts insert errored ' +
          '(expected until X15.8 migration ships):',
        error.code,
        error.message,
      );
    }
  } catch (err) {
    console.warn(
      '[charge-retry-fee] x15_payment_attempts insert threw:',
      err instanceof Error ? err.message : err,
    );
  }
}
