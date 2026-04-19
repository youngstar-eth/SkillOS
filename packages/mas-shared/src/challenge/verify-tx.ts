import {
  createPublicClient,
  decodeEventLog,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { USDC_ABI, USDC_ADDRESS } from "../contracts/arcade-pool";

/**
 * Server-side stake verification. Given a USDC.transfer tx hash, confirm:
 *   - tx exists + succeeded
 *   - Transfer event emitted by USDC
 *   - from  == expectedSender
 *   - to    == studioWallet
 *   - value == stakeUsdc (atomic)
 *
 * Returns { ok: true } on match or { ok: false, reason } on any mismatch.
 * The shared payout helper's UNIQUE index guards against double-spend at
 * the DB layer, but we still verify on-chain so Alice can't submit a
 * random tx hash and call herself staked.
 */

export interface VerifyStakeTxOptions {
  txHash: Hex;
  expectedSender: Address;
  studioWallet: Address;
  stakeUsdc: number;
  /** Base Sepolia by default. */
  rpcUrl?: string;
}

export type VerifyStakeTxResult =
  | { ok: true }
  | { ok: false; reason: string };

// Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" },
  ],
} as const;

export async function verifyStakeTx(
  opts: VerifyStakeTxOptions,
): Promise<VerifyStakeTxResult> {
  const rpc = opts.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  const pub = createPublicClient({ chain: baseSepolia, transport: http(rpc) });

  let rcpt;
  try {
    rcpt = await pub.waitForTransactionReceipt({
      hash: opts.txHash,
      timeout: 60_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `receipt_fetch_failed: ${msg.slice(0, 200)}` };
  }

  if (rcpt.status !== "success") {
    return { ok: false, reason: `tx_reverted status=${rcpt.status}` };
  }

  const expectedValue = parseUnits(opts.stakeUsdc.toString(), 6);
  const expectedFrom = opts.expectedSender.toLowerCase();
  const expectedTo = opts.studioWallet.toLowerCase();
  const expectedUsdc = USDC_ADDRESS.toLowerCase();

  for (const log of rcpt.logs) {
    if (log.address.toLowerCase() !== expectedUsdc) continue;
    try {
      const decoded = decodeEventLog({
        abi: [TRANSFER_EVENT],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args;
      if (from.toLowerCase() !== expectedFrom) continue;
      if (to.toLowerCase() !== expectedTo) continue;
      if (value !== expectedValue) continue;
      return { ok: true };
    } catch {
      /* log shape didn't match — skip */
    }
  }

  return {
    ok: false,
    reason: `no_matching_transfer expected from=${expectedFrom} to=${expectedTo} value=${expectedValue}`,
  };
}

/** Small helper so callers don't need to import viem themselves. */
export function usdcAtomic(amount: number): bigint {
  return parseUnits(amount.toString(), 6);
}

/** Silence viem's unused-import warning. */
export { decodeEventLog };

/** Re-export for convenience in handlers. */
export { USDC_ABI, USDC_ADDRESS };
