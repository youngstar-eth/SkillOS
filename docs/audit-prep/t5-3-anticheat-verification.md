# Sprint UR Pass 1 / T5-3 — AntiCheat Trust-Boundary Verification

**Branch:** `ur/t5-3-anticheat-verify`
**Date:** 2026-05-17
**Scope:** Verify the PR #104 Track C T5-3 claim that Haiku AntiCheat verdict directly triggers on-chain `flagScore` writes with no deterministic plausibility gate.
**Method:** Read-only audit — no code changes.
**Inputs read:** PR #104 (`docs/audit-prep/ai-features-trust-boundaries.md` §T5-3, `frontend-findings.md` shortlist).
**Track B cross-reference:** *Not yet published.* No `docs/audit-prep/offchain-trust-boundaries.md` exists on any branch as of audit. Backend write-path coverage is therefore inferred from `cron/tournaments.ts` + `api/tournaments/submit.ts` + `handlers.ts` directly. If/when Track B lands, the verdict here should be re-checked against its independent write-path map.

---

## TL;DR

**Verdict (a) — Haiku-direct.** The Haiku AntiCheat verdict is the SOLE input to the on-chain `flagScore` write. There is no deterministic formula-plausibility check anywhere alongside Haiku. The only deterministic checks are HARD BOUNDS at submit-time (`score ∈ (0, 50_000)` integer for duel + play-window) that gate submission itself — once a duel passes these and settles, the flagScore path reads only `plausibility_check.verdict === 'implausible'`. No confidence field is read, no second-source plausibility runs, no human-in-the-loop. Track C T5-3 finding is confirmed.

**`bias-toward-plausible` mechanism** covers the *infrastructure-failure* axis (Haiku timeout, SDK error, JSON parse failure, DB write failure → default to "plausible") but does NOT cover the *regression* axis (Haiku starts emitting false-positive `implausible` for benign matches — propagates to `flagScore` unattenuated).

**Migration path (option F):** Yes, the original T5-3 fix list (confidence gate, circuit-breaker, queue-to-review) is still warranted. Scope below in §"Recommendation".

---

## 1. `flagScore` call-site inventory

### Sources of the symbol (excluding tests)

| File:Line | Caller | Kind | Notes |
|---|---|---|---|
| `contracts/src/TournamentPool.sol:546` | `function flagScore(bytes32 id, address player) external onlyOwner` | on-chain definition | Sets `excluded[id][player] = true`; only the owner (backend wallet) can call. |
| `contracts/src/TournamentPool.sol:223` | comment on `excluded` mapping | doc | "set by flagScore before settle". |
| `contracts/audit-sources/TournamentPool.v21.sol:447` | mirror of canonical (audit copy) | duplicate | Same signature, same modifier. |
| `packages/contracts/src/abi.ts:190` | ABI export | static | `flagScore` entry consumed by backend `writeContract` calls. |
| `apps/api/src/lib/contracts-vendored/abi.ts:190` | vendored ABI copy (apps/api) | static | apps/api never calls `flagScore` (see §2 dead-end). |
| `packages/duel-backend/src/cron/tournaments.ts:925` | **`writeContract({ functionName: "flagScore", args: [onChainId, player] })`** | **on-chain WRITE** | **SOLE backend caller.** Inside `runSettleTournaments` (cron). |
| `packages/duel-backend/src/cron/tournaments.ts:937` | `throw new Error(`flagScore(...) failed: ...`)` | error rethrow | Failure path of the same write. |
| `packages/duel-backend/src/cron/tournaments.ts:960` | comment | doc | References the flagScore nonce pattern. |

`apps/api` (T0-tier `/v1/scores` agent route) imports the ABI but **never invokes `flagScore`**. The route signs+broadcasts `submitSoloScore` only; plausibility validation is intentionally absent (see `apps/api/src/routes/scores.ts:140-193`, T1+ returns 501). So agent submissions never reach a `plausibility_check` write and never trigger the cron's flagScore branch (their entries have `source_duel_ids: []`).

**Net:** there is exactly **one** code path in the monorepo that writes `flagScore` on-chain — `cron/tournaments.ts:892-944`.

### Upstream of the sole call site (`cron/tournaments.ts:892-944`)

