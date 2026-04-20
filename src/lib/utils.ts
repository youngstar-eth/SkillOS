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
