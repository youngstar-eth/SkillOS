// ───────────────────────────────────────────────────────────────────────────
// Per-surface Claude model identifiers.
//
// Backend source of truth — every Anthropic API call in this package
// imports the appropriate constant from here. To swap a model, edit the
// constant once and re-deploy.
//
// Frontend "Powered by ..." attribution lives in @skillbase/ui/models
// (separate file to avoid pulling Anthropic SDK into the client bundle).
// **Keep the two files in sync** — when you change a value here, update
// the matching DISPLAY constant in packages/ui/src/models.ts.
//
// Reasoning behind current picks:
//   - Coach: analytical / strategic reasoning task. Sonnet 4.6 measurably
//     better at pattern recognition + actionable advice than Haiku 4.5.
//   - Recap: creative narrative task. Haiku 4.5 is sufficient and ~7x
//     cheaper than Sonnet for the same UX outcome.
//   - Anti-cheat: classifier-style judgment with a short verdict. Haiku 4.5
//     hits the latency + cost target without quality loss.
// ───────────────────────────────────────────────────────────────────────────

export const COACH_MODEL = "claude-sonnet-4-6";
export const RECAP_MODEL = "claude-haiku-4-5";
export const ANTICHEAT_MODEL = "claude-haiku-4-5";
