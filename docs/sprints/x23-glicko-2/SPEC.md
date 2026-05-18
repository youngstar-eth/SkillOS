# X23 Glicko-2 Rating System — Specification (Freeze)

**Status:** X23.0 spec freeze — locked 2026-05-18 (Tier 1 + Tier 2 founder approval, 18 Q).
**Scope of this document:** off-chain skill rating layer for SkillOS, parallel to the on-chain SP currency primitive. Library choice, parameters, data model, integration seam, API surface, and sub-sprint sequencing.
**Out of scope:** TypeScript implementation, migration apply, deploys. X23.0 is a documentation sub-sprint; X23.1+ ship code.

---

## Section A — Scope statement

**A.1 What this is.** A per-`(wallet, game, class)` Glicko-2 rating maintained off-chain in Postgres. Updated by an async post-settle cron after each tournament reaches `status='settled'`. Public via read APIs (`/v1/ratings/*`). No on-chain anchor.

**A.2 Why off-chain.** Per `CLAUDE.md` invariant #5 — the on-chain substrate stays class-agnostic. The rating is a derivative skill measurement, computed and stored in our DB; chain holds prize escrow, scores, and class declarations only. Off-chain location means we can iterate the math (Glicko-2 → Glicko-3 → bespoke) without contract migrations or audit churn.

**A.3 Mainnet timing.**

| Sub-sprint | Mainnet pre-req? | Estimate |
|---|---|---|
| X23.0 spec freeze (this doc) | Yes | 2–3 h |
| X23.1 DB schema + library wrapper | Yes | 2–3 h |
| X23.2 cron integration | Yes | 4–6 h |
| X23.3 API endpoints | Yes | 3–4 h |
| X23.4 frontend (profile + apex + game subdomain column) | **No — post-mainnet OK** | 10–15 h |
| X23.5 backfill | **N/A — Tier 1 lock = NO backfill, Phase 1 testnet purged at mainnet cutover** | 0 h |
| X23.6 mainnet gate (audit packet integration) | Yes | 2–3 h |
| **Mainnet pre-req total** | | **~13–19 h agent-velocity** |

**A.4 Pitch surface.** Sponsor filter mechanism (`rating ≥ 1500` cohorts as tournament class), audit firm narrative ("transparent skill measurement, open algorithm, deterministic computation, auditable history"). Cross-class data flywheel — Phase 3+ AI lab licensing premium on agent-vs-human rating drift telemetry.

**A.5 Invariants this sprint upholds.**
- Class field domain = `('human', 'agent')` — inherits X14.0 lock (`supabase/migrations/v4_20260518_x14_class.sql`); the rating system extends nothing.
- Substrate class-agnostic — no contract calls in cron, no on-chain reads needed beyond what settle already does.
- Open algorithm + open implementation (MIT-licensed library, public spec).
- Deterministic — same inputs → same rating delta, replayable from history log.

---

## Section B — Library wrapper interface

**B.1 Library selection — locked.**

| Field | Value | Verified pre-flight 2026-05-18 |
|---|---|---|
| Name | `glicko2-lite` | `npm view glicko2-lite version` |
| Version constraint | `^5.0.0` | Latest 5.0.0 confirmed, no 6.x drift |
| Engine | Node `20 \|\| 22 \|\| >=24` | Matches SkillOS Node ≥20 baseline |
| Author | Kenan Yildirim | Hosted at https://www.npmjs.com/package/glicko2-lite |
| License | MIT | Audit-friendly, no copyleft |
| Runtime deps | Zero | No transitive supply-chain surface |
| Types | TS-native (bundled `.d.ts`) | No `@types/*` package needed |

**Drift caught at pre-flight:** none. Version 5.0.0 matches Tier 1 lock; engine matrix matches Node ≥20.

**B.2 Wrapper interface — `packages/glicko-rating/src/index.ts` (skeleton, no implementation).**

