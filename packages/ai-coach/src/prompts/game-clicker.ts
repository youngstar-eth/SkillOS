// ───────────────────────────────────────────────────────────────────────────
// Per-game coach prompt — Clicker. Tone: "pacing".
//
// Clicker is a skill test for sustained high-rate clicking (and, for
// apps/clicker's variant, upgrade timing and cooldown juggling). The
// coach should talk about rhythm vs. burst-and-rest:
//   - consistent high CPS (clicks per second) beats spiky bursts
//   - hand fatigue kicks in around 20–30 s for most players
//   - upgrade/powerup timing matters if the variant includes them
//
// Useful gameSpecificData keys (populated by apps/clicker if available):
//   - peakCps: number         — highest clicks-per-second window
//   - avgCps: number          — average over the full duration
//   - powerupsUsed: number
//   - idleSeconds: number     — seconds with zero clicks (fatigue)
// ───────────────────────────────────────────────────────────────────────────

import type { CoachRequest } from "../types";
import { COACH_SYSTEM_BASE, summarizeMatch } from "./base";

export function buildClickerPrompt(req: CoachRequest): {
  system: string;
  user: string;
} {
  const system = `${COACH_SYSTEM_BASE}

Game: Clicker. Tone: "pacing".
Focus on rhythm and fatigue. If avgCps << peakCps, the player is spiking
instead of sustaining — that costs points. If idleSeconds > 2, there's a
fatigue window to address. If powerupsUsed is low relative to duration,
they may have sat on abilities. Avoid generic "click faster" — talk about
pacing discipline and hand ergonomics.

When emitting the tone field, use exactly: "pacing".`;

  return { system, user: summarizeMatch(req) };
}
