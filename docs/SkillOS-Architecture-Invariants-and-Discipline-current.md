# SkillOS — Architecture Invariants & Engineering Discipline (current)

> **Status:** Canonical. **Consolidates + supersedes** the durable invariant/framework sections (§2.x + framework §3.x) of architecture-doc-supplements **v1.2–v1.7**.
> **Pairs with:** Strategic Memory v1.10 (strategy / economy / legal / positioning). This doc = **engineering discipline + architectural invariants**. v1.10 = the *what/why*; this = the *how we build without breaking things*.
> **Not carried forward:** dated sprint retrospectives (X9-X10, UR Pass 1, 21h/37h threads), shipped-tactical sections (skill-pack listing, distribution vectors), and the per-instance drift catalogs — historical, value extracted into the frameworks below.
> **v1.10 reconciliation:** notes inline where positioning or contract scope changed under the DeAI pivot.

---

## 1. Domain neutrality invariant (naming discipline)

The protocol is architecturally **domain/class-agnostic**. Primitives stay task-agnostic so future verticals need only new client adapters, never breaking schema changes.

| ✓ Use | ✗ Avoid |
|---|---|
| `submitScore` | `submitGameScore` |
| `tournament` | `gameTournament`, `match` |
| `Player` / `participant` | `Gamer` |
| `submission` | `play`, `gameRound` |
| `task definition` | `game definition` |
| `category` enum (`game`/`benchmark`/`contest`/`exam`/`task`) | hard-coded "game" assumption |

**PR review rule:** any PR introducing game-specific naming in a primitive (contract field, API endpoint, schema, SDK method, error code, OpenAPI field) needs a `Rationale:` block. Default reviewer answer = **refactor to neutral**. Game-specific naming OK only in client adapters, UI strings, existing app package names, game test fixtures.

**v1.10 reconciliation:** the naming discipline is **still binding**. What changed is the *public frame*: no longer "skill gaming category, vertical expansion internal-only." Public framing is now **DeAI capability-measurement + skill economy** (tagline *"Prove your skill to get payout!"*), and capability measurement is explicitly public. Vertical expansion *beyond* skill/capability arenas remains achievement-gated optionality (Stripe pattern — earned by execution, not announced).

---

## 2. Memory-as-spec drift invariant (3-layer + 5-layer verification chain)

**Spec assumptions (memory, prior chat, docs, agent claims) drift from reality in both directions and require cross-check before any high-stakes prompt or sprint kickoff.**

**Three drift layers:**

| Layer | Drift kind | Detection | Cost |
|---|---|---|---|
| (a) Agent/claim drift | memory/agent report vs actual code | `grep` target file | <30 sec |
| (b) Git state drift | local main vs remote vs PR merge status | `git fetch && git log --oneline origin/main \| head` | <30 sec |
| (c) Deploy runtime drift | merged commit vs deployed SHA vs prod behavior | `vercel ls \| head` + curl + chain query | 1-2 min |

**5-layer post-merge verification chain (a sprint is "shipped" only when the applicable layers verify):**

| # | Layer | Verification | Cost |
|---|---|---|---|
| (a) | Code wire | `grep -n "<pattern>" <file>` returns expected line | <30 sec |
| (b) | Git remote | `git log --oneline origin/main \| head` shows expected commit | <30 sec |
| (c) | Deploy SHA | `vercel ls` top matches main HEAD (or prebuilt runtime-behavioral verify for `apps/api`) | 1-2 min |
| (d) | Runtime | prod endpoint emits expected behavior (curl/natural traffic) | 1-5 min |
| (e) | Chain evidence | on-chain calldata/event matches expected attribution | 2-5 min (Blockscout/cast/BlockchainQuery) |

**Which layers per change:** code-only → (a)+(b); backend (API/cron/indexer) → (a)+(b)+(c); on-chain-attributable (contract deploy, settle, attribution) → all 5; spec/memory update → (a) drift-check before commit.

**Cost math:** sub-2-min pre-flight prevents 30+ min recovery; full chain 5-15 min vs 30-120 min per skipped-layer drift. Velocity-first phase tolerated skipping; **discipline-first phase mandates it.**

---

## 3. VTP (Verify-Then-Prompt) methodology

✅ **Phase 2 baseline.** Operationalizes §2 into prompt design. Every high-stakes prompt (deploy, migration, infra, multi-step ops, anything touching prod) opens with pre-flight gates.

**Prompt header template:**

```markdown
## Pre-flight verification (mandatory — before any action)
Assumptions this prompt makes:
1. [Assumption] → verify: <cheapest verify command>
2. ...
If any verification fails → STOP and surface mismatch. Do not proceed.

## Action steps (only after verifications pass)
...
```

