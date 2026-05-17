# X20 — AntiCheat Rebuild (F0-F4) — Scoping Pass

**Sprint:** X20 (pre-mainnet architectural rebuild)
**Branch:** `sprint/x20-scoping-pass1`
**Pass:** Scoping only — no implementation
**Date:** 2026-05-17
**Phase 1 wrap, Cluster 1:** completes the post-T5-3 sprint queue framing

---

## 0. Purpose

Decompose the X20 AntiCheat architectural rebuild (locked in supplement v1.4 §3.13) into 5 executable sub-sprints with paste-ready prompts. Architecture is locked (Option F); this doc does not re-litigate it. Open questions are surfaced for founder decision before any sub-sprint enters implementation.

This is a Phase 1 wrap deliverable. No production code is touched.

---

## 1. Current state baseline

Source of truth for "what AntiCheat actually does today":
- `docs/audit-prep/t5-3-anticheat-verification.md` (Sprint UR Pass 1 / T5-3, 2026-05-17, verdict (a) Haiku-direct **VERIFIED**)
- `docs/architecture/supplements/architecture-doc-supplement-v1.4.md` §3.13

### What exists in code (verified 2026-05-17)

| Layer | Reality | Location |
|---|---|---|
| Duel hard bounds: `score ∈ (0, 50_000)` integer | ✓ Active | `packages/duel-backend/src/handlers.ts:385-394` |
| Duel play-window (`elapsed ≤ PLAY_WINDOW_MS + SUBMIT_GRACE_MS`) | ✓ Active | `packages/duel-backend/src/handlers.ts:417` |
| Solo score validation: non-negative integer (NO upper cap) | ✓ Active | `packages/duel-backend/src/api/tournaments/solo.ts:292-305` |
| Solo `durationSeconds`: int ∈ [0, 86_400], **client-supplied** | ✓ Active | `packages/duel-backend/src/api/tournaments/solo.ts:320-336` |
| Haiku AntiCheat verdict (duel only) → on-chain `flagScore` | ✓ Active (duel path currently inactive via `<DuelComingSoon />`) | `packages/duel-backend/src/cron/tournaments.ts:925` (SOLE on-chain writer) |
| Deterministic formula plausibility (duration × moves × score) | ❌ **Never implemented** | — |
| `moves` / `move_count` field in submit payload | ❌ **Never captured** | confirmed: no hits in `handlers.ts`, `solo.ts`, `settle.ts`, `anticheat/generate.ts` |
| Confidence threshold on Haiku verdict | ❌ Field stored, never read by any write decision | `cron/tournaments.ts:902` — strict equality on `verdict === 'implausible'` |
| Per-tournament max-flag circuit-breaker | ❌ Not implemented | — |
| Off-chain advisory queue (Haiku as informational only) | ❌ Not implemented | — |
| Solo runs on-chain flag-exclusion | ❌ Bypassed entirely (cron join is duel-only on `source_duel_ids`) | T5-3 verification §6 "Additional gaps" item 1 |
| Class enforcement (human vs agent) | ❌ Pending X14 sprint | — |

### Critical gap implication

Once a duel submission slips past the crude hard-bounds gate (e.g. `score=49_999, durationSeconds=2`), the ONLY thing standing between it and an on-chain prize payout is the Haiku verdict. There is no `T11.5` deterministic re-check before `flagScore`. The bias-toward-plausible mechanism (T5-3 §5 Layers A/B/C) covers the **infrastructure-failure axis** (Haiku timeout, parse fail → default plausible) but does NOT cover the **regression/prompt-injection axis** (Haiku confidently emits `implausible` for benign matches → propagates unattenuated to on-chain `flagScore`).

Solo path has a parallel gap: no upper score bound at all, and `durationSeconds` is client-supplied without server cross-check.

---

## 2. Architectural lock — Option F (BINDING)

**Selected 2026-05-17. Re-derivation forbidden in X20 sub-sprints.**

Mainnet AntiCheat architecture:

> **Deterministic formula plausibility (primary) + class enforcement (X14) + Haiku as off-chain advisory queue only. NO irreversible LLM verdicts on-chain.**

Rationale (supplement v1.4 §3.13):

- Aligns with "decentralization earned, not claimed" pitch line
- Audit firm narrative: deterministic + auditable + no AI trust assumption on-chain
- Reduces centralization disclosure surface
- Preserves Haiku data collection for Phase 3+ dispute layer training input

**Disclosure framing (verbatim from §3.13, for audit firm packet):**

> *"Phase 1 testnet AntiCheat scope was limited: bounds + play-window checks (solo) + Haiku-direct on-chain flagScore (duel path, currently inactive). Formula plausibility was design intent never built. Class enforcement pending X14 sprint. Pre-mainnet rebuild architectural per X20 sub-sprints F0-F4: deterministic formula primary + class enforcement + Haiku off-chain advisory queue only. No irreversible LLM verdicts on-chain at mainnet launch."*

