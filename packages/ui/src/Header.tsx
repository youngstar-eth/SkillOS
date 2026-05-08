"use client";

// ───────────────────────────────────────────────────────────────────────────
// Header — top-of-page brand bar + WalletButton. Standalone web shows it as
// today; Mini App embed (Base App in-app browser, Warpcast webview, any
// iframe) returns null so the host's chrome is the only chrome.
//
// Detection is synchronous via useIsEmbedded — no SDK, no Provider. The
// initial render is "not embedded" (SSR-safe); on the client an embed user
// sees one render of the bar before it disappears via useEffect. Acceptable
// flicker for Tier C-min; a future Tier C-mid can collapse this with a
// known-result tri-state if needed.
// ───────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { WalletButton } from "./WalletButton";
import { useIsEmbedded } from "./useIsEmbedded";
import { SkillosMark } from "./SkillosMark";

export interface HeaderProps {
  /** Brand text shown next to the dot, e.g. "Skillbase · Wordle". Defaults to "Skillbase". */
  brand?: string;
}

export function Header({ brand = "Skillbase" }: HeaderProps) {
  const isEmbedded = useIsEmbedded();
  if (isEmbedded) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="https://skillbase.games"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <SkillosMark size={28} />
          <span>{brand}</span>
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
