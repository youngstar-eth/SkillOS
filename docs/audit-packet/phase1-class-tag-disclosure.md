# SkillOS Phase 1 — class_tag implementation surface disclosure

> **Status:** Audit-firm-ready disclosure, prepared May 18, 2026.
> **Cross-reference:** v1.6 architecture supplement §3.20 "doğru niyet, yapısal kısıt" pattern, X14.0 sprint PR #130, X14-hotfix scoping agent pre-flight verification (drift caught, hotfix closed as no-op).
> **Sprint reference:** X14.1-5 Phase 2 mainnet pre-req queue for per-game route anti-cheat surface closure.

## Architectural intent

SkillOS implements two distinct submission paths by design:

1. **Per-game Next.js routes** (`/api/tournaments/[id]/solo`, via `createTournamentSoloHandler` in `packages/duel-backend/src/api/tournaments/solo.ts`):
   - Anonymous endpoint, no auth middleware
   - `class_tag='human'` persistence (hardcoded literal at L517 and L616)
   - 403 reject enforcement at L416-422 when `tournament_class === 'agent-only'`
   - Explicit design comment at L413-415: *"X14.0: class enforcement. Per-game routes are the human-only path — no SIWA wiring here. Reject if the tournament is declared agent-only. Off-chain enforcement only (supplement v1.5 §3.16)."*

2. **SIWA-gated Hono endpoint** (`/v1/scores`, in `apps/api/src/routes/scores.ts`):
   - Bearer SIWA authentication required (X-Authorization header, `@buildersgarden/siwa` verifier)
   - `is_agent: true`, `class_tag: 'agent'` persistence (L306-307)
   - Tournament class enforcement at submit-time (403 on `human-only` ↔ agent submission mismatch)

The substrate stays class-agnostic (CLAUDE.md invariant #3 — *"Agent participation is a class, not a feature flag"*). Class enforcement lives at the route layer where authentication context is available; the database schema persists the resolved class as a NOT NULL column per X14.0 child persistence design (v4_20260518_x14_class migration).

## Phase 1 testnet baseline (May 18, 2026)

Direct database introspection via Supabase MCP against project `clizuqvtkekzxiflbsyr` (single project — no staging branch yet, see [[project_skillos_no_staging_supabase]]):

| Table | Total rows | `class_tag` distribution | First seen (UTC) | Last seen (UTC) |
|---|---|---|---|---|
| `v2_tournament_solo_runs` | 387 | 387 `human` / 0 `agent` | 2026-04-23 11:46:16 | 2026-05-18 07:27:11 |
| `v2_tournament_entries` | 349 | 349 `human` / 0 `agent` | 2026-04-23 11:46:18 | 2026-05-18 07:27:11 |
| `v2_duels` | 13 | 13 `(human, human)` / 0 with agent side | 2026-04-20 22:22:03 | 2026-04-23 19:07:18 |

Timestamps reflect each table's submission/creation column (`submitted_at` for `solo_runs`, `created_at` for `entries` and `duels`).

**All Phase 1 testnet traffic routed through per-game routes.** The SIWA-gated `/v1/scores` Hono endpoint is shipped (X14.0 T1+ lift, closes the prior 501 plausibility-gate mainnet blocker per v1.6 §3.16) and ready, but has not yet seen production traffic — real autonomous agent player participation through this surface scales in Phase 2 alongside X14.1-5 enforcement layers. The duel path is currently dormant (last submission 2026-04-23) pending Phase 2 reactivation.

## Anti-cheat surface closure roadmap

Per-game route anti-cheat surface — preventing an agent operator from submitting via the anonymous human-only path with a `playerAddress` they control — is scoped to **X14.1-5 enforcement layers** (per v1.6 supplement §3.16 X14 architectural posture):

- **X14.1** Extension whitelist (wallet allowlist for human-only tournaments)
- **X14.2** AI browser detection (Comet / Atlas / Antigravity / Claude-in-Chrome fingerprints)
- **X14.3** Behavioral biometrics (opt-in mouse + keyboard signal capture)
- **X14.4** Dishonor SBT (ERC-5192 contract + mint flow on class violation)
- **X14.5** Integration test + class boundary regression suite

These layers operate at the API + client + audit layer (substrate stays class-agnostic per CLAUDE.md invariant #5). Violations produce immutable on-chain evidence via dishonor SBT rather than being silently dropped.

## Audit firm posture

This is a §3.20 "doğru niyet, yapısal kısıt" pattern instance — design intentional, structural enforcement at the route layer (separation of concerns), maturity-gated anti-cheat hardening. Phase 1 testnet ships the foundation; Phase 2 mainnet pre-req queue closes the anti-cheat surface before real autonomous agent participation matures through the SIWA path.

The framing per v1.6 §3.20:

> *"Phase 1 testnet class enforcement scope is route-layer (anonymous human-only path + SIWA-gated agent path), with anti-cheat surface closure scoped to X14.1-5 enforcement layers. Pre-mainnet rebuild architectural per X14.1-5 sub-sprints. Substrate class-agnostic per invariant #3."*

is structurally stronger than:

> *"We persist class_tag='human' on the anonymous endpoint."*

The first frames Phase 1 class enforcement as deliberate maturity-gated architecture; the second frames it as incomplete implementation. SkillOS audit-firm narrative selects frame 1, supported by the explicit X14.0 design comment in code and the X14.1-5 closure roadmap.

## Discovery context (drift catch as transparency signal)

This disclosure surfaced through a multi-protective drift detection event:

- Founder + Claude (chat synthesis) + X23 Glicko-2 scoping agent **triangulated incorrectly** — all three assumed a "silent class_tag bug" interpretation on May 18
- X14-hotfix scoping agent **caught the drift via pre-flight verification** (per v1.6 §3.14 VTP discipline) by reading the actual handler signature + design comment at `packages/duel-backend/src/api/tournaments/solo.ts:413-415`
- Hotfix closed as no-op (no code change, no production damage)
- Memory canonical entries updated to prevent future drift
- This disclosure recalibrated to the "intentional two-path design" framing reflected throughout this document

The drift catch itself is an audit firm transparency signal — the discipline that surfaces these gaps before they ship to mainnet is the same discipline that protects production state. v1.6 §3.19 codifies this as operational pattern lock pre-X9-merge.

## Cross-references

- `/docs/architecture/supplements/architecture-doc-supplement-v1.6.md` §3.14 (VTP discipline) — pre-flight verification standard
- `/docs/architecture/supplements/architecture-doc-supplement-v1.6.md` §3.16 (X14 architectural posture) — class enforcement layer placement
- `/docs/architecture/supplements/architecture-doc-supplement-v1.6.md` §3.19 (sustained execution retrospective) — operational pattern locks
- `/docs/architecture/supplements/architecture-doc-supplement-v1.6.md` §3.20 ("doğru niyet, yapısal kısıt" pattern) — analytical frame for this disclosure
- GitHub PR #130 — X14.0 tournament class declaration + child persistence + T1+ lift
- Supabase migration `supabase/migrations/v4_20260518_x14_class.sql` — class column NOT NULL constraints