**Three state categories:** Repo (`git`/`grep`/`find`/`ls`/`cat`) · Infra (`vercel`/`supabase`/`gh`/`curl`) · Runtime (`curl`/`vercel ls`/integration test).

**Cost calibration by stake:** read-only → light; scoped code change → code-grep; infra change → infra-introspect; migration → code-grep + infra-introspect + dry-run; prod deploy → all + curl smoke + behavioral verify.

**Gate-respect (canonical, `feedback_respect_gate_holds`):** when a paste-ready prompt hits a spec-vs-reality mismatch during pre-flight, the agent **surfaces + STOPs** rather than proceeding on assumed state. Explicit founder acknowledgment is the resume signal. This is what protects production.

**Memory hygiene:** check freshness of cited entries; flag cross-sprint citations as drift-prone; high-stakes citations carry "verify via `<command>` before relying."

---

## 4. Spec-codegen drift framework

Where §2 catches mental-model-vs-reality, §4 catches **two synchronized sources of truth diverging across parallel worktrees** (e.g. OpenAPI spec updated, but `packages/sdk/src/api.gen.ts` not regenerated → SDK consumers get stale types).

**Three detection methods:**

| # | Method | Cost | Catches |
|---|---|---|---|
| 1 | Post-merge `git status --short` on generated dirs after every spec-touching PR | <30 sec | manually surfaced drift |
| 2 | CI: regen + `git diff <generated>` — fail build if non-empty | <2 min | auto-blocks at PR open |
| 3 | Parallel-worktree round-trip discipline — gen artifacts must land back to main before "shipped" | discipline | lost work in stale worktrees |

**Generalization:** any version-controlled auto-generated material — SDK from OpenAPI, TS types from Zod/DB, ABI from Solidity, docs from JSDoc. **Two-PR pattern** (feature + codegen catch-up) is canonical.

---

## 5. Velocity scale calibration invariant

Agent-velocity ≈ **9-12× founder-velocity on mechanical / well-scoped sprints** (schema migrations, clear-spec wiring, test-green, deploy+smoke, doc-gen, pattern application from canonical examples). Scoping docs carry founder-velocity estimates by convention; **divide by ~10 for agent dispatch planning.**

**Does NOT scale (founder-velocity dominant):** strategic synthesis, architectural decisions, design-system creation, pitch/fundraising material, hardware-ceremony (multi-sig/cutover), audit-firm coordination, founder-strategic Q resolution.

**Implication:** agent-velocity collapses the engineering bottleneck. **Mainnet timeline is funding/strategy-velocity, not code-velocity** — fundraise + audit + legal are the critical path, not the build.

---

## 6. Agent delegation principle (Phase 2 loop)

✅ Framework lock: *"delegate edilebilecek tüm işleri agent'a."*

| Role | Tasks |
|---|---|
| **Founder + Claude (chat synthesis)** | strategy, pitch framing, pattern recognition, founder-Q resolution, narrative/audit posture, doc writing, cross-context synthesis, design calls, threshold choices, fundraise prep |
| **Agent — dev (Claude Code)** | codebase grep/read/analysis, git+gh ops, Supabase migrations, Vercel deploys, commit cycles, worktree mgmt, VTP pre-flight chains, post-action smoke, mechanical config/CSS, scoping recon |
| **Agent — checker (Hermes ⚕)** | on-chain reads, infra/runtime introspection, terminal-based state verification |

**Interface loop:** synthesis (chat) → Claude drafts paste-ready prompt w/ VTP gates → founder pastes to fresh agent session → agent executes, surfaces drift + STOPs if mismatch → agent reports + commits → founder forwards report → Claude synthesizes next move.

**Healthy-cycle behaviors:** (1) agent surfaces gate violations + waits for ack; (2) agent re-shapes sub-sprints when reality demands (reframe is *expected*, not error); (3) agent documents drift alongside commits.

