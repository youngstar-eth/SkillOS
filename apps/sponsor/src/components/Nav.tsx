"use client";

import Link from "next/link";
import { SkillosMark, WalletButton, useIsEmbedded } from "@skillbase/ui";
import { ThemeToggle } from "./ThemeToggle";

export function Nav() {
  const isEmbedded = useIsEmbedded();
  if (isEmbedded) return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-border-subtle bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link
          href="https://skillbase.games"
          aria-label="Skillbase Sponsor"
          className="inline-flex items-center gap-3 text-fg-1 no-underline"
        >
          <SkillosMark size={40} className="pixel-mark" />
          <span className="font-display hidden text-[16px] font-medium tracking-[-0.01em] text-fg-1 sm:inline">
            Skillbase <span className="text-fg-muted">·</span> Sponsor
          </span>
        </Link>
        <div className="inline-flex items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