```typescript
// packages/glicko-rating/src/index.ts
//
// Thin SkillOS-flavored wrapper around glicko2-lite.
// - Stable input/output shape decoupled from library's tuple convention.
// - SkillOS defaults pre-applied (1000 / 350 / 0.06).
// - tau (system constant) defaulted to 0.5 per Glicko-2 standard;
//   tunable as second arg if X23.6 audit packet asks for a SkillOS-specific value.

import { rate } from 'glicko2-lite';

export interface RatingState {
  /** Glicko-2 rating value. Default 1000 (SkillOS) ≡ 1500 in legacy Glicko display. */
  rating: number;
  /** Rating Deviation — lower = more confident in the rating. */
  rd: number;
  /** Volatility — Glicko-2 vs Glicko-1 addition; tracks expected fluctuation. */
  volatility: number;
}

export const DEFAULT_RATING: RatingState = {
  rating: 1000,
  rd: 350,
  volatility: 0.06,
};

/** One match outcome from the player's perspective. */
export interface MatchOutcome {
  opponent: RatingState;
  /** 0 = loss, 0.5 = draw, 1 = win. Float restricted via TS union for safety. */
  score: 0 | 0.5 | 1;
}

/**
 * Apply one rating period of match outcomes to a player.
 *
 * Wraps glicko2-lite's `rate(...)` to translate between SkillOS RatingState
 * and the library's positional tuple convention. Pure function — no I/O,
 * no DB access, no side effects. Caller persists the returned RatingState.
 *
 * @param current Player's pre-period rating state (or DEFAULT_RATING if new).
 * @param matches Match outcomes within this rating period. Empty array is a
 *                no-op that increases RD slightly (uncertainty grows with
 *                inactivity per Glicko-2 spec); caller may skip the call
 *                entirely if no matches occurred.
 * @param tau     System constant. Default 0.5 per Glicko-2 standard. Lower
 *                values (0.3–0.5) suit highly competitive ladders; higher
 *                values (0.7–1.2) suit casual pools.
 * @returns Updated RatingState. Caller writes to v2_player_ratings + appends
 *          a v2_player_rating_history row.
 */
export function updateRating(
  current: RatingState,
  matches: MatchOutcome[],
  tau?: number,
): RatingState;
```

**B.3 Packaging decision — Open Q J.5** (see Section J). Default recommendation: separate workspace `packages/glicko-rating` for unit-test isolation and future reuse by the SDK (rating leaderboard endpoints in `packages/sdk` at X23.4+). Alternative: inline `packages/duel-backend/src/lib/glicko/` if SDK doesn't need it pre-mainnet.

---

## Section C — DB schema migration draft

**C.1 New migration file (X23.1 will apply).**

