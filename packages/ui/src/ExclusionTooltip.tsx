"use client";

// ───────────────────────────────────────────────────────────────────────────
// F5 / X14.0b — Leaderboard exclusion reason tooltip.
//
// Renders the "excluded" label on a leaderboard row with a hover/tap-readable
// tooltip explaining the reason. Reads `excluded_reason` written by the
// settle cron (packages/duel-backend/src/cron/tournaments.ts):
//
//   - class_mismatch_settle_exclusion → X14.0b defense-in-depth: entry's
//     class_tag (human|agent) didn't match the tournament's declared class.
//   - anticheat_implausible           → F0 plausibility verdict flagged
//     one or more contributing duel runs as implausible.
//   - pending_review                  → (forward-compat) manual hold.
//   - <null / unknown>                → fall back to neutral "excluded"
//     wording so legacy rows that pre-date X14.0b still render.
//
// The component is logic-free aside from the reason→copy lookup; placement
// (table cell, profile row) is the caller's responsibility.
// ───────────────────────────────────────────────────────────────────────────

import React from "react";

export type ExclusionReason =
  | "class_mismatch_settle_exclusion"
  | "anticheat_implausible"
  | "pending_review"
  | string
  | null
  | undefined;

export type ExclusionTooltipProps = {
  reason: ExclusionReason;
  /** Tailwind text-size override; defaults to text-[10px] uppercase. */
  className?: string;
};

type Copy = { short: string; long: string };

const COPY: Record<string, Copy> = {
  class_mismatch_settle_exclusion: {
    short: "class mismatch",
    long:
      "Excluded at settle — entry's class tag (human / agent) did not match the tournament's declared class. X14.0b defense-in-depth check.",
  },
  anticheat_implausible: {
    short: "flagged",
    long:
      "Excluded at settle — one or more contributing runs were flagged 'implausible' by the F0 plausibility check (AntiCheat dim-1).",
  },
  pending_review: {
    short: "under review",
    long: "Held for manual review before ranking is finalized.",
  },
};

const FALLBACK: Copy = {
  short: "excluded",
  long: "Excluded from ranking. Specific reason not recorded (legacy entry).",
};

export const ExclusionTooltip: React.FC<ExclusionTooltipProps> = ({
  reason,
  className,
}) => {
  const copy = (reason && COPY[reason]) || FALLBACK;
  return (
    <span
      className={
        className ??
        "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-red-400"
      }
      title={copy.long}
      aria-label={`Excluded — ${copy.long}`}
    >
      excluded · {copy.short}
    </span>
  );
};
