# @skillbase/ai-coach

Claude-backed generation for the four AI pillars: Coach, Recap, Anti-Cheat, and solo-tournament variants.

## What's here

- `src/generate.ts` — `generateCoachFeedback({ gameType, … })` is the canonical Coach entry point. Returns a tone-tagged structured feedback object keyed by player.
- `src/recap/generate.ts` — `generateRecap({ gameType, … })` produces shareable match narratives (archetypes: standard, blowout, nailBiter, speedRun, grind, comeback when game data permits).
- `src/anticheat/` — plausibility classifier called from solo + duel submit paths.
- `src/solo-coach/` and `src/solo-recap/` — solo-tournament variants that read from `v2_tournament_solo_runs` instead of `v2_duels`.
- `src/prompts/` — per-game prompt templates (one file per game).
- `src/models.ts` — model selection (Sonnet 4.6 for Coach, Haiku 4.5 for Recap + Anti-Cheat).

## Usage

```ts
import { generateCoachFeedback } from "@skillbase/ai-coach";

const response = await generateCoachFeedback({
  gameType: "game2048",
  myScore: 1844,
  opponentScore: 1024,
  won: true,
  durationSeconds: 47,
});
// → { tone, headline, paragraphs: [...], signature }
```

The function is pure I/O against the Anthropic API. Caching, rate-limiting, and fire-on-mount triggering live in `@skillbase/duel-backend` callers.

## Environment

Requires `ANTHROPIC_API_KEY` (server-only). Configured in `src/client.ts` — the module-scoped client is created once per process.