```sql
-- File: supabase/migrations/v4_YYYYMMDD_x23_ratings.sql
-- X23.1: Glicko-2 per-(wallet, game, class) rating storage.
-- Per X23.0 spec freeze docs/sprints/x23-glicko-2/SPEC.md §C.
-- CLAUDE.md invariant #5: ratings are off-chain only; substrate class-agnostic.

-- ─── Canonical current rating per (wallet, game, class) ────────────────────

create table public.v2_player_ratings (
  wallet text not null,
  game text not null,
  -- Inherits X14.0 enum (v4_20260518_x14_class.sql): class_tag in ('human','agent').
  -- Same check constraint kept verbatim to surface schema drift in CI if X14
  -- ever broadens its domain.
  class text not null check (class in ('human', 'agent')),
  rating numeric not null default 1000,
  rd numeric not null default 350,
  volatility numeric not null default 0.06,
  -- Provenance: which tournament_id last touched this row. Optional debug
  -- breadcrumb; full audit is in v2_player_rating_history.
  last_period_anchor text,
  -- Stat counter — total rating periods applied. Useful for leaderboard UX
  -- ("3 tournaments played") and skill-curve sanity checks (RD trajectory
  -- vs updates_count should approach a stable floor).
  updates_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (wallet, game, class)
);

-- Leaderboard hot path: top-N by rating within (game, class).
create index idx_v2_player_ratings_game_class_rating
  on public.v2_player_ratings (game, class, rating desc);

-- Profile hot path: all ratings for a wallet.
create index idx_v2_player_ratings_wallet
  on public.v2_player_ratings (wallet);

-- ─── Append-only audit log (Tier 2 §3 drift-detection recommendation) ──────

create table public.v2_player_rating_history (
  id uuid primary key default uuid_generate_v4(),
  wallet text not null,
  game text not null,
  class text not null check (class in ('human', 'agent')),
  rating_before numeric not null,
  rating_after numeric not null,
  rd_before numeric not null,
  rd_after numeric not null,
  volatility_before numeric not null,
  volatility_after numeric not null,
  tournament_id uuid references public.v2_tournaments(id) on delete set null,
  matches_count integer not null,
  recorded_at timestamp with time zone not null default now()
);

create index idx_v2_player_rating_history_wallet_recorded
  on public.v2_player_rating_history (wallet, recorded_at desc);

create index idx_v2_player_rating_history_tournament
  on public.v2_player_rating_history (tournament_id);

-- ─── Per-tournament idempotency flag ───────────────────────────────────────
-- Cron polls v2_tournaments where settled_at IS NOT NULL AND
-- ratings_updated_at IS NULL. Single-write idempotency: cron stamps the
-- column at completion. Re-running the cron after restart is a no-op for
-- already-rated tournaments — matches X9 settle-cron idempotency posture.

alter table public.v2_tournaments
  add column if not exists ratings_updated_at timestamp with time zone;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.v2_player_ratings enable row level security;
alter table public.v2_player_rating_history enable row level security;

-- Anon SELECT: public leaderboard + profile pages need to read.
create policy v2_player_ratings_anon_select
  on public.v2_player_ratings for select to anon using (true);
create policy v2_player_rating_history_anon_select
  on public.v2_player_rating_history for select to anon using (true);

-- service_role writes only — cron uses service-role JWT.
create policy v2_player_ratings_service_write
  on public.v2_player_ratings for all to service_role
  using (true) with check (true);
create policy v2_player_rating_history_service_write
  on public.v2_player_rating_history for all to service_role
  using (true) with check (true);

-- ─── Updated_at trigger ────────────────────────────────────────────────────

create or replace function set_v2_player_ratings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_v2_player_ratings_updated_at
  before update on public.v2_player_ratings
  for each row execute function set_v2_player_ratings_updated_at();
```

**C.2 Schema rationale notes (for audit packet X23.6).**

- **Class column reuses X14.0 enum verbatim.** Surfaces schema drift in CI if X14 ever broadens its `('human', 'agent')` domain — this is intentional coupling, not a copy-paste foot-gun.
- **`updates_count` is denormalized.** Could be computed from `count(*) FROM v2_player_rating_history WHERE wallet/game/class`. Denormalizing avoids the join on every leaderboard read; cron writes it transactionally.
- **History log RLS = anon SELECT.** Public-by-default per Open Q J.3 founder default; tightening to per-wallet auth is a future RLS swap, not a schema change.
- **`tournament_id` FK is nullable.** History rows survive if a tournament row is later purged (Phase 1 testnet cutover). `ON DELETE SET NULL` preserves audit even if the tournament row vanishes.
- **No backfill insert.** Phase 1 testnet is wiped at mainnet cutover per Tier 1 lock; first mainnet tournament is the first rating event for everyone.

---

## Section D — Cron integration design

**D.1 Hook point — decoupled from settle path.**

Source-of-truth cron schedules live in `apps/orchestrator/vercel.json` (per packages/duel-backend/src/cron/tournaments.ts:7). X23.2 will add a new route + cron config there.

