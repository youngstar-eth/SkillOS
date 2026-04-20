/**
 * Format an address as `0xabcd…1234` for compact display.
 */
export function truncateAddress(addr?: string | null, size = 4): string {
  if (!addr) return "";
  if (addr.length < size * 2 + 3) return addr;
  return `${addr.slice(0, size + 2)}…${addr.slice(-size)}`;
}

/**
 * Classnames helper — joins truthy class names. Avoids pulling in clsx for 1 use.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Basescan link for a Base Sepolia tx.
 */
export function basescanTx(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

/**
 * Basescan link for a Base Sepolia address.
 */
export function basescanAddress(addr: string): string {
  return `https://sepolia.basescan.org/address/${addr}`;
}

/**
 * Turn a wagmi / viem / fetch error into a short user-friendly string.
 * Preserves a `hint` for optional tx-hash Basescan links, and a `kind`
 * for styling variants.
 */
export type FriendlyError = {
  message: string;
  kind: "rejected" | "reverted" | "network" | "unknown";
  txHash?: `0x${string}`;
};

export function parseWalletError(err: unknown): FriendlyError {
  if (!err) return { message: "Unknown error", kind: "unknown" };
  const e = err as {
    name?: string;
    message?: string;
    shortMessage?: string;
    cause?: { name?: string; shortMessage?: string; reason?: string };
    reason?: string;
    details?: string;
    code?: number | string;
    transactionHash?: `0x${string}`;
  };

  // User rejected signature / tx in wallet
  if (
    e.name === "UserRejectedRequestError" ||
    e.cause?.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    /rejected|denied/i.test(e.shortMessage ?? e.message ?? "")
  ) {
    return { message: "Transaction cancelled. Try again.", kind: "rejected" };
  }

  // Contract reverted on-chain
  if (
    e.name === "ContractFunctionRevertedError" ||
    e.cause?.name === "ContractFunctionRevertedError"
  ) {
    const reason = e.cause?.reason ?? e.reason ?? e.cause?.shortMessage;
    return {
      message: reason
        ? `Transaction failed: ${reason}`
        : "Transaction reverted on-chain.",
      kind: "reverted",
      txHash: e.transactionHash,
    };
  }

  // HTTP-shaped errors ("queue failed: 404", "status failed: 500")
  const msg = e.shortMessage ?? e.message ?? "";
  if (/\b404\b/.test(msg)) {
    return {
      message:
        "No queued challenges to accept. Be the first — your stake will create a new challenge.",
      kind: "network",
    };
  }
  if (/^(queue|status|submit|cancel) failed:/.test(msg) || /network|fetch/i.test(msg)) {
    return { message: msg || "Network error. Please retry.", kind: "network" };
  }

  return {
    message: e.shortMessage || msg || "Something went wrong.",
    kind: "unknown",
  };
}
