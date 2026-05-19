"use client";

// ───────────────────────────────────────────────────────────────────────────
// F1 / X14.0 — Tournament class declaration pill.
//
// Renders one of three colored pills mapped to the tournament's
// `tournamentClass` field:
//   - human-only    → amber  · 🧑 Human-only
//   - agent-only    → purple · 🤖 Agent-only
//   - mixed-declared → neutral · 🔀 Mixed
//
// The class declaration is off-chain (X14.0 SCOPING §1: Phase 1 contracts
// are class-agnostic; enforcement is at the submit-handler + cron-settle
// layers). Surfacing it here turns the architectural invariant ("agent
// participation is a class, not a feature flag") into visible product
// fabric on every tournament card.
// ───────────────────────────────────────────────────────────────────────────

import React from "react";
import type { TournamentClass } from "./extension-whitelist";

export type TournamentClassPillProps = {
  tournamentClass: TournamentClass;
  /** Size variant. `sm` is the default; `xs` for compact eyebrows. */
  size?: "xs" | "sm";
};

type Variant = {
  label: string;
  icon: string;
  className: string;
  title: string;
};

const VARIANTS: Record<TournamentClass, Variant> = {
  "human-only": {
    label: "Human-only",
    icon: "🧑",
    className: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    title:
      "Human-only tournament — only wallets submitting via Sign-In-With-Base (SIWB) accrue ranked entries. Off-chain X14.0 declaration; on-chain contracts are class-agnostic.",
  },
  "agent-only": {
    label: "Agent-only",
    icon: "🤖",
    className: "border-purple-400/40 bg-purple-400/10 text-purple-300",
    title:
      "Agent-only tournament — only Sign-In-With-Agent (SIWA) submissions accrue ranked entries. Off-chain X14.0 declaration; on-chain contracts are class-agnostic.",
  },
  "mixed-declared": {
    label: "Mixed",
    icon: "🔀",
    className: "border-neutral-500/40 bg-neutral-500/10 text-neutral-300",
    title:
      "Mixed tournament — accepts both human (SIWB) and agent (SIWA) submissions on the same arena. Class is a participant attribute, not a feature flag.",
  },
};

export const TournamentClassPill: React.FC<TournamentClassPillProps> = ({
  tournamentClass,
  size = "sm",
}) => {
  const v = VARIANTS[tournamentClass];
  const sizing =
    size === "xs"
      ? "gap-1 px-1.5 py-0.5 text-[10px]"
      : "gap-1.5 px-2 py-0.5 text-[11px]";
  return (
    <span
      className={
        "inline-flex items-center rounded-full border font-medium tracking-tight " +
        sizing +
        " " +
        v.className
      }
      title={v.title}
      aria-label={`Tournament class: ${v.label}`}
    >
      <span aria-hidden="true">{v.icon}</span>
      <span>{v.label}</span>
    </span>
  );
};
