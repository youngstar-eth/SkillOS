# @skillos/app-orchestrator

Dedicated Vercel project that hosts every SkillOS cron job. No UI, no public surface — only `/api/cron/*` routes wired to Vercel's internal scheduler.

## Why this exists

Cron jobs were originally hosted alongside player-facing apps (`apps/2048` carried 3 schedules, `apps/sponsor` carried 1). That coupled cron infrastructure to player frontends and made the Phase 2 SDK rollout boundary fuzzy. This app separates concerns:

- **player-facing apps** = render game UI + accept submit txs
- **orchestrator** = single host for every scheduled writer of tournament + ledger state

Per `CLAUDE.md` invariant #6 ("cron is the only writer of tournament state"), keeping all writers in one project makes the privilege boundary explicit.

## Cron schedule

All four schedules below run in UTC. Vercel's scheduler is project-bound — no public domain alias required.

| Path | Schedule (UTC) | Source | Purpose |
|---|---|---|---|
| `/api/cron/create-tournaments`   | `0 0 * * *`  (daily 00:00) | `runCreateTournaments` | Daily tournament create + dedupe SELECT |
| `/api/cron/settle-tournaments`   | `5 0 * * *`  (daily 00:05) | `runSettleTournaments`  | Sweep pending settles |
| `/api/cron/index-sponsor-events` | `15 0 * * *` (daily 00:15) | `runIndexSponsorEvents` | RPC getLogs sweep of SponsorPool events |
| `/api/cron/anchor-sp-snapshot`   | `7 2 * * *`  (daily 02:07) | inline anchor handler   | SP ledger SHA-256 hash → SkillbaseAnchor on-chain |

## Auth

Every handler validates `Authorization: Bearer ${CRON_SECRET}`. Vercel attaches this header automatically on scheduled fires; manual triggers must include it.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://skillbase-orchestrator.vercel.app/api/cron/settle-tournaments
```

If `CRON_SECRET` is unset, production returns 401 on every fire (fails closed). Local dev tolerates an unset value (auth bypass when `NODE_ENV !== "production"`).

## Local dev

```bash
# from repo root
npm install
cd apps/orchestrator
cp .env.local.example .env.local   # populate values
npm run dev                         # serves on :3010
```

Trigger a single handler locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3010/api/cron/settle-tournaments
```

## Rollback procedure

If the orchestrator misbehaves after migration cutover, restore the original cron hosts:

1. Restore the `crons` arrays in `apps/2048/vercel.json` and `apps/sponsor/vercel.json` (the source files at `apps/2048/src/app/api/cron/*` and `apps/sponsor/src/app/api/cron/*` are deliberately retained for rollback safety).
2. Redeploy the affected projects: `cd apps/2048 && vercel deploy --prod` (and same for `apps/sponsor`).
3. Optionally pause orchestrator's schedules by setting an empty `crons: []` in `apps/orchestrator/vercel.json` and redeploying.

During the rollback window both old + new will fire briefly; idempotency guarantees apply (see "Race-window safety" below).

## Race-window safety

The cutover from old hosts to orchestrator may briefly overlap (next scheduled tick may fire on both projects before vercel.json edits land). This is safe:

- `settle-tournaments`: contract revert idempotency at `ChallengeEscrow.settle()` rejects double-settle.
- `create-tournaments`: dedupe SELECT in `packages/duel-backend/src/cron/tournaments.ts` skips already-created tournaments.
- `anchor-sp-snapshot`: `SkillbaseAnchor.anchorSnapshot()` enforces "one anchor per timestamp" via `if (snapshots[timestamp] != bytes32(0)) revert AlreadyAnchored();` (`contracts/src/SkillbaseAnchor.sol:85`).
- `index-sponsor-events`: `INSERT ... ON CONFLICT (tx_hash, log_index) DO NOTHING` (`packages/duel-backend/src/cron/sponsors.ts` header).

Worst-case cost during overlap: a small number of reverted on-chain txs (negligible Base Sepolia gas) + occasional orphaned `v2_sp_snapshots` rows with `anchor_tx_hash = NULL` (cleanup is a single SQL DELETE).

## Env vars

See `.env.local.example` for the full list with comments. Production env values live in the Vercel dashboard for the `skillbase-orchestrator` project (sourced from `mas-2048` and `skillbase-sponsor` at migration time).
