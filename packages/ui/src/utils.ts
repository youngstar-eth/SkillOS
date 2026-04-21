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

  // Contract reverted on-chain — translate ChallengeEscrow custom errors
  // into user-friendly copy.
  const raw = e.shortMessage ?? e.message ?? "";
  const revertName =
    (e as { cause?: { data?: { errorName?: string } } }).cause?.data?.errorName;
  const errName =
    revertName ??
    (raw.match(/\b(SelfChallenge|AlreadyAccepted|ChallengeNotOpen|ChallengeHasExpired|ChallengeAlreadyExists|ChallengeNotAccepted|ChallengeNotExpired|InvalidWinner|BadSignature|ZeroStake|ZeroDuration)\b/)?.[1]);
  if (errName) {
    const copy: Record<string, string> = {
      SelfChallenge:
        "You can't match yourself. Try with a different wallet, or wait for another player.",
      AlreadyAccepted:
        "Someone else already accepted this challenge. Refresh to find a new match.",
      ChallengeNotOpen:
        "This challenge is no longer open. Refresh to find another.",
      ChallengeHasExpired:
        "This challenge expired before you accepted. Refresh to find another.",
      ChallengeAlreadyExists:
        "A challenge with this id already exists. Refresh the page to generate a new one.",
      ChallengeNotAccepted:
        "This challenge hasn't been accepted yet — can't settle.",
      ChallengeNotExpired:
        "Challenge isn't expired yet — you can't reclaim your stake.",
      InvalidWinner: "Settle rejected: winner must be one of the players.",
      BadSignature: "Settle rejected: signature didn't verify.",
      ZeroStake: "Stake must be greater than zero.",
      ZeroDuration: "Challenge duration must be greater than zero.",
    };
    return {
      message: copy[errName] ?? `Transaction failed: ${errName}`,
      kind: "reverted",
      txHash: e.transactionHash,
    };
  }
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