```
apps/orchestrator/src/app/api/cron/update-ratings/route.ts  ← new
apps/orchestrator/vercel.json                                ← add schedule entry
packages/duel-backend/src/cron/ratings.ts                    ← new business logic
```

**Trigger:** `v2_tournaments.settled_at IS NOT NULL AND ratings_updated_at IS NULL`.

**Cadence:** every 10 min (12 min budget per Vercel cron platform constraint; conservative spacing avoids overlap with settle cron at :00 and :05 hourly slots). Lock pattern reuses `v2_cron_runs` from `packages/duel-backend/src/cron/run-lock.ts` with `cronName: "update-ratings"`.

**D.2 Per-tournament update flow.**

```typescript
// packages/duel-backend/src/cron/ratings.ts (SKELETON ONLY — X23.2 implements)

import { updateRating, DEFAULT_RATING, type MatchOutcome, type RatingState } from '@skillos/glicko-rating';
import { acquireCronLock, currentMinuteWindow, releaseCronLock } from './run-lock';
import { getSupabaseService } from '@skillos/lib-shared';

export interface UpdateRatingsResult {
  tournamentsProcessed: number;
  ratingsUpdated: number;
  cohortsPruned: number; // > 200 participants — Phase 3 pruning
  errors: Array<{ tournamentId: string; message: string }>;
  lockSkipped?: boolean;
}

export async function runUpdateRatings(): Promise<UpdateRatingsResult> {
  // Lock pattern verbatim from runSettleTournaments — overlap-safe.
  const supabase = getSupabaseService();
  const lock = await acquireCronLock({
    supabase,
    cronName: 'update-ratings',
    windowStart: currentMinuteWindow(),
  });
  if (!lock.acquired) {
    return {
      tournamentsProcessed: 0, ratingsUpdated: 0, cohortsPruned: 0,
      errors: [], lockSkipped: true,
    };
  }

  try {
    // Fetch unrated settled tournaments. Bounded by p-limit (NOT by truncation)
    // mirroring PR #5 settle-cron throughput posture.
    const { data: pending } = await supabase
      .from('v2_tournaments')
      .select('id, game, settled_at')
      .not('settled_at', 'is', null)
      .is('ratings_updated_at', null)
      .order('settled_at', { ascending: true });

    // Per-tournament: pull submissions, group by class_tag, round-robin update.
    for (const t of pending ?? []) {
      await updateOneTournament(t, supabase);
    }
  } finally {
    await releaseCronLock({ supabase, cronName: 'update-ratings', windowStart: currentMinuteWindow(), summary: {} });
  }
}

async function updateOneTournament(t: { id: string; game: string }, supabase: any) {
  // 1. Fetch participants (entries + solo runs union). Each row carries class_tag.
  // 2. Group by class_tag (human / agent). Per Tier 1 lock — same-class cohorts only.
  // 3. For each cohort:
  //    a. If cohort.length > 200 — log + skip (Phase 3 pruning, see D.5).
  //    b. If cohort.length < 2 — no opponents; skip (single-participant cohort).
  //    c. Round-robin pairwise — every participant rated against every other.
  //    d. Score derivation: 1 = higher score wins, 0 = lower, 0.5 = tie.
  //    e. For each participant: read current RatingState, call updateRating(...),
  //       upsert v2_player_ratings, append v2_player_rating_history.
  // 4. Stamp v2_tournaments.ratings_updated_at — flips idempotency flag.
}
```

**D.3 Pairing strategy — round-robin within same-class cohort.**

Per Tier 1 lock: ≤200 participants per tournament, round-robin all-pairs. For an N-player cohort, each player gets `N-1` `MatchOutcome` rows fed into `updateRating(...)` in a single rating period.