Sub-sprint scope below derives from this lock. Any sub-sprint that would re-introduce LLM authority on-chain is out-of-scope by construction.

---

## 3. Sub-sprint breakdown (5 sub-sprints, F0-F4)

Canonical per supplement v1.4 §3.13 (and memory `project_phase2_mainnet_blocker_plausibility`). Effort columns: **§3.13 raw** + **founder-calibrated 2-3×**.

| # | Sub-sprint | Scope summary | Raw effort | Calibrated (2-3×) | Mainnet pre-req |
|---|---|---|---|---|---|
| X20.0 | **F0 Formula implementation** | duration × moves × score plausibility, both paths (solo + duel). Per-game coefficient tables. Submit-time bound check. | 1 week | **2-3 weeks** | ✓ |
| X20.1 | **Solo path AntiCheat enforcement** | Formula gate at submit on solo path; reject implausible submissions before `submitSoloScore` broadcast (no on-chain flag needed). Closes T5-3 §6 gap #1 (solo bypass) + gap #2 (no upper bound). | 3-5 days | **1-3 weeks** | ✓ |
| X20.2 | **F1 Confidence gate** (transitional) | Haiku verdict only triggers `flagScore` when `confidence ≥ threshold`. Sub-threshold flows to admin queue. Defensive scaffolding only — obsoleted if X20.4 ships before mainnet. | 1 day | **2-3 days** | ✓ (or obsoleted) |
| X20.3 | **F2 Per-tournament circuit-breaker** | If `toFlag.length / entries.length > 0.2` for a single tournament, abort flag loop, write to admin-review table, alert. Catches Haiku regressions + prompt-injection storms before wallet burn. | 2-3 days | **1-2 weeks** | ✓ |
| X20.4 | **F4 Option F migration — Haiku → off-chain advisory queue** | Strip Haiku verdict from `cron/tournaments.ts:925` write path entirely. Haiku writes to `plausibility_advisory_queue` (admin reviewable). Formula (X20.0) is sole on-chain authority. **This is the Option F target architecture.** | 3-5 days | **1-2 weeks** | ✓ |

**Total calibrated envelope: ~6-11 weeks across 5 sub-sprints.** Parallel-able with X14 (class enforcement) and X11 (v2.2 contract). Sequencing constraint: X20.1 depends on X20.0; X20.4 may obsolete X20.2 (see Open Question §5.1).

**Post-mainnet expansion (Phase 3+) — out of X20 scope:**

| Sub-sprint | Scope | Phase |
|---|---|---|
| X20.5 — F3 Forensic columns | Audit trail (verdict, confidence, source, override history) on `plausibility_check` row | Post-mainnet |
| X20.6 — F4 Anomaly alerting | Op-level monitoring (Haiku regression detection, false-positive rate, false-negative rate, daily flag-count anomaly) | Post-mainnet |

(Memory note: the X20.6 label says "F4 Anomaly alerting" per §3.13 row but the F4 architectural milestone is X20.4. The two share an `F4` token because the §3.13 table re-uses Track-C-T5-3 §7 phase letters loosely; do not let that confuse sub-sprint sequencing. F-letters describe scope kinds, X-numbers are the executable sub-sprint sequence.)

---

## 4. Per-sub-sprint detail

### X20.0 — F0 Formula implementation

**Scope:**
- Define `evaluateFormulaPlausibility(gameType, { score, durationSeconds, moves }) → { verdict, reason }` in `packages/ai-coach/` (or new `packages/anticheat-formula/`).
- Per-game coefficient table (initially: 2048, wordle, sudoku, minesweeper, clicker, match3 — 6 active games). Each game has different `(score_max_per_move, max_score_per_second, min_seconds_per_move)` envelopes.
- Pure function, no I/O. Unit-tested with known plausible / implausible vectors per game.

**Hard dependency — `moves` plumbing prerequisite:**

`moves` is currently NOT captured by any submit handler, settle path, or anticheat input. F0 either:
- (a) Includes a `moves` plumbing PR as its first step (extend submit payload schemas + DB columns + propagate to verdict input), OR
- (b) Is preceded by a dedicated X20.0a "moves instrumentation" sub-sprint (recommended if the plumbing is non-trivial — likely is, given 6 game frontends + 2 backends).

Founder decision needed: see Open Question §5.4.

**Lock-in:**
- Pure function. NO `flagScore` writes, NO admin queue writes, NO Haiku coupling. F0 is *just* the formula.
- Coefficient tuning per-game requires play-data sampling — likely needs a calibration sub-step (see §5.2 open question).

**Dependencies:**
- `moves` instrumentation (see above)
- None on X20.1-X20.4

---

### X20.1 — Solo path AntiCheat enforcement

