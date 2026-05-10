# @skillos/duel-backend

Server-side handlers for the duel + solo-tournament flows. Imported by per-app `/api/*` route files; never bundled into client code.

## What's here

- `src/api/{coach,recap,plausibility,profile,sp-earned}.ts` — per-duel handlers (top-level)
- `src/api/admin/{flags,reconcile}.ts` — admin endpoints (token-gated by `ADMIN_API_TOKEN`)
- `src/api/sponsor/{contributions,tournament-list,tournament-sponsors}.ts` — handlers for the sponsor app
- `src/api/tournaments/{list,solo,solo-coach,solo-recap,solo-plausibility,submit}.ts` — tournament + solo-flow handlers
- `src/cron/{tournaments,sponsors}.ts` — cron handlers (daily tournament create + settle, sponsor event indexer)
- `src/settle.ts` — `triggerSettle(matchId)` and `checkAndTriggerWalkover(matchId)`
- `src/settle-guard.ts` — on-chain `ChallengeEscrow.status` pre-check; prevents the lie-state class of bug (settled DB row ∧ null winner). See `test/settle-guard.test.ts` and `test/settle-guard.integration.test.ts` for coverage.
- `src/handlers.ts` — duel matchmaking factories: `createQueueHandler`, `createAcceptTxHandler`, `createStatusHandler`, `createSubmitHandler`. Per-endpoint factories live alongside their files (`createCoachHandler` in `api/coach.ts`, `createSoloCoachHandler` in `api/tournaments/solo-coach.ts`, `createSPEarnedHandler` in `api/sp-earned.ts`, etc.).
- `src/sp/award.ts` — SP-engine call from settle path; writes to `v2_sp_ledger`.

## Usage

```ts
// apps/2048/src/app/api/tournaments/solo/[runId]/coach/route.ts
import { createSoloCoachHandler } from "@skillos/duel-backend";

export const runtime = "nodejs";
export const POST = createSoloCoachHandler({ gameType: "game2048" });
```

All six game apps mount the same factory with their `gameType`; the package is the single source of truth for solo-flow logic.

## Tests

```bash
npx tsx --test packages/duel-backend/test/*.test.ts
```

Two suites today: `settle-guard.test.ts` (unit, mocked publicClient) and `settle-guard.integration.test.ts` (structural call-site invariants + skipped behavioral tests for Phase 2 duel reactivation).