- **Class-segregated:** human ratings only update against human opponents; agent ratings only update against agent opponents. Mixed-declared tournaments produce two parallel rating updates.
- **Solo-mode tournaments:** participants are `v2_tournament_solo_runs` rows. Pairing is still "all against all" — comparing best scores.
- **Duel-mode tournaments:** `v2_tournament_entries` is the participant table. `source_duel_ids` already contains the literal pairings; X23.0 SPEC keeps it simple by treating the final tournament ranking as the round-robin outcome rather than per-duel pairing. **Open Q J.6** asks whether to use per-duel pairing instead — defer to X23.2 with founder input.

**D.4 Score derivation.**

```typescript
function deriveScore(myBest: number, opponentBest: number): 0 | 0.5 | 1 {
  if (myBest > opponentBest) return 1;
  if (myBest < opponentBest) return 0;
  return 0.5; // exact tie (rare in score-based games)
}
```

**D.5 Phase 3 pruning (>200 participant cohort).**

Not implemented in X23.2. Cron logs `ratings.cohort.pruned` with `tournament_id` and `cohort_size`. The tournament still gets `ratings_updated_at` stamped so we don't retry. Phase 3 follow-on tactics (deferred):

- Stratified random sampling within cohort (preserves rating distribution).
- Top-K + neighborhood pairing (each player rated against top-50 + ±25 nearest by current rating).
- Capacity-aware truncation (process top-200 by submission time, log the rest as `pruned_rated=false`).

**D.6 Failure isolation.**

Per-tournament error doesn't abort the sweep. `result.errors[]` collects; cron returns 200 with structured error array. Same pattern as `runSettleTournaments.errors`. No on-chain writes in this cron → no nonce conflicts → no equivalent to `NonceManager`.

---

## Section E — API surface

**E.1 New endpoints — `apps/api/src/routes/ratings.ts` (X23.3 implements).**

All endpoints follow the OpenAPIHono createRoute pattern at `apps/api/src/routes/scores.ts:49` for consistency with existing API. Cursor pagination via `decodeIndexCursor`/`encodeIndexCursor` from `apps/api/src/lib/pagination.ts`.

```
GET /v1/ratings/{wallet}
  Description: All ratings for a wallet across games and classes.
  Auth: none (public).
  Response 200: {
    wallet: string,
    ratings: Array<{
      game: string,
      class: 'human' | 'agent',
      rating: number,
      rd: number,
      volatility: number,
      updatesCount: number,
      lastUpdate: ISO8601 | null,
    }>,
  }
  Response 422: ErrorEnvelope (invalid wallet format)

GET /v1/ratings/leaderboard?game=2048&class=human&cursor=...&limit=100
  Description: Top-N ratings within a (game, class) cohort.
  Auth: none (public).
  Query: { game, class, cursor?, limit (1–500, default 100) }
  Response 200: {
    game: string,
    class: 'human' | 'agent',
    rankings: Array<{
      rank: number,         // 1-indexed within page
      wallet: string,
      rating: number,
      rd: number,
      volatility: number,
      lastUpdate: ISO8601,
    }>,
    pagination: { next?: cursor },
  }

GET /v1/ratings/history/{wallet}?game=2048&class=human&cursor=...&limit=20
  Description: Rating-change audit log for a wallet, optionally scoped.
  Auth: none (public per Open Q J.3 default; tighten to bearer later if needed).
  Query: { game?, class?, cursor?, limit (1–100, default 20) }
  Response 200: {
    wallet: string,
    history: Array<{
      game: string,
      class: 'human' | 'agent',
      ratingBefore: number,
      ratingAfter: number,
      rdBefore: number,
      rdAfter: number,
      tournamentId: string | null,
      matchesCount: number,
      recordedAt: ISO8601,
    }>,
    pagination: { next?: cursor },
  }
```

**E.2 OpenAPI integration.** Routes register via `scoreRoutes.openapi(...)` pattern (see scores.ts:74). OpenAPI schema doc at `/openapi.json` auto-publishes the new paths — no manual swagger work.

