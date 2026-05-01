# @skillbase/sp-engine

SP (Skill Points) system: pure logic for awarding, level computation, and tier distribution. No I/O — callers provide DB context.

## What's here

- `src/engine.ts` — `computeAward({ matchType, won, opponentSp, … })` returns SP delta + tier-up signal
- `src/types.ts` — `Tier`, `LevelBoundary`, `AwardContext` types
- `src/anchor.ts` — daily snapshot serialization for the on-chain `SkillbaseAnchor` contract

## Usage

```ts
import { computeAward, currentLevel } from "@skillbase/sp-engine";

const award = computeAward({
  matchType: "duel",
  won: true,
  myCurrentSp: 1450,
  opponentSp: 1620,
});
// → { delta: 28, newSp: 1478, tierAdvance: false }
```

## Tests

```bash
npx tsx --test packages/sp-engine/src/*.test.ts
```

`engine.test.ts` covers award math (win/loss × matchType × tier-edge cases). `anchor.test.ts` validates serialization round-trips.
