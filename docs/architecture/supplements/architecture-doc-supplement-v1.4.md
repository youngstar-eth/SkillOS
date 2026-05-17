# SkillOS Architecture Doc — Supplement v1.4 (May 17, 2026)

> **Purpose:** Add four sections to `docs/architecture/developer-surface.md`:
> - §2.6 — Memory-as-spec drift invariant (NEW in v1.4)
> - §3.11 — Sprint UR Pass 1 retrospective (NEW in v1.4)
> - §3.12 — Phase 1 wrap + Phase 2 discipline-first transition (NEW in v1.4)
> - §3.13 — X20 AntiCheat rebuild scope (NEW in v1.4)
> - §3.14 — VTP (Verify-Then-Prompt) discipline methodology (NEW in v1.4)
>
> Plus update §4 Sprint Sequence to mark UR Pass 1 sprints complete (PRs #104-#112) and detail Phase 2 mainnet pre-req queue (X10b, X11, X14, X15, X15.5, X16, X17, X18, X19, X20).
>
> **Approval:** Founder approved May 17, 2026 (Phase 1 wrap + discipline-first transition declared same day).
>
> **Baseline:** v1.3 (May 14, 2026) remains the architectural invariant baseline. v1.4 is the **Phase 1 wrap snapshot + Phase 2 mode declaration** layered on top.

---

## SECTION TO INSERT — §2.6

Insert this section **after §2.5 (Mainnet pre-req checklist)** and **before §3 (Architecture — Layer by Layer)**.

---

### 2.6 Memory-as-spec drift invariant

This section catalogs an architectural pattern verification rule derived from May 17 UR Pass 1 thread learnings. **Spec assumptions (memory entries, prior chat context, documentation) drift from reality in both directions and require cross-check before any high-stakes prompt or sprint kickoff.**

**The pattern (5 instances documented May 17):**

| # | Source spec | Reality | Drift direction |
|---|---|---|---|
| 1 | Track D RLS finding spec: "apps/api callers only" | Actual: apps/orchestrator + apps/2048 + packages/duel-backend | **Under-specified** (more consumers than spec) |
| 2 | Y1 Vercel rename spec: "9 projects carry NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL" | Actual: 0 projects had the var | **Over-specified** (fewer than spec) |
| 3 | T5-3 AntiCheat intent: "formula plausibility primary + Haiku supplementary" | Actual code: Haiku-direct on-chain flagScore, formula never built | **Contradicts** (spec vs implementation gap) |
| 4 | Supabase runbook spec: "staging → prod 2-gate apply" | Actual infra: single-prod-DB (no staging project, no preview branches) | **Contradicts** (spec vs infra topology) |
| 5 | apps/api prebuilt deploy spec: "one-shot canonical recipe" | Actual: pre-req `vercel link` + `vercel pull` required if `.vercel/` missing | **Under-specified** (additional steps needed) |

**Architectural invariant:**

Any high-stakes operation (deploy, migration, infrastructure change, multi-step ops, anything touching production state) **must verify state assumptions before action.** Spec drift detection methodology:

1. **Repo state claims** — verify via `git`, `grep`, `find`, `ls`
2. **Infra state claims** — verify via CLI introspection (`vercel`, `supabase`, `gh`)
3. **Runtime state claims** — verify via behavioral check (`curl`, endpoint test, deploy verification)
4. **Memory entry claims** — verify via cross-sprint check + reality grep before relying

**Cost-of-prevention vs cost-of-recovery analysis:**

| Method | Cost | Accuracy | When |
|---|---|---|---|
| Memory + context (no verify) | 0 sec | Low | Read-only investigation, audit-prep docs |
| Founder confirmation | 1 message | Medium | Strategic decision points |
| Code-grep | <1 min | High | Any consumer-set claim, scope-affecting change |
| Infra-introspect (vercel, supabase) | <2 min | High | Any rename/migration/infra change |
| Live curl/test | <1 min | Highest | Any runtime behavior assumption |
| Full agent diagnostic | 10-30 min | Highest + context | When stakes warrant deep investigation |

**The discipline:** sub-2-min verification prevents 30+ min recovery. Cost of skipping verification is exponentially higher than cost of running it. Velocity-first phase tolerated skipping; discipline-first phase mandates integration.

**Cross-reference:** §3.14 VTP discipline methodology operationalizes this invariant into prompt design.

---

## SECTIONS TO INSERT — §3.11, §3.12, §3.13, §3.14

Insert these four sections **after §3.10 (Skill Pack v0.2)** and **before §4 (Sprint Sequence)**.

---

### 3.11 Sprint UR Pass 1 retrospective — May 17 audit-prep wrap

✅ **UR Pass 1 complete (May 17, 2026, single-day parallel execution).**

Sprint UR Pass 1 was the comprehensive self-audit pass run on the v2.1 baseline + off-chain stack + frontend + infrastructure, designed to surface findings before external audit firm engagement (Phase 2 mainnet pre-req). Executed via 4 parallel Claude Code agents on independent worktree branches.

**Track structure:**

| Track | Scope | PR | Severity counts |
|---|---|---|---|
| **A** — Smart contracts | TournamentPool v2.1, SponsorshipModule, SponsorReceiptSBT, MockSanctionsOracle, SkillbaseAnchor | #105 | 0 Critical / 0 High / 3 Medium / 8 Low / 11 Info |
| **B** — Off-chain critical | signer/keys, attestation, cron/settle, write-path access, x402, rate limiting | #112 | 2 Critical / 9 High / 14 Medium / 7 Low / 7 Info |
| **C** — Frontend + wallet + AI | wagmi + Base Account integration, SIWB/SIWA flows, AI features prompt injection, dataSuffix client-side | #104 | 0 Critical / 8 High / 0 RED env exposures |
| **D** — Infra + DB + secrets | Supabase RLS, Vercel env, GH Actions secrets, workflow permissions, repo history scan | #106 | 0 BLOCKER / 7 High / 14 Medium / 11 Low / 11 Info |

**Verification sub-sprints:**

| Sub-sprint | Purpose | PR | Outcome |
|---|---|---|---|
| **T5-3 verification** | Resolve Track C T5-3 Haiku-direct claim (intent vs code drift) | #111 | Verdict (a) Haiku-direct CONFIRMED; formula plausibility never built |
| **X19 schema drift scope** | Confirm Track B H7 missing migration scope (single-file vs multi-class) | #110 | 9 items across 4 provenance classes (3x Track B H7 estimate) |

**Track A — Contracts (PR #105):**

- 207-test baseline preserved on both Foundry profiles
- 0 Critical / 0 High = audit firm starting position is strong
- 3 Medium remediations → v2.2 (X11) design constraints:
  - **M-1** ArcadePool.refundIfEmpty unbounded loop → OpenZeppelin PullPayment pattern
  - **M-2** EIP-191/712 signature schema split → consolidate to EIP-712 + ERC-6492 unwrap (smart wallet compat)
  - **M-3** emergencyWithdraw blast radius → Timelock + bucket-scoped withdrawal (sweepstakes-safe storage promotion from storage-level to function-level)
- Static analysis: Slither, Aderyn, 4naly3er, Solhint (no high-severity unresolved)
- Coverage report: ≥85% per contract
- NatSpec audit: 100% on external/public functions

**Track B — Off-chain (PR #112):**

Most consequential finding set — money + auth + cron surface.

- **C1** — POST /v1/agents/matches/start-solo unauthenticated, moves $1.05 USDC + on-chain tx per call → Hotfix PR #109 shipped same day (SIWA auth gate)
- **C2** — In-memory rate limit cosmetic on serverless (per-Lambda Map, cold-start reset, N× concurrent bypass) → X15.5 sprint (Upstash KV infra)
- **H4** — Settle-side silent swallow at `packages/duel-backend/src/cron/tournaments.ts:977` (memory had wrong path) → X17 sprint unblocked, correct path
- **H7** — `x15_payment_attempts` schema-vs-code drift, missing `v4_20260515b` migration → X19 sprint (9-item recovery)
- 3 memory entries corrected (settle path, paid retry status, x15 schema branch-state gap)
- 39 deduped findings across signer/keys, attestation, cron/settle, write-path access, x402 facilitator, rate limiting

**Track C — Frontend + wallet + AI (PR #104):**

Discovery via parallel cross-tracing (axis 3 dataSuffix × axis 6 retry server-side) — single-axis review would have missed it.

- **F-3.2 (most consequential)** — X10 fix incomplete: agent path closed, **human path open**. `packages/duel-backend/src/api/tournaments/solo.ts:477` lacks dataSuffix encoder. X10b sprint open.
- **T5-3** — Haiku-direct on-chain flagScore writes, no confidence gate, no human appeal mechanism. False-positive axis uncovered. → X20 rebuild scope.
- **Y1** — `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` foot-gun: server-only fallback dropped via PR #107 (Vercel rename N/A — verified 0 projects had the var)
- 8 high/blocker items + 0 RED env exposures
- 8/8 builder codes attested client-side (server-side broadcast = agent ✓, human ✗ pre-X10b)

**Track D — Infra + DB + secrets (PR #106):**

Strongest positive signal: 350-commit gitleaks history scan → 0 true positives (175 raw hits all noise: vendored, Anvil, Farcaster pubkeys).

- 43 findings, 0 BLOCKER (infra fundamentally sound)
- D top-3 pre-X9 fixes:
  - **D top-3a** — RLS on `v2_sp_snapshots` + `v2_cron_runs` → PR #108 (shipped + applied to prod May 17)
  - **D top-3b** — Supabase rotation runbook (Phase 2 hardening)
  - **D top-3c** — GitHub native security features re-enable (Phase 2 hardening)
- Two pattern locks surfaced: memory-as-spec drift detection (cross-references §2.6) + triage-first secret scanning (histogram raw hits by rule + directory before opening any file)

**Verification sub-sprint outcomes:**

**T5-3 verification (PR #111):**

Track C T5-3 finding's intent-vs-code question resolved with 49+ file:line citations.

- **Q1** (passes formula / Haiku flags → flagScore?) — YES trivially because no formula check exists
- **Q2** (fails formula / Haiku clean → flagScore?) — NO (rejected by handlers.ts:388-394 before Haiku runs)
- **Q3** (sole Haiku gate to flagScore?) — YES at cron/tournaments.ts:925
- **bias-toward-plausible** — 3 layers cover infrastructure failure (parse, call, NULL) but NOT Haiku regression emitting false-positive implausible
- **Additional gaps:** solo runs bypass on-chain flagScore entirely (cron joins duel-only source_duel_ids); solo score has no upper bound vs duel's (0, 50_000)
- **Migration path scoped:** X20 sub-sprints F0-F4 (§3.13)

**X19 schema drift scope (PR #110):**

- 9 items across 4 provenance classes (3x Track B H7 single-file estimate)
- **Class A2 (critical):** 4 missing tables with NO registry row + NO file + live tables (payouts, challenges + 2 alters) → audit trail loss
- **Class D illusion:** stale local main ref in worktree showed false divergence — pre-push hook recommendation (Class D prevention)
- **Two founder decisions queued:** (1) CI drift check scope = B (prod + staging) ✓ locked, (2) CODEOWNERS supabase/migrations/ founder-pinned = YES ✓ locked
- **Adjacent finding flagged:** v2_sp_snapshots RLS gap — resolved via D top-3a apply

**Tier 0 hotfixes shipped + verified May 17:**

| Fix | PR | Status | Verification |
|---|---|---|---|
| **C1** SIWA auth gate on /v1/agents/matches/* | #109 | Deployed via prebuilt recipe, verified live | curl unauth → 401 (auth runs BEFORE Zod, not 400) |
| **D top-3a** RLS migration v2_sp_snapshots + v2_cron_runs | #108 | Applied to prod via MCP, 2/2 verify pass | pg_class + REST anon/service-role |
| **Y1** env var foot-gun removal | #107 | Code drops fallback, no Vercel work needed | bundle analyzer + CI green |

**Phase 1 batch merge sequence (audit-prep docs first, ops second):**

- Phase 1 batch: PRs #104, #105, #106, #110, #111, #112 (6 audit-prep docs)
- Phase 2 ops: #108 → Vercel N/A → #107 → `supabase db push` → #109 + prebuilt deploy + verify
- Total: 9 PRs merged in single-day sprint thread
- Branch protection respected throughout (no bypass, gh pr update-branch + CI re-run when needed)

**Operational pattern locks (commit-ready memory candidates):**

1. **Pass 1 findings-only proof = empty diff on scope paths** — `git diff main -- <scope-paths>` = 0 lines verifies "findings only" claim. PR description proof pattern.
2. **Parallel UR cross-tracing finds gaps single-axis sequential misses** — F-3.2 (X10 human path) canonical example. Axis 3 × axis 6 cross-trace surfaced what neither axis alone would.
3. **Triage-first secret scanning** — histogram raw hits by rule + directory BEFORE opening any file. 175 → 0 case study. Auditor reports show triage path, not raw count.
4. **Memory-as-spec drift detection** — see §2.6. 5 instances documented.
5. **PostgREST RLS gotcha** — anon SELECT against RLS-denied table returns 200 + [], NOT 401. Verify command checks empty body, not error code.
6. **Worktree origin/main verification** — `git log origin/main..HEAD` for divergence; local `main` ref drift-prone in worktrees, gives stale results.
7. **Multi-line commit heredoc landmine** — `git commit -m "$(cat <<EOF...)"` silently no-ops. Single-line `-m` + `--body-file` for PR body.
8. **test-foundry 17s fail signature** — foundryup toolchain install died (GitHub API rate limit), NOT real test failure. Sub-30s fails: triage as infra, not regression.
9. **Same-SHA passed-then-failed across two runs** — cleanest infra-flake vs code-regression isolation.
10. **Agent gate-respect protected** — `feedback_respect_gate_holds` rule enables agents to surface spec mismatches; explicit acknowledgment authorizes proceed (Supabase Path B case).

**Cross-references:**

- §2.6 — Memory-as-spec drift architectural invariant
- §3.13 — X20 AntiCheat rebuild scope (T5-3 derivative)
- §3.14 — VTP discipline methodology (operationalization)
- §4 — Sprint Sequence Phase 2 mainnet pre-req queue

---

### 3.12 Phase 1 wrap + Phase 2 discipline-first transition (May 17 declaration)

✅ **Founder declaration May 17, 2026:** velocity phase officially closed, pre-seed ready milestone achieved.

**Phase 1 wrap criteria met:**

| Domain | Status |
|---|---|
| Working demo + verified contracts on BaseScan + npm packages live | ✓ |
| Developer surface (sdk + mcp + cli + skills) on npm | ✓ |
| api.skillos.network HTTP API live | ✓ |
| 6 game subdomains + sponsor app + apex marketing site | ✓ |
| 207 Foundry tests passing | ✓ |
| 8/8 Builder Code surfaces wired (client-side) | ✓ |
| UR Pass 1 complete (§3.11) | ✓ |
| Tier 0 hotfixes shipped + verified in production | ✓ |
| Audit-prep packet merged (PRs #104-#112) | ✓ |
| Phase 2 sprint queue scoped | ✓ |
| Accelerator submissions filed (a16z Speedrun SR007, YC S26) | ✓ |
| Round-spec canonical doc (PR #103) | ✓ |
| Branch protection live (PR-only, no direct-to-main) | ✓ |

**Phase 2 mode framework (foundations-first):**

The transition is from velocity-over-discipline (deliberate Phase 1 tradeoff) to discipline-first (Phase 2 baseline). Concrete framework changes:

1. **VTP (Verify-Then-Prompt) discipline mandatory** for high-stakes prompts (§3.14)
2. **Memory-as-spec cross-check** before any sprint kickoff (§2.6)
3. **Sprint scope freeze** before audit firm engagement
4. **Audit-readiness running checklist** maintained against each sprint outcome
5. **Disclosure inventory** (centralization vectors, known issues, intent-vs-implementation gaps) maintained for audit firm packet
6. **Pre-push hook** discipline (X19 sprint scope addition, Class D illusion prevention)
7. **CI drift check** (prod + staging schema diff, X19 lock policy)
8. **CODEOWNERS** on `supabase/migrations/` for founder-pinned review

**Pre-seed ready definition (current state, May 17):**

- All four audience tiers reached:
  - VC (Speedrun, YC, Coinbase Ventures, generic crypto VCs) — fundraise-ready
  - Public / Twitter / dev community — strong signals
  - Audit firms (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin) — audit-ready (UR Pass 1 self-audit done, can engage)
  - Mainnet sponsors (with real $) — NOT yet ready (X20 AntiCheat rebuild required)

**Mainnet-ready definition (Phase 2 completion target):**

Cumulative requirements:

- Phase 2 mainnet pre-req sprints executed: X10b, X11, X14, X15, X15.5, X16, X19, X20 (§4)
- External audit firm engaged + signed off
- Cayman Foundation structured (X13)
- Mainnet wallet rotation complete (zero on-chain connection between role-distinct addresses)
- AntiCheat architectural rebuild done (X20 F0-F4)
- v2.2 contract deployed mainnet (X11)
- 3rd-party SDK rollout proven (web-native first)

**Pitch framing for the transition:**

> *"Phase 1 = ship + learn (deliberate velocity tradeoff). Phase 2 = audit-grade discipline. Pre-seed window earned by completion of Phase 1 wrap; mainnet window earned by completion of Phase 2 sprint queue."*

This honest framing aligns with Skillz/Papaya pitch reference: opacity is the failure mode, not bugs. Bugs caught via UR Pass 1 are pre-mainnet-resolvable. Opacity (the Papaya pattern) is unrecoverable. SkillOS chose transparency-first by design.

**Cross-references:**

- §2.6 — Memory-as-spec drift invariant (foundational Phase 2 discipline)
- §3.11 — UR Pass 1 retrospective (Phase 1 wrap deliverables)
- §3.14 — VTP discipline methodology
- §4 — Sprint Sequence Phase 2 queue

---

### 3.13 X20 AntiCheat rebuild scope — pre-mainnet architectural sprint

⏳ **Pre-mainnet sprint, ~3 weeks, parallel with X11 (v2.2 contract).**

**Discovery context:**

Track C UR Pass 1 surfaced T5-3 (Haiku-direct on-chain flagScore writes). T5-3 verification sub-sprint (PR #111) confirmed verdict (a) Haiku-direct with two additional gaps:

1. **Solo runs bypass on-chain flagScore entirely** — cron `source_duel_ids` join is duel-only
2. **Formula plausibility (duration × moves × score) was design intent never built in code**

**Phase 1 testnet AntiCheat reality (per T5-3 verification):**

| Layer | Reality |
|---|---|
| Formula plausibility (duration × moves × score) | ❌ Never implemented |
| Hard bounds (0 < score < 50_000) | ✓ Duel only |
| Play-window check | ✓ Solo + duel |
| Class enforcement | ❌ X14 sprint, not implemented |
| Haiku AntiCheat | ✓ Duel path (currently inactive via DuelComingSoon); Haiku-direct → on-chain flagScore, irreversible, no confidence gate |

This is documented honestly for audit firm engagement and pitch transparency — Phase 1 testnet had limited AntiCheat scope; Phase 2 rebuild is architecturally scoped pre-mainnet.

**X20 sub-sprint breakdown (pre-mainnet):**

| Sub-sprint | Scope | Effort | Mainnet pre-req? |
|---|---|---|---|
| **X20.0 — F0 Formula implementation** | duration × moves × score plausibility, both paths (solo + duel) | 1 week | ✓ |
| **X20.1 — Solo path AntiCheat enforcement** | Formula gate at submit (no on-chain flag needed if formula reject — rejected at submit time) | 3-5 days | ✓ |
| **X20.2 — F1 Confidence gate** | Haiku verdict threshold (only flag if model_confidence > threshold) | 1 day | ✓ |
| **X20.3 — F2 Per-tournament circuit-breaker** | Mass false-positive abuse detection (if Haiku flags too many in window, pause writes) | 2-3 days | ✓ |
| **X20.4 — Option F migration** | Haiku → off-chain advisory queue (no irreversible LLM verdicts on-chain) | 3-5 days | ✓ |

**X20 post-mainnet expansion (Phase 3+):**

| Sub-sprint | Scope | Phase |
|---|---|---|
| X20.5 — F3 Forensic columns | Audit trail (verdict, confidence, source, override history) | Post-mainnet |
| X20.6 — F4 Anomaly alerting | Op-level monitoring (Haiku regression detection, false-positive rate, false-negative rate) | Post-mainnet |

**Architectural strategic lock — Option F (selected May 17):**

Mainnet AntiCheat = **deterministic formula plausibility (primary) + class enforcement (X14)**, with Haiku as off-chain advisory queue only. NO irreversible LLM verdicts on-chain.

Rationale:
- Aligns with "decentralization earned, not claimed" pitch line
- Audit firm narrative: deterministic + auditable + no AI trust assumption on-chain
- Reduces centralization disclosure surface
- Preserves Haiku data collection for Phase 3+ dispute layer training input

**Disclosure for audit firm packet:**

> *"Phase 1 testnet AntiCheat scope was limited: bounds + play-window checks (solo) + Haiku-direct on-chain flagScore (duel path, currently inactive). Formula plausibility was design intent never built. Class enforcement pending X14 sprint. Pre-mainnet rebuild architectural per X20 sub-sprints F0-F4: deterministic formula primary + class enforcement + Haiku off-chain advisory queue only. No irreversible LLM verdicts on-chain at mainnet launch."*

**Cross-references:**

- §3.11 — T5-3 verification sub-sprint (discovery context)
- §3.12 — Phase 2 discipline-first transition (mainnet-ready definition)
- §4 — Sprint Sequence Phase 2 queue (X20 placement)

---

### 3.14 VTP (Verify-Then-Prompt) discipline methodology

✅ **Phase 2 baseline operational discipline.** Operationalizes §2.6 (memory-as-spec drift invariant) into prompt design + agent execution flow.

**Problem definition:**

May 17 UR Pass 1 thread surfaced 5 spec-vs-reality drift instances (§2.6). Root cause analysis: high-stakes prompts encoded beliefs about state without verification. Each drift caused friction (sub-30 dk to multi-hour recovery). All would have been prevented by sub-2-min pre-flight verification.

The pattern: **prompt-construction-from-assumed-state rather than verified-state.** Velocity-first phase tolerated this; discipline-first phase mandates integration.

**VTP prompt design pattern:**

Every high-stakes prompt (deploy, migration, infrastructure change, multi-step ops, anything touching production state) opens with explicit pre-flight verification gates.

**Standard prompt header template:**

```markdown
## Pre-flight verification (mandatory — before any action)

Assumptions this prompt makes:
1. [Assumption 1]
2. [Assumption 2]
3. [Assumption 3]

Verification commands:
- For assumption 1: <cheapest verify command>
- For assumption 2: <cheapest verify command>
- For assumption 3: <cheapest verify command>

If any verification fails → STOP and surface mismatch.
Do not proceed to action steps.

## Action steps (only after verifications pass)
...
```

**Three state categories — what to verify, how:**

| Category | What to verify | Tool |
|---|---|---|
| **Repo state** | File existence, content, branch state, commit history | `git`, `grep`, `find`, `ls`, `cat` |
| **Infra state** | Vercel env, Supabase schema, DNS, secrets, project configuration | `vercel` CLI, `supabase` CLI, `gh`, `curl` |
| **Runtime state** | Endpoint behavior, deploy commit, function output | `curl`, `vercel ls`, `fetch`, integration test |

**Cost calibration rule by stake level:**

| Action type | Pre-flight depth |
|---|---|
| Read-only investigation, audit-prep docs | Light (memory-as-citation hygiene yeterli) |
| Code change (single file, scoped) | Code-grep verify |
| Infra change (env, secrets, DNS) | Infra-introspect verify |
| Migration (DB schema, prod state) | Code-grep + infra-introspect + dry-run |
| Production deploy | Code-grep + infra-introspect + curl smoke + behavioral verification |

**Operational integration with agent execution:**

Agent gate-respect rule (`feedback_respect_gate_holds`, memory canonical): when paste-ready prompt encounters spec-vs-reality mismatch during pre-flight, agent surfaces the mismatch and STOPS rather than proceeding with assumed state. Explicit founder acknowledgment authorizes proceed.

Case studies of gate-respect protection (May 17 UR Pass 1):

| Sub-sprint | Spec mismatch surfaced | Agent action | Founder decision |
|---|---|---|---|
| Y1 Vercel rename | Spec assumed 9 projects, reality 0 | Surfaced + paused | Reframed: Vercel rename N/A, simplified Phase 2 |
| Supabase RLS apply | Spec assumed staging→prod 2-gate, reality single-DB | Surfaced + paused | Authorized Path B (single-gate direct-to-prod) |
| X19 schema drift | Spec assumed single-file, reality 9-item 4-class | Surfaced + scoped | Adjusted X19 sprint scope estimate |

Each case validated the methodology — agent gate-respect protected against silent reality drift.

**Founder-Claude prompt review checkpoint (optional, high-stakes):**

For Phase 2 high-stakes prompts (deploy, migration, infrastructure), founder may skim prompt before paste to agent. 30-second skim:

- "What assumptions does this prompt make?"
- "Which are verified vs assumed?"
- "What's the cheapest verification?"
- "Is pre-flight section present?"

If pre-flight missing → "ekle" → revise. 30-second investment, 30-minute downstream recovery prevented.

**Memory hygiene rules:**

When citing memory entries in prompt construction:

1. Check timestamp/freshness of cited entry
2. Cross-sprint memory entries are drift-prone — flag explicitly
3. High-stakes memory citations include caveat: *"Per memory canonical X — verify via `<command>` before relying"*

**Pattern memory candidates (commit-ready):**

> *"VTP (Verify-Then-Prompt) discipline: high-stakes prompts state-verification gates INTEGRATED open ile (pre-flight section), action sonrası post-check değil. Cost: sub-2 min pre-flight. ROI: 30 dk+ downstream recovery prevent. 3 state kategori — repo (grep), infra (CLI introspect), runtime (curl) — her birinin cheapest verify command'i prompt'ta öne yazılmalı."*

**Cross-references:**

- §2.6 — Memory-as-spec drift invariant (architectural foundation)
- §3.11 — UR Pass 1 retrospective (pattern lock candidates)
- §3.12 — Phase 2 discipline-first transition (operational integration)

---

## UPDATE TO §4 — Sprint Sequence current state

After all existing X1-X10 sprint entries in §4, mark UR Pass 1 sprints complete and add Phase 2 mainnet pre-req queue:

---

**Sprint Sequence — current state (May 17, 2026):**

| Sprint | Status | Notes |
|---|---|---|
| X1-X7 — Layer 1A through Layer 3 reference apps | ✅ COMPLETE | Phase 1 dev surface foundation |
| X3.5 — SkillOS Skill Pack | ✅ COMPLETE | npm @skillos/skills, mdskills.ai listing |
| Skill Pack v0.2 | ✅ COMPLETE | Capabilities + Quality + Security dimensions improved |
| X9 — Tournament data layer fix | ✅ COMPLETE | PR #78 strict revert decode + audit columns |
| X9.1 — Wallet preflight check | ✅ COMPLETE | PR #80 structured deficit logging |
| X9.2 — Burn rate reduction | ✅ COMPLETE | PR #81 testnet pool 10→5 USDC |
| X10 — Server-side dataSuffix attribution (agent path) | ✅ COMPLETE | PR #82, chain-verify clicker tx 0xd371ba4c |
| **UR Pass 1 Track A — Contracts** | ✅ COMPLETE | PR #105 |
| **UR Pass 1 Track B — Off-chain** | ✅ COMPLETE | PR #112 |
| **UR Pass 1 Track C — Frontend** | ✅ COMPLETE | PR #104 |
| **UR Pass 1 Track D — Infra** | ✅ COMPLETE | PR #106 |
| **T5-3 verification** | ✅ COMPLETE | PR #111, verdict (a) Haiku-direct confirmed |
| **X19 schema drift scope** | ✅ COMPLETE | PR #110, 9-item 4-class scope confirmed |
| **Tier 0 — C1 SIWA auth gate** | ✅ COMPLETE | PR #109 merged, deployed, verified (curl unauth → 401) |
| **Tier 0 — D top-3a RLS migration** | ✅ COMPLETE | PR #108, applied to prod via MCP, 2/2 verify pass |
| **Tier 0 — Y1 env rename code path** | ✅ COMPLETE | PR #107, Vercel rename N/A (0 projects had var) |

**Phase 2 mainnet pre-req queue (blocker class, parallel where possible):**

| Sprint | Source | Effort | Status |
|---|---|---|---|
| **X10b — Human path dataSuffix server-side attribution** | UR Pass 1 Track C F-3.2 | Sub-day | Queued |
| **X11 — v2.2 developer fee splitter contract** | Phase 2 + UR Pass 1 Track A M-1/M-2/M-3 | 1-2 weeks | Queued |
| X14 — Class-aware fairness X8 | Phase 2 backlog | 2-3 weeks | Queued |
| X15 — Agent retry payments | UR Pass 1 Track B H findings | 1 week | Queued |
| **X15.5 — Rate limit infra (Upstash KV)** | UR Pass 1 Track B C2 | 1 week | New, mainnet blocker |
| X16 — Vercel path-filter migration | X10 RCA, turbo-ignore deprecated | 3-5 days | Queued |
| **X19 — Schema reconciliation (9-item 4-class)** | UR Pass 1 X19 verification | 3-5 days | New, mainnet pre-req |
| **X20 — AntiCheat rebuild (F0-F4 sub-sprints)** | UR Pass 1 T5-3 verification | ~3 weeks | New, mainnet pre-req |

**Phase 2 hardening (parallel to audit window):**

| Sprint | Source | Effort |
|---|---|---|
| X17 — Settle silent swallow (path corrected) | UR Pass 1 Track B H4 | 1 week |
| X18 — Match3 chronic monitoring | Backlog | 1 week |
| CI workflow hardening | foundry-toolchain GITHUB_TOKEN | Sub-30 min |
| TournamentCreated event indexer | Backlog | 1 week |
| Cron settle throughput refactor | Backlog | 1 week |
| Next.js 16 bump | Backlog | 3-5 days |
| Apex CLAUDE.md drift sync | Backlog | 3-5 days |
| Mainnet builder code re-wiring (8 surfaces) | Phase 2 cutover | 1-2 days |
| node_modules stray Vercel project cleanup | Track D adjacent | 30 min |

**Audit firm engagement (parallel with Pass 2 prep):**

| Sprint | Status |
|---|---|
| X12 — Audit firm slot booking (parallel outreach 3-4 firms) | Pending — Trail of Bits / OpenZeppelin (tier-1) + Spearbit / Cyfrin (tier-2) |
| X13 — Cayman Foundation counsel inquiry | Pending |

**Cross-references:**

- §2.5 — Mainnet pre-req checklist (v1.3)
- §2.6 — Memory-as-spec drift invariant (v1.4)
- §3.11 — UR Pass 1 retrospective (v1.4)
- §3.12 — Phase 1 wrap + Phase 2 transition (v1.4)
- §3.13 — X20 AntiCheat rebuild scope (v1.4)

---

## CHANGELOG TO APPEND — §9

After all existing changelog entries (v1.3, v1.2, v1.1, v1) at the end of the doc, prepend the v1.4 entry:

```
### v1.4 — 2026-05-17
- Added §2.6 Memory-as-spec drift invariant — architectural pattern 
  verification rule derived from May 17 UR Pass 1 thread learnings.
  5 instances documented across 3 directions (under-spec, over-spec, 
  contradict). Cross-check methodology (repo grep + infra introspect + 
  memory cross-check) mandatory before high-stakes prompts.
- Added §3.11 Sprint UR Pass 1 retrospective — documents 4 parallel 
  tracks (A contracts 0C/0H, B off-chain 2C/9H, C frontend 0C/8H, 
  D infra 0C/7H + clean 350-commit history scan) + 2 verification 
  sub-sprints (T5-3 Haiku-direct confirmed, X19 9-item 4-class scope) + 
  3 Tier 0 hotfixes shipped + verified in production (C1, D top-3a, Y1).
  9 PRs merged, 10 operational pattern locks captured.
- Added §3.12 Phase 1 wrap + Phase 2 discipline-first transition — 
  founder declaration May 17 2026. Velocity phase officially closed, 
  pre-seed ready milestone achieved. Phase 2 mode = foundations-first, 
  audit-ready stance. VTP discipline mandatory baseline.
- Added §3.13 X20 AntiCheat rebuild scope — pre-mainnet sprint ~3 weeks 
  parallel with X11. Sub-sprints F0 formula impl + F1 confidence gate + 
  F2 circuit-breaker + F4 Haiku off-chain advisory queue. Strategic lock: 
  Option F (deterministic primary, no irreversible LLM verdicts on-chain).
- Added §3.14 VTP (Verify-Then-Prompt) discipline methodology — 
  operationalizes §2.6 into prompt design. Standard header template + 
  3 state categories (repo, infra, runtime) + cost calibration rule + 
  agent gate-respect integration + founder-Claude review checkpoint.
- Updated §4 Sprint Sequence: UR Pass 1 sprints marked complete 
  (PRs #104-#112), Tier 0 hotfixes shipped, Phase 2 mainnet pre-req 
  queue detailed (X10b, X11, X14, X15, X15.5, X16, X19, X20).
```

---

## END OF SUPPLEMENT
