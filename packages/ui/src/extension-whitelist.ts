// ───────────────────────────────────────────────────────────────────────────
// X14.1 — Extension whitelist (client-safe pure logic).
//
// Lives in @skillos/ui because @skillos/lib-shared is SERVER-ONLY (its
// barrel re-exports node:crypto + service-role Supabase). The pure
// detection logic must reach the browser, so it ships from ui alongside
// <ExtensionWarningModal />.
//
// Per canonical scoping docs/sprints/x14-class-fairness/SCOPING.md §4.2
// (Path A): SOFT WARNING + LOG ONLY. No hard block, no 403, no
// connector-id enforcement at the contract or settle layer.
//
// Server-side audit log emitter lives at
// @skillos/lib-shared/extension-whitelist-log (the constant header name
// is duplicated there rather than importing across the client/server
// split — see ADR-equivalent reasoning in that file's header).
// ───────────────────────────────────────────────────────────────────────────

export type TournamentClass = "human-only" | "agent-only" | "mixed-declared";

/**
 * wagmi v2 + EIP-6963 connector identity space — normalized to
 * lower-case-no-whitespace so case variants (MetaMask / metaMask /
 * metamask / "Meta Mask") all collapse to a single entry.
 *
 * Founder-locked list per Q-3 (scoping doc §6, 2026-05-17). Mutating
 * this list ships in a follow-up PR with founder review — not edited
 * mid-sprint.
 */
export const ALLOWED_CONNECTORS = [
  "metamask",
  "coinbasewallet",
  "baseaccount",
  "rabby",
] as const;

export type AllowedConnector = (typeof ALLOWED_CONNECTORS)[number];

/** Header name used by client → server X14.1 advisory channel. */
export const EXTENSION_PROFILE_HEADER = "X-Extension-Profile";

export interface ExtensionProfile {
  /**
   * Normalized connector identifier, or `null` when no wallet is
   * connected. Lowercased + whitespace-stripped so downstream lookups
   * and log payloads are stable across wagmi connector-name churn.
   */
  detected: string | null;
  /**
   * True iff `detected` is in {@link ALLOWED_CONNECTORS}.
   */
  allowed: boolean;
  /**
   * True iff the tournament is `human-only`. The whitelist is only a
   * soft signal on this class — `agent-only` and `mixed-declared` are
   * unaffected by X14.1.
   */
  enforced: boolean;
}

function normalize(connectorId: string | null | undefined): string | null {
  if (connectorId == null) return null;
  const stripped = connectorId.replace(/\s+/g, "").toLowerCase();
  return stripped.length === 0 ? null : stripped;
}

/**
 * Pure-function class+connector evaluator. Callers render
 * {@link ExtensionWarningModal} iff `enforced && !allowed`.
 *
 * Designed to be safe to call during render (no IO, no side effects,
 * stable identity given equal inputs).
 */
export function evaluateExtensionProfile(
  connectorId: string | null | undefined,
  tournamentClass: TournamentClass,
): ExtensionProfile {
  const detected = normalize(connectorId);
  const allowed =
    detected !== null &&
    (ALLOWED_CONNECTORS as readonly string[]).includes(detected);
  const enforced = tournamentClass === "human-only";
  return { detected, allowed, enforced };
}