**Scope:**
- Call `evaluateFormulaPlausibility(...)` at solo submit time (`packages/duel-backend/src/api/tournaments/solo.ts` ~line 292-336, the existing bounds-check block).
- Reject implausible submissions with HTTP 400 `formula_implausible` BEFORE the on-chain `submitSoloScore` broadcast at line 480.
- Closes T5-3 §6 "Additional gaps surfaced" items 1 (solo runs bypass on-chain flagScore) and 2 (no upper bound on solo score).

**Lock-in:**
- No on-chain flag needed — rejection happens pre-broadcast. The cron path is irrelevant to solo.
- Logging: write rejected submissions to a `formula_rejections` table for tuning visibility (Phase 3+ surfaces these to an admin UI; X20.1 ships table only).

**Dependencies:**
- X20.0 (formula function must exist)
- Founder decision: should solo path also write Haiku advisory to queue, or skip Haiku entirely for solo? (Solo currently calls `firePlausibilityCheckAsync`; X20.4 reshapes what that queue means — see §5.1.)

---

### X20.2 — F1 Confidence gate (transitional)

**Scope:**
- Single-line change at `packages/duel-backend/src/cron/tournaments.ts:902`:
  ```ts
  // current:  if (verdict === 'implausible') { implausibleDuels.add(...) }
  // F1:       if (verdict === 'implausible' && confidence >= THRESHOLD) { implausibleDuels.add(...) }
  ```
- Threshold tuning per game type — defaults TBD (see Open Question §5.3).
- Sub-threshold rows flow to admin queue (POST companion to existing `api/admin/flags.ts`, currently read-only).

**Lock-in:**
- Defensive scaffolding ONLY. If X20.4 (advisory queue) ships before mainnet, this entire gate is obsolete — the cron stops reading Haiku verdict for any on-chain decision.
- **Do NOT build this if X20.4 is sequenced first.** See §5.1.

**Dependencies:**
- None code-side
- Founder decision §5.1 gates whether to build at all

---

### X20.3 — F2 Per-tournament circuit-breaker

**Scope:**
- In `cron/tournaments.ts` settle loop, before the `flagScore` write block: compute `toFlag.length / entries.length`.
- If ratio > `MAX_FLAG_RATIO_PER_TOURNAMENT` (default 0.2, configurable):
  - Abort the flag loop entirely for this tournament
  - Write all candidate flags to `admin_review_queue` table (new migration)
  - Emit alert (Sentry event or equivalent — `vercel.json` cron-runtime is the alerting surface today)
- Settles the tournament with NO exclusions on that tick; admin must manually flag from queue before next eligible settle.

**Lock-in:**
- Catches:
  - Haiku regressions (a new prompt deploy emits noisy false positives)
  - Prompt-injection storms (multiple players exploit a payload to lift verdicts)
  - Catastrophic model API anomalies
- Does NOT replace X20.2 or X20.4 — it's a separate axis (rate-limit, not threshold or off-chain).

**Dependencies:**
- New Supabase migration (`admin_review_queue`)
- Alerting surface (Sentry already wired per `sentry:sentry-setup-*` skill availability)

---

### X20.4 — F4 Option F migration: Haiku → off-chain advisory queue

**Scope:**
- Remove the `verdict === 'implausible'` read at `cron/tournaments.ts:900-902` entirely.
- Haiku verdict is written to `plausibility_advisory_queue` (new table) instead of being read by the cron's flag-decision block.
- `flagScore` is driven SOLELY by the formula verdict (X20.0). For duel path: if a duel's formula verdict was `implausible` at submit time, it never settled — so the cron flag-loop becomes "exclude entries whose formula-rejection state was missed at submit" (a redundant safety net, not the primary gate).
- Admin UI surface (out of X20 scope, post-mainnet) reads `plausibility_advisory_queue` and can manually issue a `flagScore` via POST to `api/admin/flags.ts` companion endpoint (built in X20.2 if X20.2 ships).

**Lock-in (THIS IS THE OPTION F TARGET):**
- **NO LLM verdict has authority over an on-chain write after this sub-sprint ships.**
- Audit firm packet disclosure (per §2 above) is true at mainnet only after this lands.
- This sub-sprint is what makes the "Option F" lock real in code; X20.0-X20.3 are stepping stones.

**Dependencies:**
- X20.0 (formula MUST be primary on-chain authority before Haiku is removed from cron decision path)
- X20.1 (solo path enforcement closes the bypass parallel)
- Optional: X20.2 (admin POST endpoint reused by advisory queue UI later)
- Founder decision §5.1: does X20.4 ship before or after X20.2?

---

## 5. Open architectural questions (founder decision)

These are blockers for sub-sprint kickoff — not for this scoping pass. Surfaced here for explicit decision before any X20.* sub-sprint enters implementation.

