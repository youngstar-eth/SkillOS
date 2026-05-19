// ───────────────────────────────────────────────────────────────────────────
// X14.1 — Extension whitelist server audit log (server-only emitter).
//
// Lives in @skillos/lib-shared because @skillos/duel-backend imports
// lib-shared freely whereas it cannot import @skillos/ui (React peer
// dep would leak into Node-side bundles). The header constant
// `X-Extension-Profile` is duplicated as a literal at the read site
// rather than importing across the client/server split — single-string
// duplication is cheaper than coupling the server graph to the
// client UI package.
//
// Log-only — never throws, never enforces. Phase 1 advisory per
// docs/sprints/x14-class-fairness/SCOPING.md §4.2.
// ───────────────────────────────────────────────────────────────────────────

export type TournamentClassLog =
  | "human-only"
  | "agent-only"
  | "mixed-declared";

export interface ExtensionProfileLogEvent {
  tournament_id: string;
  tournament_class: TournamentClassLog;
  player_address: string;
  /**
   * Header value as received from client (untrusted). Lowercased + stripped
   * upstream by the client emitter, but server treats as opaque string.
   */
  detected_connector: string | null;
  /**
   * Client-evaluated allowed flag echoed for log readability. Server does
   * NOT re-verify against {@link ALLOWED_CONNECTORS} — single-source-of-
   * truth lives in @skillos/ui per the client/server split, and Phase 1
   * is log-only anyway. Mismatches between client claim and server
   * canonical list surface as audit signal, not enforcement.
   */
  allowed: boolean;
}

/**
 * Emit a structured X14.1 audit log line. Vercel runtime captures
 * stderr; downstream tooling (`vercel logs` / Discord webhook) reads
 * the `"event": "x14_1_extension_profile"` discriminator.
 *
 * Single-line JSON so log substring oracle (memory
 * `reference_vercel_log_substring_oracle`) can pull rows by event name.
 */
export function logExtensionProfile(event: ExtensionProfileLogEvent): void {
  console.warn(
    JSON.stringify({
      event: "x14_1_extension_profile",
      ts: new Date().toISOString(),
      ...event,
    }),
  );
}
