"use client";

import Link from "next/link";
import { SkillOSWordmark, WalletButton, useIsEmbedded } from "@skillbase/ui";

export function Nav() {
  const isEmbedded = useIsEmbedded();
  if (isEmbedded) return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-border-subtle bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link
          href="https://skillbase.games"
          aria-label="SkillOS Sponsor"
          className="inline-flex items-center text-fg-1 no-underline"
        >
          <SkillOSWordmark size={20}>
            SkillOS <span className="text-fg-muted">·</span> Sponsor
          </SkillOSWordmark>
        </Link>
        <div className="inline-flex items-center gap-2">
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