```text
runSettleTournaments() — Vercel cron, every ~N minutes
  └─ for each tournament whose ends_at < now AND settled_at IS NULL:
       └─ readChallengeGuard() — on-chain "still pending?" multicall (passes if not yet settled on-chain)
       └─ supabase.from("v2_tournament_entries") — load all entries for this tournament
       └─ build allDuelIds = ∪ entries.source_duel_ids
       └─ supabase.from("v2_duels").select("id, plausibility_check").in("id", allDuelIds)
       └─ implausibleDuels = { row.id | row.plausibility_check.verdict === 'implausible' }   ← cron/tournaments.ts:902
       └─ for each entry not already excluded:
            └─ if any of entry.source_duel_ids ∈ implausibleDuels:
                 └─ writeContract({ functionName: "flagScore", args: [onChainId, player] })   ← cron/tournaments.ts:925
                 └─ waitForTransactionReceipt
                 └─ supabase.update({ excluded: true, excluded_reason: 'anticheat_implausible' })
       └─ build ranking from non-excluded entries
       └─ writeContract({ functionName: "settle", args: [onChainId, ranking] })
```

No other reader of the `verdict` field controls an on-chain write. `submit.ts:265-272` consults `verdict === 'implausible'` only to **block** a duel-to-tournament submission (HTTP 400 response, no chain side effect). `sp/award.ts` consults verdict for the SP multiplier (DB writes only).

---

## 2. Haiku AntiCheat verdict propagation (ASCII flow)

```text
            ┌──────────────────────────────────────────────────────────┐
            │ DUEL HAPPY PATH (settle.ts:221-348)                       │
            │                                                          │
            │  POST /api/duel/submit                                    │
            │    ├─ handlers.ts:385-394                                 │
            │    │   ❶ integer check                                    │
            │    │   ❷ score ∈ (0, 50_000)  ← HARD BOUND                 │
            │    │   ❸ score ≤ SCORE_MAX else HTTP 400 "implausible_score"│
            │    ├─ handlers.ts:417 play_window + grace check (HTTP 409) │
            │    └─ CAS write playerN_score, status flip                 │
            │                                                          │
            │  triggerSettle(matchId, { gameType })  ← settle.ts:221    │
            │    ├─ on-chain settle (ChallengeEscrow)                   │
            │    ├─ DB update settle_tx_hash                            │
            │    └─ firePlausibilityCheckAsync({ duelId, gameType,      │
            │         winnerScore, loserScore, durationSeconds })       │
            │             ↓                                             │
            │      (settle.ts:136-217 — fire-and-forget via waitUntil)  │
            └──────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
                       checkPlausibility(...)
                       (ai-coach/anticheat/generate.ts:136-164)
                                   │
                       Anthropic API call (Haiku 4.5, T=0.1)
                                   │
                  ┌────────────────┴────────────────┐
                  ▼                                  ▼
          parse JSON succeeds              parse JSON fails / Haiku error / timeout
          (verdict, confidence,            ↓
           reasoning, flags)               plausibleFallback() / .catch → "plausible"
                  │                        (generate.ts:120-130, settle.ts:186-192)
                  ▼                                  │
                  └──────────────┬───────────────────┘
                                 ▼
              supabase.update v2_duels.plausibility_check = result
              (settle.ts:177-180 — DB write fail → console.warn, swallow)
                                 │
                                 ▼
                        ──── time passes ────
                                 │
                                 ▼
              SP multiplier path (await applySPAward, settle.ts:196-211)
              uses .verdict at THAT moment for the duel-win/loss event

                                 │
                                 ▼ (later, separate process)
                       ┌──────────────────────────────┐
                       │ runSettleTournaments() cron  │
                       │ cron/tournaments.ts:887-944  │
                       │                              │
                       │ if plausibility_check        │
                       │      .verdict === 'implausible': │
                       │     ➀ flagScore() on-chain   │ ◀── ONLY on-chain consumer
                       │     ➁ entry.excluded = true   │
                       │     ➂ exclude from ranking    │
                       └──────────────────────────────┘

           ┌──────────────────────────────────────────────────────────┐
           │ SOLO PATH (tournaments/solo.ts:174-253)                   │
           │                                                          │
           │  POST /api/tournaments/[id]/solo                          │
           │    ├─ score validation: non-negative integer (no upper cap)│
           │    ├─ durationSeconds: int ∈ [0, 86_400] (client-supplied) │
           │    ├─ on-chain submitScore                                 │
           │    └─ firePlausibilityCheckAsync({ soloRunId, gameType,    │
           │         score, durationSeconds })                          │
           │             ↓                                             │
           │      writes v2_tournament_solo_runs.plausibility_check     │
           │             ↓                                             │
           │      SP multiplier only — NEVER read by cron               │
           │      (source_duel_ids stays []; flagScore branch skipped)  │
           └──────────────────────────────────────────────────────────┘
```

