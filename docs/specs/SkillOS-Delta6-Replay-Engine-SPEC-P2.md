# SkillOS — Δ6 Deterministic-Replay Engine SPEC (Phase 2)

> **Status:** Draft for founder lock. **Child of** Settlement & Verification SPEC (Δ6 adjudicator).
> **Grounded in:** P2M-0 gap-matrix — replay is **ASSUMED, not built**: only `apps/api/src/lib/duel/game-2048.ts` exists (self-labeled "post-Phase-2"), consumed only by `runner.ts` agent *simulation*, **no verification call site**; 5 games have no engine; `/v1/data/match-replay` returns `sampleData:true` stubs. This is the biggest net-new surface + gates Δ5.
> **VTP:** each engine's rules MUST be derived from the LIVE game implementation (games-launcher / frontend), not assumed. Read the real game, then write the verifier.

---

## 1. Core contract

```
verify(seed, inputLog) → { score, valid }
```
- **Pure + deterministic:** same (seed, inputLog) → same result, always. No wall-clock, no `Math.random`, no nondeterministic iteration order, no floating-point where integer math suffices.
- **Seed-equalized:** consumes the committed tournament seed (Settlement SPEC seam #2 commit-reveal). The RNG sequence + consumption order MUST match the live game exactly.
- **Stateless:** called by (a) the settlement layer at challenge/finalize, (b) any challenger building a fraud proof, (c) the real `/v1/data/match-replay` implementation.

---

## 2. Adjudicator interface (game-agnostic)

Settlement layer calls replay through a registry keyed by `gameId` — it never knows game internals:

```
registry[gameId].verify(seed, inputLog) → { score, valid }
```
Adding a game = registering a new engine; settlement code unchanged. (Mirrors the §pluggable-adjudicator cut.)

---

## 3. Per-game scope (6)

| Game | State | Work |
|---|---|---|
| 2048 | scaffold exists (`game-2048.ts`, "post-Phase-2") | **promote to first-class + validate determinism + wire verification call site** (it is NOT verified today) |
| wordle | none | net-new engine |
| sudoku | none | net-new engine |
| minesweeper | none | net-new engine |
| clicker | none | net-new engine |
| match3 | none | net-new engine |

5 net-new + 1 promote/validate.

---

## 4. Golden vectors (the correctness spec)

Each engine ships a committed set of `(seed, inputLog, expectedScore)` fixtures:
- Generated from the **live game** (authoritative rules), reviewed.
- Run in CI → lock determinism + catch engine drift (any rule change that moves a golden score fails the build).
- Cover edge cases: max score, early-loss, boundary moves, the `moves=null` case (recon: F0 gate has a `moves=null` bypass today — the replay engine must reject/handle null input logs explicitly, not silently pass).

**Golden vectors ARE the spec of correctness** — without them "deterministic" is unverifiable.

---

## 5. Determinism hazards (honest — flag at build)

- **Float nondeterminism** across runtimes/languages → pin to integer/fixed-point math wherever the game allows.
- **RNG consumption order** → the verifier's seed→sequence draw order must byte-match the live game's; a mismatch produces a valid-looking-but-wrong score. Golden vectors catch this only if generated from the live game.
- **2048 scaffold is unproven** → validate it against live 2048 + golden vectors before trusting; "post-Phase-2" label = treat as draft.
- **Input-log integrity** → the log is off-chain (data-tier T2+); its hash is the on-chain anchor (Settlement SPEC seam #4). Verifier checks log against the anchored hash before replaying.

---

## 6. Wiring (where it plugs — splits by dispatch-safety)

- **Engine build (per game):** isolated pure functions + golden vectors. **MED safety** — additive, parallelizable (one subagent per game). No settle/bytecode touch.
- **Verification call site:** settlement layer calls `verify` at challenge/finalize. **HIGH safety** — this is the Δ5+Δ6 shared settle rework (remove `excluded[]`/`_countNonExcluded`, install verified/finalized-set). Ships with the settlement layer, NOT in the engine sprints.
- **Data endpoint:** replace `/v1/data/match-replay` `sampleData:true` stub with real replay output (Δ8 depends on this).

---

## 7. Build sequencing + dispatch

1. **2048 validate + golden vectors** (de-risk the pattern on the existing scaffold) — MED.
2. **5 net-new engines + golden vectors** — MED, parallelizable (per-game subagents; disjoint blast radius).
3. **Verification call site** in settlement layer — HIGH, ships with Settlement build (Δ5+Δ6 rework, **stage-split + founder sign-off**).
4. **Real match-replay endpoint** — MED, after engines exist.

**Dispatch:** steps 1-2 = good dynamic-workflow candidates (parallel per-game, golden-vector CI as the adversarial check). Step 3 = HIGH, stage-split with settlement.

---

## 8. Open items

- inputLog format standardization across 6 games (shared schema vs per-game) — affects the generic adjudicator interface.
- On-chain anchor granularity: inputLog-hash only vs per-move state-hash root (T3) — cost vs fraud-proof precision (Settlement SPEC §7 open item).
- Whether verify runs server-side only (Phase 2) or also as a client/challenger-runnable lib (trust-minimization — anyone re-runs).