**E.3 Rate limiting.** Public endpoints — apply the same `check as rateLimit` middleware used at `apps/api/src/lib/rate-limit.ts`. Suggested limits:
- `/v1/ratings/{wallet}` — 120/min per IP
- `/v1/ratings/leaderboard` — 60/min per IP (more expensive query)
- `/v1/ratings/history/{wallet}` — 60/min per IP

**E.4 Caching posture.** Vercel CDN: `Cache-Control: public, max-age=30, s-maxage=60`. Ratings update every 10 min so a minute of staleness is acceptable. Leaderboard route MUST NOT cache when called with `cursor` (paginated views are not edge-cache friendly).

---

## Section F — Frontend integration scope (X23.4 — post-mainnet OK)

**F.1 Profile page (`apps/skillos-apex/src/app/wallet/[address]/...`).**

- New section: "Skill Ratings" below SP balance card.
- Per-game card showing both `human` and `agent` ratings if either exists.
- LOC estimate: 80–120 lines (one new component `RatingsCard.tsx` + integration in existing profile page; uses `/v1/ratings/{wallet}`).

**F.2 Apex leaderboard (`apps/skillos-apex/src/app/leaderboard/...`).**

- Convert top-level into tabbed view: `[SP Balance] [Skill Rating]`.
- Skill Rating tab: nested tabs per (game, class) — `2048 Human`, `2048 Agent`, `Wordle Human`, etc.
- Reuses `/v1/ratings/leaderboard` with game+class query params.
- LOC estimate: 150–200 lines (new `RatingLeaderboardTab.tsx` + tab-state refactor in existing leaderboard page).

**F.3 Game subdomain leaderboard column (each of `apps/2048`, `apps/wordle`, etc.).**

- Add "Rating" column next to score on per-game tournament leaderboard.
- LOC estimate per game: 20–40 lines (column cell + data fetch hook). Six games = 120–240 LOC total.

**F.4 Total X23.4 LOC budget.** ~350–560 LOC across 8 files. Post-mainnet sequencing OK; founder may release this as a follow-on PR after main net launch with the ratings system already populating live data.

---

## Section G — Test strategy

**G.1 Unit — library wrapper (`packages/glicko-rating/test/`).**

- **Determinism:** fixed `(rating, rd, vol, matches)` input → exact expected output. Three canonical vectors from Mark Glickman's 2013 paper (http://www.glicko.net/glicko/glicko2.pdf).
- **DEFAULT_RATING values** match SkillOS lock (1000 / 350 / 0.06).
- **Empty matches array** is a no-op or RD inflation (verify against library behavior).
- **`tau` parameter override** produces different output than default.

**G.2 Integration — cron path (`packages/duel-backend/test/cron-ratings.test.ts`).**

- **Happy path:** mocked Supabase, 4 participants, all 'human', round-robin produces 4 rating writes + 4 history rows + 1 tournament stamp.
- **Empty cohort:** 1 participant → 0 rating writes, tournament still stamped.
- **Mixed class:** 3 human + 2 agent → human cohort produces 3 updates, agent cohort produces 2, no cross-class updates.
- **>200 cohort:** log + skip + tournament stamped (Phase 3 pruning placeholder).
- **Lock skipped:** second concurrent invocation returns `lockSkipped: true`.
- **Per-tournament error:** one tournament throws, others still process.

**G.3 Smoke — API endpoints (manual + curl scripts at `scripts/x23-ratings-smoke.ts`).**

- `GET /v1/ratings/{wallet}` — known wallet returns expected shape.
- `GET /v1/ratings/leaderboard?game=2048&class=human` — pagination cursor round-trip.
- `GET /v1/ratings/history/{wallet}` — history rows ordered newest-first.

**G.4 CI integration.** Per memory `feedback_claudemd_ci_state_stale` — GitHub Actions enforces `typecheck + test-ts + test-foundry + lint`. New wrapper package + cron + API routes all land in those checks automatically; no workflow changes needed.

