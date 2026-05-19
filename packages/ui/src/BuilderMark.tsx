"use client";

// ───────────────────────────────────────────────────────────────────────────
// F4 / X10 + X10b — Builder Code attribution mark.
//
// Surfaces the per-game Builder Code wired into each app's SkillOSProvider
// (apps/<game>/src/app/layout.tsx → config.builderCode) as a small footer
// chip: "Built on SkillOS · bc_xxx ↗". Tap → BaseScan address page for the
// builder wallet (Phase 1 testnet uses sepolia.basescan.org; address lookup
// works without specifying the wallet upfront — BaseScan resolves the
// dataSuffix attribution itself when the user follows the chain.
//
// Today the only visible surface for these codes is /dev/sdk-demo (a dev
// page). This component completes the X10/X10b user surface so the
// "developer attribution on every game" thesis becomes visible product
// fabric instead of a roadmap promise.
//
// Reads BUILDER_CODES from @skillos/sdk (single source of truth, mirrors
// the literals in each app's layout.tsx). If a slug is passed that is not
// in the registry the component renders nothing — defensive default for
// pages mounted under an unrecognized app shell.
// ───────────────────────────────────────────────────────────────────────────

import React from "react";
import { BUILDER_CODES, type BuilderCodeGame } from "@skillos/sdk";

export type BuilderMarkProps = {
  /** Game slug — must match a key in BUILDER_CODES. */
  game: string;
  /** Layout variant. `inline` is single-row; `footer` adds top border. */
  variant?: "inline" | "footer";
  className?: string;
};

function isBuilderCodeGame(s: string): s is BuilderCodeGame {
  return Object.prototype.hasOwnProperty.call(BUILDER_CODES, s);
}

export const BuilderMark: React.FC<BuilderMarkProps> = ({
  game,
  variant = "inline",
  className,
}) => {
  if (!isBuilderCodeGame(game)) return null;
  const code = BUILDER_CODES[game];

  // We link to BaseScan's address search for the code itself rather than a
  // specific wallet — Phase 1 deploys the BuilderCodeAttribution mapping on
  // testnet and the code → wallet lookup is the user-facing path. When
  // Phase 2 wires deterministic builder wallets per code, switch this to
  // basescanAddress(walletByCode[code]).
  const href = `https://sepolia.basescan.org/search?q=${encodeURIComponent(code)}`;

  const base =
    "inline-flex items-center gap-1.5 text-[11px] tracking-tight text-neutral-500 transition hover:text-neutral-300";
  const containerClass =
    variant === "footer"
      ? "mt-4 border-t border-border-subtle pt-3"
      : "";

  return (
    <div className={(containerClass + " " + (className ?? "")).trim()}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={base}
        title={`Builder Code ${code} — per-game on-chain developer attribution (X10/X10b)`}
        aria-label={`Built on SkillOS — Builder Code ${code}, opens BaseScan in new tab`}
      >
        <span>Built on SkillOS</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono text-neutral-400">{code}</span>
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
};