**Anti-patterns:** founder middleman (manual dashboard/UI work → parsing bugs, wrong-target redeploys, time stolen from synthesis); Claude-chat executing ops (can't run CLI at pace — chat synthesizes + drafts + reviews); skipping pre-flight gates.

---

## 7. Architectural humility — "doğru niyet, yapısal kısıt"

When blocked, distinguish **team error** (incorrect instinct → rebuild scope) from **structural constraint** (correct instinct, blocked by upstream library/standard/ecosystem → workaround or honest disclosure).

**5-step analytical frame:** (1) articulate the gap (intended vs shipped); (2) diagnose cause (team error vs structural constraint); (3) frame response by cause type; (4) document (drift catalog / disclosure language); (5) recover dignity through transparency.

**Illustration (canonical):** Phase 1 AntiCheat formula plausibility was **design intent never built** — spec existed, implementation skipped the formula gate, Haiku-direct on-chain writes filled the gap. Diagnosis: team error (spec drift under velocity-first) compounded by structural constraint (irreversible Haiku writes were the only mechanism absent the formula gate). Response: pre-mainnet architectural rebuild. **Canonical disclosure line:** *"Phase 1 testnet AntiCheat scope was limited (solo bounds-only + Haiku-direct on-chain flagScore on duel path); formula plausibility was design intent never built; Phase 2 rebuild architectural."*

**Audit/pitch value:** *"We tried; here's why it didn't land; here's the rebuild"* > *"We hadn't gotten to it."* Transparency-first is the structural contrast to the Skillz/Papaya $420M opacity verdict — "decentralization earned, not claimed" at the operational level.

---

## 8. Class-agnostic substrate / off-chain enforcement

**Architectural lock:** fairness/class enforcement adds **no class-aware logic to contracts**. Contracts stay class-agnostic at storage + execution; class declaration, enforcement, audit trail live off-chain (API + DB + SBT).

| Layer | Class-aware? | Mechanism |
|---|---|---|
| Pool contract storage/execution | NO | struct doesn't differentiate; `submitScore` accepts any signed score |
| Tournament metadata (DB) | YES | `class_declaration`: human / agent / mixed-declared |
| API auth + submit | YES | SIWB (human) / SIWA (agent) check; mismatch → reject + dishonor flag |
| Client detection | YES | extension allowlist + AI-browser fingerprints (human-only arenas) |
| Behavioral biometrics (opt-in) | YES | tournament-scoped capture |
| Dishonor SBT (ERC-5192) | YES | separate contract, soulbound, minted on violation |

**Audit narrative:** contracts minimal + class-agnostic, enforcement auditable + class-aware, separation architectural not policy.

**v1.10 reconciliation:** maps to invariant #6 (class-agnostic substrate). Dishonor SBT now sits **alongside** the new per-axis `SkillCredentialSBT` (v1.10 §6) — distinct contracts (dishonor = penalty, SkillCredential = capability). **ChallengeEscrow sunset** under v1.10 (duel → bracket in TournamentPool); class-enforcement posture unchanged.

---

## 9. Mainnet wallet rotation + multi-sig discipline

**Binding for mainnet cutover (regardless of timing):**

1. **Zero EOA overlap** across role-distinct trust zones — deployer, Owner (multi-sig), trustedSigner, broadcasters (STUDIO + AGENT, multiple), feeVault, x402 receive — distinct addresses, no transfer history between them.
2. **Fresh fiat-onramp origin per role-distinct EOA** — no wallet-to-wallet derivation.
3. **Testnet wallets NOT mainnet-portable** — current testnet keys are history-contaminated, replaced at cutover.
4. **Legacy authorizations revoked** before mainnet redeploy (or deploy clean contracts).
5. **Pre-deploy assertion script** — `forge script` asserting `deployedAddr.trustedSigner() == manifest.trustedSigner`; manifest drift fails CI.

**Multi-sig at cutover:** Owner transitions EOA → Safe Wallet. **Single-EOA mainnet boot architecturally rejected.** Threshold = founder decision (audit firm preference: 2-of-3, hardware wallets, geo-distributed signers; 1-of-1 acceptable as transitional).

**v1.10 reconciliation:** sweepstakes wallet-topology segregation now narrows to the **sponsor-funded dimension** (v1.10 §5/§11 invariant #2) — separate fiat onramps mandatory for sponsor-pool addresses.

---

## 10. Mainnet operational pre-reqs (durable)

- **Post-merge Vercel commit verification mandatory** — `apps/api` is prebuilt-only; auto-deploy does NOT trigger on git push. After every PR touching `apps/api`, run `vercel ls | head -3` and confirm top entry == main HEAD. Without this, code merges + CI green + memory says "shipped" while prod runs an N-day-old artifact.
- **Live-tx verification on testnet before sprint close** — unit-test green ≠ live integration verified. End-to-end calldata assertion for every wire change.
- **Wallet topology hygiene at deploy time** (see §9).
- **3rd-party audit** — Trail of Bits / OpenZeppelin / Spearbit. Slot lead time 2-4 weeks, duration 4-8 weeks. **Book now for Q3 2026.**
- **Legal** — Cayman Foundation structuring (Uniswap/Optimism/Arbitrum precedent, 4-8wk); US state-risk geofence matrix; Turkish counsel reconfirmation at cutover. → details in Strategic Memory v1.10 §5 + X13 counsel.

> **Contract-scope pre-reqs** (dev-fee splitter → arena-creator, class-aware fairness, bracket, per-axis SBT, data marketplace, sweepstakes rewrite, etc.) are now defined in **Strategic Memory v1.10 §10 migration impact map** — not duplicated here to avoid drift between two "what to build" lists.

---

## 11. Engineering pattern locks (reusable canon)

**α series** (one-liners): pre-flight ±5 line-target tolerance · merge-gate stack (tsx → tsc → consumer build → CI list) · PR-count UTC-canonical · tempfile commit/PR-body pattern · ApiError-widening · post-merge 8-step.

**β — Workspace-package extensionless TS imports.** Intra-package imports must be **extensionless**; `.js` extensions pass tsx + tsc but break the first Next webpack consumer. Validate with consumer-app `build`, not just `tsx`/`tsc`/`node -e`. ESLint `import/extensions: ['error','never']`.

**γ — OpenAPI route-order (static-before-dynamic).** In `OpenAPIHono`, static-path routes must register **before** dynamic-param siblings sharing a prefix, else the radix tree swallows static traffic into `{param}` routes (silent 422). Regression-guard asserts on `error.details[].path` (not status-only).

**δ — Substring-oracle log filter.** When a log surface truncates bodies but supports `query=<term>` filtering, the filter is a substring oracle: a row appears iff the truncated body contains the term. Confirms error-class hypotheses without raw-body access (Vercel logs, GH Actions, Supabase, CloudWatch).

**ε — SPEC.md canonical SOT at impl (and dispatch).** When a sprint plan's embedded code snippet drifts from a referenced SPEC.md, **SPEC.md is canonical**; the snippet is illustrative. Agents re-derive from SPEC, not cargo-cult stale snippets. Declare SPEC-canonical in the prompt pre-flight.

**ζ — Sub-sprint critical-path sequencing.** Sub-sprints have dependency lattices, not freedom-of-order. Scoping must surface the critical path explicitly; agents enforce sequencing at dispatch (mark dispatch-safe iff upstream + external blockers cleared; parallel-safe = dispatch-safe with disjoint blast radius).

**η — Sprint-cancel-as-product.** A sprint canceled with reason captured (stash message + memory entry + scope-defer pointer) is a **shipped decision artifact**, not waste. Checklist: descriptive stash message (date+reason+carry-forward) · close PR with deferral description · memory canonical entry capturing the design · Sprint Sequence row updated CANCELED + carry-forward target.

---

## 12. Drift taxonomy (4-category)

Cluster drifts by the source-of-truth boundary crossed:

1. **Claim drift** — agent/chat claim ≠ reality at claim time (incl. stale doc claims).
2. **State drift** — local file / git / deploy runtime ≠ assumed state at action time.
3. **Spec drift** — SOT document (SPEC.md / schema / OpenAPI) ↔ generated artifact or implementation.
4. **Scope/premise drift** — sprint scope or hypothesis premise ≠ actual scope/correct premise at impl time.

**Operating insights (from the documented windows):**
- **Multi-surface triangulation:** decisions touching production state need **≥2 verification surfaces** — a meaningful fraction of drifts were only caught (or correctly framed) because two surfaces disagreed. Single-surface detection misframes.
- **Pre-impl catch rate climbs** as pre-flight discipline matures (drift caught at dispatch, not post-merge).
- The drift catalog is a **leading indicator** of where the next pattern lock emerges.

*(The per-instance drift catalogs from v1.6/v1.7 are historical and intentionally not carried forward — the taxonomy + insights above are the durable extract.)*

---

## Supersession note

This document **replaces** the following supplement sections (safe to remove supplements v1.2–v1.7 from project knowledge once this is added):

- **Carried forward (here):** §2.4 domain neutrality · §2.5 mainnet pre-reqs (operational portion; contract portion → v1.10 §10) · §2.6 memory-as-spec + 3/5-layer · §2.7 wallet rotation/multi-sig · §2.8 spec-codegen drift · §2.9 velocity calibration · §3.14 VTP · §3.16 class-agnostic/off-chain · §3.18 agent delegation · §3.20 architectural humility · §3.22 pattern locks β-η (+α refs) · §3.24 drift taxonomy.
- **Dropped (historical, value extracted):** §3.6 game launcher (Phase 3+ optionality; v1.10 reframes games as reference implementations) · §3.7/3.8 distribution vectors + skill-pack · §3.9/3.11/3.19/3.21 sprint/thread retrospectives · §3.10 skill-pack listing · §3.12 Phase-1-wrap declaration · §3.13 X20 scope mechanics (disclosure line kept in §7) · §3.15 X10b case study (chain kept in §2) · §3.17 instrumentation discovery · §3.23 audit disclosures.

**Keep in project knowledge:** `skillos-architecture-planning.md` (base architecture — still valid), `SkillOS-Strategic-Memory-v1_10.md` (strategy/economy/legal), and this doc (engineering discipline).
**Remove:** `SkillOS-Strategic-Memory-v1_9.md` (→ v1.10) and supplements `v1.2`–`v1.7` (→ this doc).