### Verdict-consumer matrix

| Sink | File:Line | Decision read | Authority |
|---|---|---|---|
| **On-chain `flagScore`** | `cron/tournaments.ts:902, 925` | `verdict === 'implausible'` (duel only) | **Owner-only contract write; protocol-paid gas; sets `excluded[id][player] = true`** |
| Tournament rank exclusion | `cron/tournaments.ts:912, 941` | same | DB only; downstream of flagScore in same loop |
| Duel→tournament submit block | `api/tournaments/submit.ts:265-272` | `verdict === 'implausible'` | HTTP 400 `duel_implausible`; refuses *new* submit (no chain rollback) |
| SP multiplier (duel) | `sp-engine/src/engine.ts:27-30` × `settle.ts:196-207` | verdict | `MULTIPLIER[verdict]` ∈ {1.0, 0.5, 0.0}; DB only |
| SP multiplier (solo) | `sp-engine/src/engine.ts:27-30` × `tournaments/solo.ts:229-247` | verdict | same |
| Admin queue | `api/admin/flags.ts:153-178` | `verdict ∈ {suspicious, implausible}` (default) | read-only |
| Public plausibility status | `api/plausibility.ts:48-71`, `tournaments/solo-plausibility.ts:46-66` | masked verdict only | read-only |

The `confidence` field is **read by no consumer that controls a write decision.** It is only persisted (jsonb in `plausibility_check`) and surfaced to admin queries.

---

## 3. Formula-plausibility check location + order-of-operations

### Search performed

```text
grep -iE 'plausibilit|minMoves|maxScore|reactionTime|serverPlausibility|formulaCheck|minDuration|score.*duration.*ratio|physics|tooFast|too_fast|ratio'
  packages/duel-backend/src/  packages/ai-coach/src/  packages/sp-engine/src/
```

No deterministic formula relating `score × duration_seconds × move_count` to a plausibility band exists in the backend. The only hits for "plausibility/implausible" are:
- the AI verdict pipeline (`packages/ai-coach/src/anticheat/...`),
- read-only consumers (admin queue, public masked endpoint),
- the lone hard-bound check `score ∈ (0, 50_000)` whose error code is `"implausible_score"` (`handlers.ts:343-394`) — this is an integer range check, **not** a formula.

### What deterministic gates actually exist (and where)

| Gate | File:Line | Behavior | When it runs |
|---|---|---|---|
| Duel submit: score integer | `handlers.ts:385-387` | `typeof score === 'number' && Number.isInteger(score)` else HTTP 400 | **BEFORE settle** — at the public submit handler |
| Duel submit: score range | `handlers.ts:388-394` | `score ∈ (0, 50_000)` strict else HTTP 400 `"implausible_score"` | **BEFORE settle** |
| Duel submit: play window | `handlers.ts:417` | `elapsed ≤ PLAY_WINDOW_MS + SUBMIT_GRACE_MS` else HTTP 409 | **BEFORE settle** |
| Solo submit: score | `tournaments/solo.ts:292-305` | non-negative integer (no upper cap) | **BEFORE on-chain submitScore** |
| Solo submit: durationSeconds | `tournaments/solo.ts:320-336` | non-negative integer ≤ 86_400 (client-supplied) | **BEFORE on-chain submitScore** |
| Duel→tournament submit: verdict gate | `tournaments/submit.ts:265-272` | `verdict !== 'implausible'` else HTTP 400 `"duel_implausible"` | After duel settled + Haiku ran |

### Order of operations relative to Haiku

```text
T0  client POST /api/duel/submit
T1  handlers.ts deterministic gates: integer + range + play_window  ──┐
T2     ↓ (pass: write score, flip status)                              │ All deterministic
T3  triggerSettle: on-chain settle, DB settle_tx_hash                  │ checks here.
T4  firePlausibilityCheckAsync queued via waitUntil                    │ Haiku has not
T5  HTTP response sent to client                                       │ run yet.
                                                                       │
T6   ────────  Haiku call (post-response, fire-and-forget) ──────────────  ←  AI runs ALONE
T7  verdict written to plausibility_check
T8  SP multiplier applied
                                                                       │
T9   ────────  Cron firing minutes-to-hours later ──────────────────────
T10 cron reads plausibility_check.verdict === 'implausible'            ←  No formula check
T11   ↓ (true) → flagScore on-chain                                       runs alongside.
T12   ↓ → entry.excluded = true, excluded from ranking
T13 settle ranking on-chain
```