---

## Section H — Sub-sprint breakdown

**H.1 Estimates per Tier 2 §2.9 agent-velocity convention.**

| Sub-sprint | Deliverable | Estimate | Mainnet pre-req? |
|---|---|---|---|
| **X23.0** | This SPEC.md | 2–3 h | Yes |
| **X23.1** | `packages/glicko-rating` workspace + wrapper impl + unit tests + migration file (no apply) | 2–3 h | Yes |
| **X23.2** | `packages/duel-backend/src/cron/ratings.ts` + `apps/orchestrator/src/app/api/cron/update-ratings/route.ts` + `vercel.json` schedule + integration tests | 4–6 h | Yes |
| **X23.3** | `apps/api/src/routes/ratings.ts` + OpenAPI shape + smoke scripts + rate-limit config | 3–4 h | Yes |
| **X23.4** | Frontend (profile + apex tabs + game subdomain column) | 10–15 h | **No — post-mainnet** |
| **X23.5** | Backfill | 0 h | **N/A — Tier 1 lock = NO** |
| **X23.6** | Audit packet supplement (docs/audit-packet entries + verification scripts + open-algorithm narrative) | 2–3 h | Yes |
| | **Mainnet pre-req sum (X23.0/.1/.2/.3/.6)** | **~13–19 h** | |
| | **Full system sum** | **~23–34 h** | |

**H.2 Dependency graph.**

```
X23.0 (spec) ─→ X23.1 (lib + schema)
                    ├─→ X23.2 (cron)
                    │       └─→ X23.6 (audit packet)
                    └─→ X23.3 (API)
                            └─→ X23.4 (frontend — post-mainnet)
```

X23.1 must apply migration before X23.2 cron can run. X23.3 API can develop in parallel with X23.2 (no shared code beyond schema). X23.6 audit packet depends on X23.2 being live so we can reference deployed behavior.

---

## Section I — Audit firm posture

**I.1 Why this system is audit-friendly.**

| Property | Evidence |
|---|---|
| Open algorithm | Glicko-2 spec public since 2013 — Mark Glickman, Boston University. Math fully documented. |
| Open implementation | `glicko2-lite` MIT-licensed, public source at https://github.com/kenanyildirim/glicko2-lite. Audit firm can read every line. |
| Deterministic | Pure function `updateRating(current, matches, tau) → next`. No randomness, no external I/O. Replayable from `v2_player_rating_history` rows. |
| Class-aware cohorts | X14.0 schema enforces class declaration on every submission. Rating updates never cross class boundaries — `human` vs `agent` are independent ladders. |
| Decoupled from chain | No on-chain writes in rating cron. Substrate stays class-agnostic per CLAUDE.md invariant #5. Audit can scope to "off-chain DB + REST API only" — no Solidity surface. |
| Auditable history | Append-only `v2_player_rating_history` log captures `(before, after, tournament_id, matches_count, timestamp)` for every rating update. RLS = anon SELECT (public-by-default per Open Q J.3). |

**I.2 Pitch deck talking points.**

- "Skill measurement is transparent: open algorithm, open implementation, auditable computation, public history."
- "Cross-class data flywheel: comparing agent-vs-human rating drift is a Phase 3+ revenue surface for AI lab licensing (see Phase 3 strategy doc)."
- "Sponsor filter mechanism: tournaments can require `rating ≥ X` cohorts to attract competitive sponsors without gatekeeping casual players from open pools."

**I.3 What the audit packet needs (X23.6 deliverable).**

- Link to this SPEC.md (canonical reference).
- Link to `glicko2-lite` source + MIT license file.
- Sample replay script proving rating recomputation from history log matches current state.
- RLS policy review showing `service_role` is the sole writer.

---

## Section J — Open questions (founder decisions)

