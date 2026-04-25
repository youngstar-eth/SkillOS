"use client";

// ───────────────────────────────────────────────────────────────────────────
// AddressDisplay — drop-in replacement for `{truncateAddress(addr)}` JSX call
// sites that progressively enhances to a Basename when one is registered.
//
// Render contract:
//   - No address (undefined/null/empty) → empty <span> (matches truncateAddress).
//   - Resolving → truncated address immediately. No spinner, no flicker.
//   - Resolved with primary name → display the name. Optionally show the
//     truncated address as a small subtitle (variant="stacked") for surfaces
//     where users need to verify the wallet (profile header).
//   - No name registered / RPC error → truncated address. Identical to today.
//
// This is purposefully a render-only wrapper, not a stateful container —
// callers can drop it inside <Link>, <td>, <Header> with no extra plumbing.
// ───────────────────────────────────────────────────────────────────────────

import { type Address } from "viem";
import { truncateAddress } from "./utils";
import { useBasename } from "./useBasename";

export interface AddressDisplayProps {
  address: string | undefined | null;
  /** Truncation size for the fallback. Defaults to 4 (matches truncateAddress default). */
  truncateSize?: number;
  /**
   * "inline"  (default) — basename replaces truncated address inline.
   * "stacked" — basename on top, truncated address as small subtitle below.
   *             Use on profile headers where the user needs to verify the wallet.
   */
  variant?: "inline" | "stacked";
  /** Additional Tailwind classes for the outer span. */
  className?: string;
  /** Subtitle classes (variant="stacked"). */
  subtitleClassName?: string;
}

export function AddressDisplay({
  address,
  truncateSize = 4,
  variant = "inline",
  className,
  subtitleClassName = "text-[10px] font-normal text-neutral-500",
}: AddressDisplayProps) {
  const truncated = truncateAddress(address ?? undefined, truncateSize);
  const isHexAddr = typeof address === "string" && address.startsWith("0x");
  const { status, name } = useBasename(isHexAddr ? (address as Address) : undefined);

  if (status === "resolved" && name) {
    if (variant === "stacked") {
      return (
        <span className={className ? `${className} inline-flex flex-col leading-tight` : "inline-flex flex-col leading-tight"}>
          <span>{name}</span>
          <span className={subtitleClassName}>{truncated}</span>
        </span>
      );
    }
    return <span className={className}>{name}</span>;
  }

  return <span className={className}>{truncated}</span>;
}