### 5.1 — F1 (X20.2) vs F4 (X20.4) sequence: is X20.2 needed if X20.4 ships?

**Question:** If X20.4 (Haiku → off-chain advisory queue) lands first, the entire `flagScore` write path stops reading Haiku verdict. X20.2 (confidence gate on the same write path) becomes architecturally moot.

**Three options:**

- **(a) Sequence X20.4 first; skip X20.2 entirely.** Saves 2-3 days. Risk: if X20.4 slips, mainnet has no defense against Haiku regression on the still-live verdict-read path.
- **(b) Ship X20.2 first as defensive scaffolding; then X20.4 obsoletes it.** Costs 2-3 days of throwaway code. Buys defense-in-depth during the X20.4 build window.
- **(c) Ship X20.2 first; treat X20.4 as a post-mainnet enhancement.** Reduces mainnet-blocker count from 5 to 4. Risk: Option F architectural lock is not fully realized at mainnet — disclosure packet wording weakens.

**Default recommendation (revisable):** (b) — defensive scaffolding is cheap relative to mainnet risk; once X20.4 lands, X20.2 lines are deleted in one commit. Founder calls.

---

### 5.2 — Per-game formula coefficients: who specifies the envelopes?

**Question:** F0 needs per-game `(score_max_per_move, max_score_per_second, min_seconds_per_move)` (or equivalent shape per game mechanic) for 6 games. Where do these numbers come from?

**Three options:**