**Critical observation:** the deterministic gates at T1 run **BEFORE** Haiku and are intentionally crude (integer + range + window). They cannot be considered a "formula plausibility check that runs alongside Haiku" — they are submission filters, and once a submission slips past them (e.g. `score=49_999, durationSeconds=2`), the only thing standing between the duel and an on-chain prize payout is the Haiku verdict. There is no "T11.5 deterministic re-check" before flagScore.

---

## 4. Intent-vs-code questions

### Q1 — submission passes formula plausibility but Haiku flags it → does on-chain `flagScore` fire?

**Trivially YES, because no formula plausibility check exists.** Restating the question against the actual code: "if a submission passes the deterministic bound check at submit-time and Haiku later flags it as implausible, does `flagScore` fire?"

**Answer: YES, unconditionally.**

- Evidence: `cron/tournaments.ts:900-902` reads `verdict`, `cron/tournaments.ts:922-930` writes `flagScore` whenever `verdict === 'implausible'`. There is no `confidence >= X` check, no second-pass plausibility, no human-review queue.
- Worked example: a duel with `winnerScore = 49_999, durationSeconds = 2` passes `handlers.ts:388-394` (in-range integer) AND `handlers.ts:417` (within play window). The duel settles. Haiku is asked "is 49_999 in 2 seconds plausible for game X?" — at T=0.1 it almost certainly answers `implausible`. The next cron tick fires `flagScore(onChainId, player)` on-chain. Player excluded; protocol pays gas.
- The same applies in reverse for a HAIKU REGRESSION that emits `implausible` for benign matches — those flagScore writes fire just as readily.

### Q2 — submission fails formula plausibility but Haiku says clean → does on-chain `flagScore` fire?

**Answer: NO, but for a degenerate reason — submission never reaches Haiku.**

- Evidence: the deterministic gates (`handlers.ts:343-394`, `handlers.ts:417`) reject the submission with HTTP 400 BEFORE settle. Without settle there is no `firePlausibilityCheckAsync`, no `plausibility_check` row, no `source_duel_ids` join match, and the cron branch is never entered for that match.
- This is not "Haiku gets overruled by deterministic logic" — it is "Haiku is never asked because the submission was rejected upstream."
- **Implication:** the deterministic bounds are submission filters, NOT a second authority that competes with Haiku at flagScore time. Once a submission passes these crude bounds and settles, Haiku's word is final.

### Q3 — any code path where Haiku is the sole gate to `flagScore`?

**Answer: YES — that is exactly the cron path.** This is the ONLY `flagScore` writer in the monorepo.

