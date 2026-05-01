# @skillbase/duel-backend

Server-side handlers for the duel + solo-tournament flows. Imported by per-app `/api/*` route files; never bundled into client code.

## What's here

- `src/api/duel/{coach,recap,submit,sp-earned,profile}.ts` — per-duel handlers
- `src/api/tournaments/{solo-coach,solo-recap,submit}.ts` — solo-tournament handlers
- `src/api/admin/{flags,reconcile}.ts` — admin endpoints (token-gated by `ADMIN_API_TOKEN`)
- `src/cron/tournaments.ts` — daily create + settle cron handlers
- `src/settle.ts` — `triggerSettle(matchId)` and `checkAndTriggerWalkover(matchId)`
- `src/settle-guard.ts` — on-chain `ChallengeEscrow.status` pre-check; prevents the lie-state class of bug (settled DB row ∧ null winner). See `test/settle-guard.test.ts` and `test/settle-guard.integration.test.ts` for coverage.
- `src/handlers.ts` — factory exports consumed by per-app route files (`createSoloCoachHandler({ gameType })`, etc.)
- `src/sp/award.ts` — SP-engine call from settle path; writes to `v2_sp_ledger`.

## Usage

```ts
// apps/2048/src/app/api/tournaments/solo/[runId]/coach/route.ts
import { createSoloCoachHandler } from "@skillbase/duel-backend";

export const runtime = "nodejs";
export const POST = createSoloCoachHandler({ gameType: "game2048" });
```

All six game apps mount the same factory with their `gameType`; the package is the single source of truth for solo-flow logic.

## Tests

```bash
npx tsx --test packages/duel-backend/test/*.test.ts
```

Two suites today: `settle-guard.test.ts` (unit, mocked publicClient) and `settle-guard.integration.test.ts` (structural call-site invariants + skipped behavioral tests for Phase 2 duel reactivation).