- **(a) Founder specifies coefficients per game** (founder has played enough to assert envelopes). Fastest but risks overly tight bands → legitimate top players false-positived.
- **(b) Calibration sub-step in X20.0**: instrument formula evaluation in observe-only mode for 1-2 weeks on testnet, harvest p99 of legitimate play, set bands at p99 × 1.5. Adds 2-3 weeks to X20.0 wall-clock but produces audit-defensible numbers.
- **(c) Hybrid**: founder picks initial coefficients (loose), formula runs in advisory mode (logs would-have-flagged but doesn't reject) for 1 week, founder tightens based on log data.

**Default recommendation (revisable):** (c) — founder-knowledge bootstraps fast, advisory-mode logging validates before enforcement. Pure (b) is over-engineered for Phase 1 → Phase 2 transition; pure (a) risks production false positives.

---

### 5.3 — F1 confidence threshold: per-game tuning or one global value?

**Question (only relevant if X20.2 ships per §5.1):** `confidence >= THRESHOLD` — what threshold per game?

Initial framing from T5-3 §7: 0.7 across the board.

**Two options:**

- **(a) Single global threshold (0.7 or similar).** Simple; tune one number.
- **(b) Per-game thresholds.** Tighter games (sudoku, where Haiku knows the rules cold) can use lower threshold; looser games (clicker, where pattern-recognition is weaker) need higher threshold to avoid false flags.

**Default recommendation (revisable):** (a) — start global 0.7, escalate to per-game only if calibration data (§5.2) shows divergence > 0.1 across games. X20.2 is a transitional sub-sprint; over-engineering here is throwaway work.

---

### 5.4 — `moves` instrumentation: standalone X20.0a sub-sprint, or first step of X20.0?

**Question:** `moves` field is not currently captured by any submit handler or DB row. The formula needs it. Where does the plumbing work live?

**Concrete surface area:**
- 6 game-app frontends (apps/2048, wordle, sudoku, minesweeper, clicker, match3) need to track + POST `moves`
- 2 submit handlers (`packages/duel-backend/src/handlers.ts` for duel, `api/tournaments/solo.ts` for solo) need to accept + persist
- DB columns (`v2_duels`, `v2_tournament_solo_runs`) need migration
- Anticheat input wiring (`firePlausibilityCheckAsync` payload) — note that prompts at `packages/ai-coach/src/anticheat/prompts/base.ts:36` *forbid* the model from inventing move counts, so adding the real field is actually a prompt-quality win

**Two options:**

- **(a) Bundle into X20.0.** Single sub-sprint owns plumbing + formula. Adds ~1 week to X20.0 raw (so ~3-4 weeks calibrated).
- **(b) Split into X20.0a (plumbing) and X20.0b (formula).** Parallel-able: X20.0a touches 6 frontends + 2 backends + DB; X20.0b is a pure-function package. Cleaner blast radius per PR.

**Default recommendation (revisable):** (b) — `moves` plumbing has its own review surface (6 frontends + DB migration is meaningful change), and isolating it from formula coefficient debate keeps PRs reviewable. Total raw effort unchanged.

---

### 5.5 — Solo path formula scope: bound check only, OR full `duration × moves × score`?

**Question:** T5-3 §6 surfaced that solo path has NO upper score bound. The minimum fix is "add `score ≤ SOLO_MAX` cap". The maximal fix is "run full formula at submit". Where to land?

**Two options:**

- **(a) Minimum:** add `SOLO_MAX_PER_GAME` cap in `solo.ts:292-305`. Trivial, ~10 LoC, no `moves` dependency. Closes the immediate bypass; does NOT close the `score=49_999 in 2 seconds` pattern.
- **(b) Maximum (per §3.13 X20.1):** full formula gate. Catches both bound violations AND time/move ratio violations. Requires `moves` plumbing (§5.4).

**Default recommendation (revisable):** (b) — partial fix leaves the same class of bypass open on the solo path that T5-3 surfaced on the duel path. Mainnet pre-req discipline says close the class, not the instance. But (a) is a viable fallback if `moves` plumbing slips.

---

## 6. Paste-ready prompts (per sub-sprint)

Each prompt is self-contained, follows the established sprint-prompt shape (VTP pre-flight + bounded scope + explicit lock-in + commit/PR/stop). Substitute branch names + open-question resolutions at kickoff.

---

### 6.1 — X20.0a (recommended split per §5.4) — `moves` instrumentation

```
# X20.0a — `moves` instrumentation across submit pipeline

Plumbing sub-sprint. Adds `moves` field end-to-end: 6 game frontends → submit
handlers → DB → anticheat input. NO formula work; that's X20.0b.

## Step 0 — Worktree

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x20-0a-moves -b sprint/x20-0a-moves origin/main
cd ../MAS-x20-0a-moves
git config user.email '251514042+youngstar-eth@users.noreply.github.com'

## Step 1 — Pre-flight verification (VTP)

grep -rn "moves\|move_count" packages/duel-backend/src/handlers.ts \
  packages/duel-backend/src/api/tournaments/solo.ts \
  packages/ai-coach/src/anticheat/ --include="*.ts"
# Expected: zero hits in submit paths; one hit in prompts/base.ts:36 (forbids
# inventing counts — keep that line until anticheat-input.ts feeds real field).

ls supabase/migrations/ | tail -5
# Verify next migration filename slot.

## Step 2 — Implementation

DB:
- New migration: ADD COLUMN moves INTEGER NULL to v2_duels + v2_tournament_solo_runs.
- NOT NOT-NULL — old rows have NULL; new rows populated.

Submit handlers:
- packages/duel-backend/src/handlers.ts: accept `moves: number` in submit body
  (Zod schema), validate non-negative integer, persist to v2_duels.
- packages/duel-backend/src/api/tournaments/solo.ts: same for v2_tournament_solo_runs.

Frontends (6 apps):
- apps/2048, wordle, sudoku, minesweeper, clicker, match3
- Each game's submit POST must include `moves: <int>` (game-engine state already
  tracks; just wire to the submit payload).
- ZERO behavior change on the gameplay path — additive only.

Anticheat input:
- packages/ai-coach/src/anticheat/generate.ts: accept `moves` on the input
  type, pass into prompt.
- Keep the existing FORBIDDEN-counterfactual line at prompts/base.ts:36 —
  it's still correct; the model never invents counts, but now it knows the
  real count.

## Step 3 — Verification

- npm run typecheck (root) must pass.
- npm run test-ts must pass.
- Manual smoke: submit a 2048 duel + solo run, verify `moves` populated in DB.

## Step 4 — Commit, push, PR. Stop.

DO NOT modify formula logic. DO NOT change verdict-read paths. Plumbing only.
```

---

### 6.2 — X20.0b — Formula implementation (pure function)

```
# X20.0b — F0 Formula implementation (per-game plausibility)

Pure-function sub-sprint. Implements `evaluateFormulaPlausibility(gameType,
{ score, durationSeconds, moves })` and per-game coefficient table. No I/O,
no callers wired (that's X20.1).

DEPENDS ON X20.0a (moves field exists). Verify before starting.

## Step 0 — Worktree

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x20-0b-formula -b sprint/x20-0b-formula origin/main
cd ../MAS-x20-0b-formula
git config user.email '251514042+youngstar-eth@users.noreply.github.com'

## Step 1 — Pre-flight (VTP)

# X20.0a merged?
git log origin/main --grep="x20-0a-moves" -n 1
grep -n "moves" packages/duel-backend/src/handlers.ts | head -5
# If empty: STOP, X20.0a not landed yet.

## Step 2 — Implementation

New package OR file (founder picks):
- packages/anticheat-formula/  (new) OR
- packages/ai-coach/src/anticheat/formula.ts  (colocate)

Recommended: NEW package, because the lock requires formula to be the
on-chain authority — not gated behind the ai-coach package boundary which
implies AI-coupling.

Export:
- evaluateFormulaPlausibility(gameType: GameType, inputs: { score, durationSeconds, moves })
  → { verdict: 'plausible' | 'implausible', reason: string }

Coefficient table:
- Per game (2048, wordle, sudoku, minesweeper, clicker, match3)
- Initial values: founder-specified OR advisory-mode-bootstrapped (per
  open question §5.2 resolution)
- Documented in code with reasoning + p99 reference

Tests:
- packages/anticheat-formula/test/formula.test.ts
- Vectors per game: 3 plausible, 3 implausible, 3 boundary

NO callers wired. NO `flagScore` integration. NO DB writes.

## Step 3 — Verification

- npm run test-ts (formula package only — 100% coverage on the function)
- npm run typecheck

## Step 4 — Commit, push, PR. Stop.

Pure function only. Wiring is X20.1.
```

---

### 6.3 — X20.1 — Solo path AntiCheat enforcement

```
# X20.1 — Solo path formula enforcement at submit

Wires X20.0b formula into solo submit. Rejects implausible submissions BEFORE
on-chain submitSoloScore broadcast. Closes T5-3 §6 gaps 1 + 2.

DEPENDS ON X20.0b. Verify before starting.

## Step 0 — Worktree

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x20-1-solo -b sprint/x20-1-solo-enforce origin/main
cd ../MAS-x20-1-solo
git config user.email '251514042+youngstar-eth@users.noreply.github.com'

## Step 1 — Pre-flight (VTP)

# X20.0b merged?
node -e "console.log(require('@skillos/anticheat-formula').evaluateFormulaPlausibility)"
# If undefined: STOP.

## Step 2 — Implementation

packages/duel-backend/src/api/tournaments/solo.ts (~line 320-336, after
existing durationSeconds validation):

  import { evaluateFormulaPlausibility } from "@skillos/anticheat-formula";
  const formula = evaluateFormulaPlausibility(gameType, { score, durationSeconds, moves });
  if (formula.verdict === "implausible") {
    // Log rejection for tuning visibility
    await supabase.from("formula_rejections").insert({
      game_type, score, duration_seconds, moves, reason: formula.reason, ...
    });
    return new Response(JSON.stringify({
      error: "formula_implausible", reason: formula.reason,
    }), { status: 400 });
  }

New migration:
- CREATE TABLE formula_rejections (id, ts, game_type, score, duration_seconds,
  moves, reason, player_addr) — for tuning visibility, NOT for admin action.

Telemetry:
- Add Sentry breadcrumb on rejection (not error — operational signal).

## Step 3 — Verification

- npm run test-ts
- Integration test: submit a 2048 solo run with score=999999, durationSeconds=1,
  moves=2 → expect HTTP 400 formula_implausible, NO on-chain tx, row in
  formula_rejections.
- Submit a legitimate run → no behavior change.

## Step 4 — Commit, push, PR. Stop.

DO NOT touch duel path (that's still gated by hard bounds + Haiku at this
sub-sprint; X20.4 reshapes). DO NOT touch cron.
```

---

### 6.4 — X20.2 — F1 Confidence gate (ONLY if §5.1 = option b)

```
# X20.2 — F1 Haiku confidence gate (transitional)

Single-block change at cron/tournaments.ts. Defensive scaffolding only.
Obsoleted by X20.4. Build ONLY if open question §5.1 resolved as (b).

## Step 0 — Worktree

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x20-2-confidence -b sprint/x20-2-confidence origin/main
cd ../MAS-x20-2-confidence
git config user.email '251514042+youngstar-eth@users.noreply.github.com'

## Step 1 — Pre-flight (VTP)

grep -n "verdict === \"implausible\"" packages/duel-backend/src/cron/tournaments.ts
# Expected: hit at ~line 902.

grep -n "confidence" packages/ai-coach/src/anticheat/generate.ts | head -5
# Confirm confidence field is being written to plausibility_check.

## Step 2 — Implementation

packages/duel-backend/src/cron/tournaments.ts ~line 900-905:

  const verdict = (row as { plausibility_check: {
    verdict?: string; confidence?: number;
  } | null }).plausibility_check?.verdict;
  const confidence = (row as { plausibility_check: {
    verdict?: string; confidence?: number;
  } | null }).plausibility_check?.confidence ?? 0;
  if (verdict === "implausible" && confidence >= F1_CONFIDENCE_THRESHOLD) {
    implausibleDuels.add(row.id);
  } else if (verdict === "implausible") {
    // Sub-threshold → admin queue (POST companion to api/admin/flags.ts)
    await supabase.from("anticheat_admin_review").insert({ duel_id, verdict, confidence, ... });
  }

Constants:
- F1_CONFIDENCE_THRESHOLD = 0.7 (default, per §5.3 open question (a))
- OR per-game lookup if §5.3 resolved as (b)

New POST endpoint:
- POST /api/admin/flags with admin auth, body { duel_ids: string[] }
- Issues flagScore on-chain for admin-approved sub-threshold rows
- Reuses existing cron wallet pattern

New migration:
- CREATE TABLE anticheat_admin_review (id, duel_id, verdict, confidence,
  created_at, reviewed_at, reviewed_by, decision)

## Step 3 — Verification

- npm run test-ts (cron integration + admin POST)
- Manual: synthetic plausibility_check row with confidence=0.5, verdict=implausible
  → expect row in anticheat_admin_review, NO flagScore tx.
- Same with confidence=0.8 → expect flagScore tx.

## Step 4 — Commit, push, PR. Stop.

DO NOT touch the formula path. DO NOT remove verdict read (X20.4's job).
```

---

### 6.5 — X20.3 — F2 Per-tournament circuit-breaker

```
# X20.3 — F2 Per-tournament flag-rate circuit-breaker

Adds mass-false-positive defense to cron settle loop. Independent of X20.2
and X20.4 — runs alongside whichever flag-decision path is current.

## Step 0 — Worktree

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x20-3-circuit -b sprint/x20-3-circuit-breaker origin/main
cd ../MAS-x20-3-circuit
git config user.email '251514042+youngstar-eth@users.noreply.github.com'

## Step 1 — Pre-flight (VTP)

grep -n "toFlag\|flagScore" packages/duel-backend/src/cron/tournaments.ts | head -10
# Confirm flag-loop shape ~line 912-944.

## Step 2 — Implementation

packages/duel-backend/src/cron/tournaments.ts, in runSettleTournaments loop,
BEFORE the flag-write block:

  const flagRatio = toFlag.length / entries.length;
  if (flagRatio > MAX_FLAG_RATIO_PER_TOURNAMENT) {
    // Circuit-breaker: abort flag loop, write to admin review, alert
    await supabase.from("admin_review_queue").insert(
      toFlag.map(e => ({ tournament_id, entry_id: e.id, reason: "circuit_breaker_tripped", flag_ratio: flagRatio }))
    );
    Sentry.captureEvent({ message: "anticheat_circuit_breaker_tripped", level: "warning", extra: { tournament_id, flag_ratio: flagRatio } });
    // Continue settle without exclusions — ranking proceeds on all entries
    continue; // skip flag-write block
  }

Constants:
- MAX_FLAG_RATIO_PER_TOURNAMENT = 0.2 (configurable per env var)

New migration:
- CREATE TABLE admin_review_queue (id, tournament_id, entry_id, reason, flag_ratio, created_at, reviewed_at, reviewed_by, decision)

Alerting:
- Sentry already wired; level=warning suffices for v1.

## Step 3 — Verification

- npm run test-ts
- Integration test: synthetic tournament with 5 entries, 3 marked implausible
  → ratio = 0.6 > 0.2 → expect circuit-break, 3 rows in admin_review_queue,
  Sentry event captured, NO flagScore txes.
- Same with 1 marked implausible (ratio 0.2 = threshold) → expect flag fires
  (strict >).
- Edge case: 5 entries, 1 implausible (ratio 0.2 exactly) — verify strict >
  semantics match founder intent.

## Step 4 — Commit, push, PR. Stop.

Independent sub-sprint. Plays nice with X20.2 and X20.4.
```

---

### 6.6 — X20.4 — F4 Option F migration (Haiku → off-chain advisory)

```
# X20.4 — Option F migration: Haiku verdict OFF on-chain decision path

The Option F target architecture. After this lands: NO LLM verdict has
authority over any on-chain write. Formula (X20.0b) is the sole on-chain
authority.

DEPENDS ON X20.0b + X20.1. Strongly recommended X20.3 (circuit-breaker)
already landed for defense-in-depth during build window.

## Step 0 — Worktree

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x20-4-option-f -b sprint/x20-4-option-f-migration origin/main
cd ../MAS-x20-4-option-f
git config user.email '251514042+youngstar-eth@users.noreply.github.com'

## Step 1 — Pre-flight (VTP)

# X20.0b + X20.1 landed?
node -e "console.log(require('@skillos/anticheat-formula').evaluateFormulaPlausibility)"
grep -n "formula_implausible\|evaluateFormulaPlausibility" packages/duel-backend/src/api/tournaments/solo.ts
# Both must hit. Else STOP.

## Step 2 — Implementation

packages/duel-backend/src/cron/tournaments.ts:
- DELETE the implausibleDuels read block at ~line 896-905 (the
  plausibility_check.verdict reader).
- Replace with formula-based check: for each duel in source_duel_ids, evaluate
  formula plausibility from stored fields. If formula.verdict === 'implausible',
  add to implausibleDuels.
- (Note: by X20.1, implausible duels never settled — so this block is the
  redundant safety net for duels that somehow slipped past submit-time check.)

packages/duel-backend/src/settle.ts:
- firePlausibilityCheckAsync still runs Haiku (don't break the data collection
  pipeline — Phase 3+ dispute layer training input depends on it).
- BUT: write to plausibility_advisory_queue table, NOT plausibility_check
  for the verdict-read purpose. The plausibility_check column stays (existing
  read-only consumers: SP multiplier, admin queue, public masked endpoint).
- Add comment block at cron/tournaments.ts top: "By Option F lock (supplement
  v1.4 §3.13), this function MUST NOT read plausibility_check.verdict for any
  on-chain decision. Formula is the sole on-chain authority."

New migration:
- CREATE TABLE plausibility_advisory_queue (id, duel_or_solo_run_id, verdict,
  confidence, reasoning, flags, created_at) — advisory data only, no
  decision-tier index.

Admin POST (if X20.2 didn't land):
- POST /api/admin/flags companion endpoint, admin-auth-gated, body { ids: [] }
- Issues flagScore for admin-approved rows from advisory queue.

## Step 3 — Verification

- grep -n "plausibility_check?\.verdict" packages/duel-backend/src/cron/tournaments.ts
  → expect zero hits in flag-decision path. (May still exist in legacy
  comment paths or non-decision reads — verify each remaining hit.)
- Integration test: synthetic flow — Haiku marks a duel implausible, runs
  settle cron, verify NO flagScore tx fires from Haiku verdict alone.
- Same with formula marking it implausible → flagScore fires (redundant
  safety net path).
- Disclosure verification: re-read supplement v1.4 §3.13 disclosure
  paragraph. After this sub-sprint, that paragraph is TRUE — confirm no
  in-code path violates it.

## Step 4 — Commit, push, PR. Stop.

This is the Option F realization PR. Audit firm packet disclosure becomes
truthful here. Coordinate merge with founder.
```

---

## 7. Sequencing summary

```
        ┌──────────────────┐
        │  X20.0a moves    │  plumbing prerequisite
        │  instrumentation │  (open Q §5.4 default: split)
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │  X20.0b formula  │  pure function
        │  implementation  │  (open Q §5.2 default: hybrid bootstrap)
        └────────┬─────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
   ┌─────────┐      ┌──────────┐
   │ X20.1   │      │ X20.3    │  independent, parallel-able
   │ Solo    │      │ Circuit- │
   │ enforce │      │ breaker  │
   └────┬────┘      └─────┬────┘
        │                 │
        │  ┌──────────────┘  (X20.2 ONLY if open Q §5.1 = (b))
        │  ▼
        │  ┌─────────────┐
        │  │ X20.2 F1    │
        │  │ Confidence  │  defensive scaffolding (throwaway after X20.4)
        │  └──────┬──────┘
        │         │
        ▼         ▼
   ┌──────────────────────┐
   │ X20.4 Option F       │  TARGET ARCHITECTURE
   │ migration (advisory) │  audit packet truthful after this lands
   └──────────────────────┘
```

Parallel-able with: X14 (class enforcement), X11 (v2.2 contract). Not parallel-able with itself (intra-X20 dependencies are real per the DAG above).

---

## 8. Out of scope for X20

- **X14 class enforcement** (separate sprint per supplement v1.4 §3.13)
- **X20.5 forensic columns** (post-mainnet, Phase 3+)
- **X20.6 anomaly alerting / op-level monitoring** (post-mainnet, Phase 3+)
- **Admin UI surface for advisory queue** (post-mainnet — X20.4 ships table + POST endpoint, no UI)
- **Smart-contract changes** — X20 is backend + DB only; `flagScore` ABI unchanged

---

## 9. Constraints checklist

- [x] No implementation code in this pass
- [x] Option F architectural lock binding — no alternatives proposed
- [x] T5-3 verification baseline cited (`docs/audit-prep/t5-3-anticheat-verification.md`)
- [x] Supplement v1.4 §3.13 invariants preserved
- [x] Domain neutrality — sub-sprints work for all 6 active games + future games
- [x] VTP pre-flight gates in every paste-ready prompt
- [x] Open questions surfaced to founder (5 questions, defaults marked revisable)
- [x] Memory entries cross-referenced (`project_phase2_mainnet_blocker_plausibility`)
- [x] Effort estimates calibrated 2-3× per founder pattern
- [x] No production code touched in this worktree

---

## 10. Cross-references

- Source verification: `docs/audit-prep/t5-3-anticheat-verification.md` (verdict (a) Haiku-direct CONFIRMED, 2026-05-17)
- Architecture lock: `docs/architecture/supplements/architecture-doc-supplement-v1.4.md` §3.13
- Phase 2 transition framing: same supplement §3.12
- VTP discipline methodology: same supplement §3.14
- Related sprint queue: X10b, X11, X14, X15, X15.5, X16, X17, X18, X19, X20 (supplement §4)
- Memory: `project_phase2_mainnet_blocker_plausibility.md` (`/v1/scores` plausibility hole — solved at the agent route level by X20.0 + class enforcement)
