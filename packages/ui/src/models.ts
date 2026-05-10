// ───────────────────────────────────────────────────────────────────────────
// Per-surface human-readable model attributions for "Powered by ..." UI.
//
// Frontend source of truth — every "Powered by Claude X" string in the
// game apps imports the appropriate constant from here.
//
// Backend model identifiers live in @skillos/ai-coach/models. **Keep
// the two files in sync** — when you swap a model, update both:
//   1. packages/ai-coach/src/models.ts → COACH_MODEL / RECAP_MODEL / ANTICHEAT_MODEL
//   2. packages/ui/src/models.ts → matching DISPLAY constant
//
// They're split across packages so the @anthropic-ai/sdk dependency
// stays out of the client bundle. Trading a tiny manual-sync surface
// for a smaller frontend chunk.
// ───────────────────────────────────────────────────────────────────────────

export const COACH_MODEL_DISPLAY = "Claude Sonnet 4.6";
export const RECAP_MODEL_DISPLAY = "Claude Haiku";
export const ANTICHEAT_MODEL_DISPLAY = "Claude Haiku";
