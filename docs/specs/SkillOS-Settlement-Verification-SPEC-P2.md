# SkillOS — Settlement & Verification Architecture SPEC (Phase 2)

> **Status:** Decisions LOCKED (2026-05-28). All 5 seam decisions resolved. Open items in §7 are design work (not lock-blockers). Crystallizes the Δ1↔Δ6/Δ11 boundary.
> **Canonical (pattern-lock ε):** build sprints derive from THIS, not from stale snippets. Pairs with Strategic Memory v1.12 (§3 verification fork, §4 invariant) + the P2M-0 gap-matrix.
> **Grounded in recon:** deterministic-replay is currently ASSUMED-not-built; on-chain trust = server EIP-712 today. This SPEC defines the architecture that makes the v1.12 trustless thesis real.

---

## 1. Purpose & scope

Defines the **3-layer architecture** that unifies how every arena's result becomes trustless, for both verification families. Governs the boundary between the Arena config object (Δ1), the settlement/dispute layer (shared, net-new), and the adjudicators (Δ6 replay, Δ11 staked-resolution). Folds in Δ5 (AntiCheat removal = settle rework).

**Child SPECs deriving from this:** Arena config struct field detail (Δ1), per-game replay engines (Δ6), staked-resolution dispute mechanics (Δ11).

---

## 2. The three layers

```
Δ1  ARENA CONFIG (declarative)
    8-dim schema. Owns: verification-family enum (REPLAY | STAKED),
    data-tier requirement, seed-commitment ref, resolution policy.
    Validity rule: REPLAY ⇒ data-tier ≥ T2 (input log required).
    Does NOT verify — declares how the arena will be verified.
        │  interface ↓  config → settlement: {family, dataTier, seedCommit, resolutionPolicy}
        ▼
SHARED  SETTLEMENT / DISPUTE LAYER (net-new, game-agnostic)
    claim → challenge window → finalize → credit SP.
    On-chain TRUST decision lives here (optimistic model, §3).
    Δ5 lives here: removing flagScore/excluded + adding verified-set
    is the SAME settle rework.
        │  adjudicator interface ↓  verify(claim)→valid|invalid  /  resolve(claim)→outcome
        ▼
Δ6 REPLAY ENGINE (impl)            Δ11 STAKED-RESOLUTION (impl)
    pure fn verify(seed,inputLog)      resolver / market / dispute
    → score. 6 games. Stateless.       (judgment skills). §12 frontier.
    Used by settlement to verify        Other adjudicator behind the
    + by challenger to fraud-prove.     same settlement layer.
```

**Convergence (the key cut):** REPLAY and STAKED share ONE settlement/dispute layer — *claim → challenge window → adjudicate*. They differ only in the **adjudication function** (replay re-execution vs resolver/market). Design the dispute layer once; plug both in. Polymarket-pattern and replay-pattern meet here.

---

## 3. Trust model — OPTIMISTIC + CHALLENGE (locked keystone)

A submitted result is **claimed**, not blindly trusted, and not (usually) re-executed on-chain.

1. **Claim:** participant submits {score, seed-ref, inputLog-hash (anchored on-chain), inputLog (off-chain)}. Signed.
2. **Challenge window:** a finalization delay during which anyone can dispute.
   - **REPLAY family:** challenger re-runs `verify(seed, inputLog)`; if the recomputed score ≠ claimed, submits a **fraud proof** → claim slashed/rejected.
   - **STAKED family:** challenger stakes a bond → dispute escalation (resolver/market re-adjudicates).
3. **Finalize:** unchallenged (or challenge-defeated) claims finalize → SP credited, prize eligible.

**Why optimistic:** on-chain replay of a non-trivial game (e.g. 2048) is gas-prohibitive (rules out pure on-chain verify); blind server-signature isn't trustless. Optimistic = gas-feasible + trustless-via-challenge (anyone can re-run and challenge), and it **unifies with staked-resolution's dispute mechanics**.

**Trust property (honest):** trustless = *anyone can challenge with a replay/dispute*, not *every result is re-executed*. Same trust model as optimistic rollups. This is the defensible "results no party needs to trust" — verifiable by challenge, not by faith in the operator.

---

## 4. Seam decisions