- Evidence: `packages/duel-backend/src/cron/tournaments.ts:892-944`. The only inputs to the flagScore decision are:
  - `plausibility_check.verdict === 'implausible'` (Haiku output),
  - membership of the duel id in `source_duel_ids` for that entry,
  - `entry.excluded === false` (don't re-flag).
  No confidence threshold. No per-tournament rate limit. No alerting. No queue-to-review.

---

## 5. `bias-toward-plausible` mechanism — actual code

Track C's "bias-toward-plausible covers false-negative axis" is implemented at **three** layers. Documented below with file:line.

### Layer A — Haiku response parse failure
**Where:** `packages/ai-coach/src/anticheat/generate.ts:120-130, 156`
```text
parseAnticheatJson(text) ?? plausibleFallback()
plausibleFallback() returns {
  verdict:   "plausible",
  confidence: 0.3,
  reasoning: "Model response could not be parsed; defaulting to plausible per bias rule.",
  flags:     ["parse-failure"],
}
```
**Triggered by:** malformed JSON, JSON without `verdict`, JSON with non-string `reasoning`, JSON with unknown verdict enum value, JSON with empty `reasoning`. Reason: a corrupt model output should never be treated as accusatory; "verdict NULL → optimistic" contract.

### Layer B — Haiku call failure / timeout
**Where:** `packages/duel-backend/src/settle.ts:186-192` and `packages/duel-backend/src/api/tournaments/solo.ts:225-228`
```text
.catch((err): Verdict => {
  console.warn("[anticheat] check failed", input.duelId, err);
  return "plausible";
})
```
**Triggered by:** Anthropic SDK throw, network failure, 10s timeout (`PLAUSIBILITY_TIMEOUT_MS`). The return value here is the SP multiplier verdict only — the `plausibility_check` column stays NULL because the success-arm DB write at `settle.ts:177-180` never ran.

### Layer C — `plausibility_check` column is NULL
**Where:** `packages/duel-backend/src/cron/tournaments.ts:899-905`
```text
for (const row of dRows ?? []) {
  const verdict = (row as { plausibility_check: { verdict?: string } | null })
    .plausibility_check?.verdict;
  if (verdict === "implausible") {
    implausibleDuels.add((row as { id: string }).id);
  }
}
```
The optional chain `plausibility_check?.verdict` makes NULL safely fall through; only `'implausible'` flags. So if Layer A or B left the column null/missing, the cron treats it the same as `'plausible'` for flagScore-decision purposes. Note: this is *not* a fourth bias-rule, it is the natural consequence of the strict equality check.

### What the bias-toward-plausible does NOT cover (false-positive axis)

| Failure mode | Default → | Covered? |
|---|---|---|
| Haiku timeout | "plausible" (Layer B) | ✅ |
| Haiku network error / 5xx | "plausible" (Layer B) | ✅ |
| Anthropic SDK exception | "plausible" (Layer B) | ✅ |
| JSON parse failure | "plausible" + flag `parse-failure` (Layer A) | ✅ |
| DB write to `plausibility_check` fails | column stays NULL → "plausible" effective (Layer C) | ✅ |
| **Haiku regression emits `implausible` for benign matches** | **"implausible" propagates unattenuated to `flagScore`** | ❌ |
| **Prompt-injection lifting verdict to `implausible`** | **"implausible" propagates unattenuated to `flagScore`** | ❌ |
| **New prompt-version emits noisy false positives at deploy** | **"implausible" propagates unattenuated to `flagScore`** | ❌ |

The bias-toward-plausible exists to protect legitimate players from being silently flagged by infrastructure outages. It does NOT protect anyone from a Haiku that confidently emits `implausible` (correctly OR incorrectly).

---

## 6. Intent-vs-code gap verdict: **(a) Haiku-direct**

| Option | Holds? | Rationale |
|---|---|---|
| **(a) Haiku-direct** | **✅ yes** | Single on-chain `flagScore` writer (`cron/tournaments.ts:925`) consumes only `verdict === 'implausible'`. No `confidence` read, no formula re-check, no human gate. |
| (b) Formula primary | ❌ no | No formula plausibility exists. The deterministic bounds at submit (`handlers.ts:388-394`, `:417`) are crude integer/range/window filters and run BEFORE Haiku; they cannot overrule Haiku at the flagScore decision. |
| (c) Hybrid | ❌ no | Would require the cron to AND a deterministic signal with the verdict at flagScore time — not present. |
| (d) Other | ❌ no | All other write-decision paths consult only `verdict` (`submit.ts:265-272` for HTTP gate; `sp/award.ts` for multiplier). None upgrades or downgrades the gate. |

Track C T5-3 finding is **VERIFIED**: "LLM verdict drives on-chain `flagScore` write + tournament exclusion with no confidence threshold, no human review, no circuit-breaker." The exact line is `cron/tournaments.ts:925` reading the column populated by `settle.ts:177-180` whose value originated from `ai-coach/anticheat/generate.ts:142-148`.

### Additional gaps surfaced during verification (out of T5-3 scope, log for sprint backlog)

1. **Solo runs bypass on-chain flagScore entirely.** `v2_tournament_solo_runs.plausibility_check` is written (`tournaments/solo.ts:212-215`) but the cron's flagScore branch only joins on `source_duel_ids` (`cron/tournaments.ts:889, 912`) which contains **duel ids only** (see `tournaments/solo.ts:540-542` — `source_duel_ids` preserved across solo submits, never appended). Solo tournament entries have empty `source_duel_ids` and never trigger `flagScore` regardless of Haiku verdict. Solo verdict is consumed only by the SP multiplier (DB) — not by the on-chain exclusion path.
2. **Solo score has no upper bound, duel has `(0, 50_000)`.** `tournaments/solo.ts:292-305` accepts any non-negative integer; `handlers.ts:388-394` caps duel at `< 50_000`. Same on-chain `submitScore` is downstream of both. A cheater with `score = 2_147_483_647` for solo would pass the deterministic bound; only Haiku verdict bands it.
3. **No retry/idempotency on the `cron` flagScore tx itself.** Lines 916-944 do flagScore on-chain → wait receipt → DB exclude. If the DB update fails after a successful flagScore tx, the entry is on-chain excluded but ranked normally in-memory until the next cron tick. Likely benign because settle is the next statement and re-reads via `entries.filter((e) => !e.excluded)` from the local in-memory `e.excluded = true` mutation at line 943, but worth noting.

---

## 7. Recommendation — T5-3 option F migration path

**Current implementation matches Track C's stated intent (Haiku-direct), but the intent itself is the security hazard.** No code change is needed to *make code match intent*; the change needed is to *update intent* so a Haiku regression or prompt-injection cannot one-shot the protocol wallet into excluding legitimate players from prizes.

### Recommended migration (option F — gated + queued + alerted)

Phase F1 — **confidence threshold** (minimal change):
- Promote `plausibility_check.verdict === 'implausible'` test in `cron/tournaments.ts:902` to:
  ```ts
  if (verdict === "implausible" && confidence >= 0.7) { ... }  // threshold TBD per game
  ```
- Sub-threshold rows flow to admin queue for manual `flagScore` (admin endpoint already exists at `api/admin/flags.ts`, currently read-only — would need a POST companion).
- Cost: ~10 LoC + threshold tuning per game type.

Phase F2 — **per-tournament max-flag rate-limit circuit-breaker:**
- If `toFlag.length / entries.length > 0.2` for a single tournament, abort the flag loop, write all rows to admin-review table, alert.
- Catches Haiku regressions and prompt-injection-storms before they burn the protocol wallet.
- Cost: ~20 LoC + new admin review table migration.

Phase F3 — **forensic reproducibility** (depends on T5-1 fix):
- Adopt the T5-1 fix (`prompt_version`, `raw_response`, `prompt_inputs` columns on `plausibility_check`) so any flagScore decision can be re-evaluated post-hoc.
- Cost: one migration + ~20 LoC plumbing through `checkPlausibility`.

Phase F4 — **alerting on daily flag-count anomaly:**
- Cron emits `flagScoreDailyCount` metric; alert when > p99 historical.
- Cost: existing monitoring plumbing.

**Sequencing:** F1 + F2 are pre-mainnet blockers (per Track C T5-3 severity). F3 + F4 can land in the first sprint after mainnet. The current implementation should NOT be left as-is when mainnet routes real-USDC prizes through this path.

### What does NOT need changing

- The `bias-toward-plausible` mechanism (Layers A/B/C in §5) is sound for its stated scope (infrastructure failure → optimistic). Leave it.
- The duel-side deterministic gates at `handlers.ts:343-394` and `:417` are reasonable submission filters. Leave them.
- The `submit.ts:265-272` HTTP gate is a refuse-future-submission only (no chain side effect); even on a Haiku false positive the player keeps their duel prize. Leave it.

---

## 8. Key files referenced

- `packages/duel-backend/src/cron/tournaments.ts` (892-944) — sole on-chain `flagScore` writer
- `packages/duel-backend/src/settle.ts` (114-217, 320-345, 463-489) — `firePlausibilityCheckAsync` + bias-toward-plausible catch
- `packages/duel-backend/src/api/tournaments/solo.ts` (146-253, 292-336) — solo plausibility hook + solo bounds
- `packages/duel-backend/src/api/tournaments/submit.ts` (265-272) — HTTP-only verdict gate (no chain effect)
- `packages/duel-backend/src/handlers.ts` (341-423) — deterministic submission bounds
- `packages/ai-coach/src/anticheat/generate.ts` (70-164) — Haiku call, parse, fallback
- `packages/ai-coach/src/models.ts` (27-28) — `ANTICHEAT_MODEL = "claude-haiku-4-5"`
- `packages/sp-engine/src/engine.ts` (24-31) — verdict → multiplier (DB only)
- `packages/contracts/src/abi.ts` (190) — `flagScore` ABI entry
- `contracts/src/TournamentPool.sol` (546) — on-chain `flagScore` definition
- `apps/api/src/routes/scores.ts` (125-193) — confirms agent path bypasses plausibility entirely