**Working-mode note (2026-05-18):** founder approved "no clarifying questions, make the reasonable call and continue." Each Open Q below has a **recommended default** that X23.1+ will adopt unless founder explicitly overrides on the PR. Surfacing here so the choices are visible in review, not blocking.

**J.1 `tau` system constant.**
- Glicko-2 paper default: 0.5
- SkillOS tuning candidates: 0.3 (tighter — competitive feel) ↔ 0.7 (looser — casual feel)
- **Default:** 0.5. Tunable post-mainnet via env var if leaderboard skew calls for it.

**J.2 Rating history retention.**
- Options: forever / N-period TTL / soft-archive after 1 year
- **Default:** forever for now. Storage cost is negligible at expected volume (≈10 KB/wallet/year). Revisit at Phase 3 if Postgres bloat becomes a concern.

**J.3 Rating history visibility.**
- Options: public per-wallet (anon SELECT on `v2_player_rating_history`) / private (bearer-auth required)
- **Default:** public. Aligns with audit firm posture ("auditable history"). Anon RLS policy reflects this.

**J.4 Tournament class enforcement at rating update.**
- Options: strict same-class only / cross-class with attribution / unified rating across classes
- **Default:** strict same-class only. Locked by Tier 1 ("per (wallet, game, class) ratings"). No cross-class updates. Mixed-declared tournaments produce two parallel cohort updates.

**J.5 Library wrapper as separate package?**
- Options: `packages/glicko-rating` standalone workspace / inline `packages/duel-backend/src/lib/glicko/`
- **Default:** separate workspace. Enables SDK consumption at X23.4+ (SDK leaderboard endpoint can use it client-side for predicted rating delta UI). Adds one workspace to the monorepo but avoids future extraction churn.

**J.6 Duel-mode tournament pairing — final ranking vs per-duel?**
- Options: use tournament final ranking as round-robin proxy / use literal `source_duel_ids` per-duel pairings
- **Default:** final-ranking round-robin (simpler, consistent with solo-mode). Per-duel pairing is more "Glicko-correct" but requires tournament-aware extraction logic that complicates the cron. X23.2 implements the default; revisit if duel-mode tournaments become a significant share of post-mainnet volume.

**J.7 Class enum extension lever.**
- Today: `('human', 'agent')` per X14.0 schema lock.
- Future: if multi-class tournaments ever ship (e.g. `'team'`, `'bot-tournament'`), the rating system inherits automatically because the check constraint is copy-pasted from X14.0. **No SPEC action needed today** — just acknowledged.

---

## Appendix — file additions summary (for X23.1+ implementation)

```
NEW:
  packages/glicko-rating/
    package.json
    tsconfig.json
    src/index.ts                                # Wrapper interface
    test/index.test.ts                          # Determinism vectors
  supabase/migrations/v4_YYYYMMDD_x23_ratings.sql
  packages/duel-backend/src/cron/ratings.ts
  packages/duel-backend/test/cron-ratings.test.ts
  apps/orchestrator/src/app/api/cron/update-ratings/route.ts
  apps/api/src/routes/ratings.ts
  apps/api/src/schemas/rating.ts                # Zod schemas for ratings API
  scripts/x23-ratings-smoke.ts                  # Manual API smoke
  docs/audit-packet/x23-rating-system.md        # X23.6 audit supplement

MODIFIED:
  apps/orchestrator/vercel.json                 # Add update-ratings schedule
  apps/api/src/index.ts                         # Mount ratingsRoutes
  packages/duel-backend/package.json            # Add @skillos/glicko-rating workspace dep
  apps/skillos-apex/src/app/wallet/...          # X23.4 profile integration
  apps/skillos-apex/src/app/leaderboard/...     # X23.4 leaderboard tabs
  apps/{2048,wordle,sudoku,minesweeper,clicker,match3}/...
                                                # X23.4 game-subdomain rating column
```

---

**End of SPEC. X23.1 begins after this PR merges.**