| # | Seam | Decision | Status |
|---|---|---|---|
| 1 | Trust model | **Optimistic + challenge** (§3) | ✅ LOCKED |
| 2 | Seed commitment | **Commit-reveal, tournament-level equalized seed:** commit `hash(seed)` on-chain at arena creation, reveal at start; everyone plays the same revealed seed; replay uses it. Prevents pre-computation + guarantees equalization (skill-purity). *Per-arena option:* open-seed (no commit-reveal) for skills where pre-compute isn't a concern. | ✅ LOCKED |
| 3 | Verify call site | **Settle finalize + challenge window.** Folds Δ5: remove `excluded[]`/`_countNonExcluded`, replace with verified/finalized-set. One settle rework. | ✅ (follows from #1) |
| 4 | Storage | inputLog + per-move state hashes **off-chain (Supabase)** + **on-chain hash anchor** (commit). Seeds already in DB (`v2_duels.seed`, `duel_runs.seed`, `solo_runs.game_state_hash` reserved). | ✅ |
| 5 | Engine ownership | Δ6 = **6 pure verifier fns** `verify(seed,inputLog)→score`; settlement calls them through a generic adjudicator interface (game-agnostic). | ✅ |

---

## 5. Δ5 entanglement (recon-confirmed)

AntiCheat removal is NOT a clean delete — `flagScore`/`excluded`/`ScoreFlagged` is **load-bearing in `settle()`** via `_countNonExcluded`. Therefore:

- **Δ5 (remove heuristic) + Δ6 (add replay verification) = the same `settle()` rework**, executed once: strip the exclusion machinery, install the optimistic verified-set + challenge-window finalization.
- Off-chain: delete `packages/anti-cheat`, the `evaluateF0Gate` call site (`solo.ts:436`), the fire-and-forget Haiku auditor, the `flagScore` cron.
- **Do NOT delete the heuristic before the replay verifier exists** (Δ6 gates Δ5) — but since they're one settle rework, they ship together, not as separate sprints.

---

## 6. Build sequencing (implied by this SPEC + recon dependency chain)

1. **Foundation — parallel:**
   - **Δ1 Arena config object** (struct + migration + Zod + SDK regen) — structural spine; gates v2.2→v2.3 redeploy.
   - **Δ6 replay engine** (6 pure verifier fns) — verification substance; net-new; highest risk.
2. **Settlement layer** (optimistic + challenge + verified-set) — consumes Δ1 config + Δ6 verifier interface; **carries the Δ5 settle rework**. Requires the v2.3 redeploy (Δ1).
3. **Δ2 bracket (PvP)** into TournamentPool (net-new; `startBracketRound` stub today) → then **Δ4 ChallengeEscrow deprecation** (live contract + 31-file footprint + settle-guard tripwire — sequence AFTER bracket replacement exists).
4. **Δ7 ArenaCreator** rename + fee-split (coordinate with v2.3 redeploy).
5. **Δ8 data-marketplace** (real source; depends Δ6 for match-replay) · **Δ9 data-sovereignty/RLS** · **Δ11 staked-resolution** (frontier; plugs into the §3 dispute layer) — comparatively isolated/additive, parallelizable.

> Discipline: every contract-touching sprint = HIGH dispatch-safety → stage-split workflow chain + founder sign-off between stages (workflows don't hold gates). Δ1/Δ6/settlement touch deployed bytecode + settle path.

---

## 7. Open items (founder + design)

- **#2 seed-commitment** — ✅ RESOLVED: commit-reveal equalized seed default + per-arena open-seed option.
- **Challenge-window economics** — bond size, window length, successful-challenge reward. **Shares parameters with Δ11 staked-resolution stake/dispute design** (one economic mechanism for both families — the §12 frontier). Biggest open economic design.
- **Per-game replay engines** — 5 net-new beyond 2048 (wordle/sudoku/minesweeper/clicker/match3); each = a deterministic `verify` fn + golden-test vectors.
- **On-chain anchor granularity** — inputLog-hash only, or per-move state-hash root (T3)? (cost vs fraud-proof precision.)

---

## 8. What this SPEC does NOT cover

- Arena config struct field-level types/enums → **Δ1 child SPEC.**
- Per-game replay engine internals + golden vectors → **Δ6 child SPEC.**
- Staked-resolution resolver/market/dispute full mechanics → **Δ11 child SPEC** (§12 frontier; but its dispute economics must reconcile with §3 challenge economics — design together).
