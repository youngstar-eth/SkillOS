# SkillOS Architecture Doc — Supplement v1.6 (May 18, 2026)

> **Purpose:** Add five sections to `docs/architecture/developer-surface.md`:
> - §2.8 — Spec-codegen drift framework (NEW in v1.6)
> - §2.9 — Velocity scale calibration invariant (NEW in v1.6)
> - §3.18 — Agent delegation principle (NEW in v1.6)
> - §3.19 — Sustained execution retrospective May 17-18 + operational pattern locks ×6 (NEW in v1.6)
> - §3.20 — Architectural humility "doğru niyet, yapısal kısıt" pattern (NEW in v1.6)
>
> Plus §4 Sprint Sequence update marking X14.0 + X20.0a + SDK regen catch complete, mainnet pre-req queue advancement (T1+ MAINNET BLOCKER CLOSED).
>
> **Approval:** Founder approved May 18, 2026 (post-X14.0 closure + Stoplight customization defer + pattern tier review).
>
> **Baseline:** v1.5 (May 18, 2026 early morning) remains the architectural invariant baseline. v1.6 is the **operational discipline canonicalization layer** capturing the May 17-18 sustained execution thread learnings.

---

## SECTION TO INSERT — §2.8

Insert this section **after §2.7 (Mainnet wallet rotation + multi-sig discipline)** and **before §3 (Architecture — Layer by Layer)**.

---

### 2.8 Spec-codegen drift framework

This section codifies the auto-generated material vs source material drift detection pattern, surfaced as a canonical sibling to §2.6 (memory-as-spec drift framework). Where §2.6 catches drift between Claude's mental model and reality, §2.8 catches drift between two sources of truth that should stay synchronized but diverge across parallel worktree cycles.

**The pattern (May 18 PR #128 → #129 canonical case study):**

PR #128 (X20.0a moves instrumentation) added new field to API surface — `moves: integer` on solo run submission. The PR included:
- Migration adding `moves` column to `v2_tournament_solo_runs`
- OpenAPI spec update at `apps/api/src/schemas/score-submit.ts`
- Backend handler persistence at `packages/duel-backend/src/api/tournaments/solo.ts`
- Frontend payload capture at 6 game apps

PR #128 did NOT include:
- `packages/sdk/src/api.gen.ts` regenerate from updated spec

The SDK was therefore **out-of-date with respect to the deployed spec.** Production OpenAPI surface had the endpoint shape; SDK consumers (web-native or agent-native) calling via `@skillos/sdk` would receive stale TypeScript types.

**Detection — post-merge `git status` review:**

During X20.0a worktree cleanup (~30 min post-merge), `git status --short` in the main repository surfaced:

```
 M packages/sdk/src/api.gen.ts
```

The 70-line diff was the regenerate output from a parallel agent worktree that never landed as a separate PR. The regenerate cycle was completed in another worktree but not committed back to main.

**Resolution — PR #129 mini-PR pattern:**

PR #129 (commit `731674e`, merge `c53554c`) shipped the catch-up regenerate as a follow-on mini-PR. Two-PR pattern (feature + codegen catch-up) is the operational canonical going forward.

**Three drift detection methodologies (cumulative):**

| # | Method | Cost | Catches |
|---|---|---|---|
| 1 | Post-merge `git status --short` review on SDK directory after every feature PR that touches spec | <30 sec | Manually surfaced drift |
| 2 | CI step: `npm run sdk:regen` + `git diff packages/sdk/src/api.gen.ts` — fail build if non-empty | <2 min | Auto-blocks drift at PR open |
| 3 | Separate worktree cycle artifact awareness — parallel agent dispatches that touch generated material must round-trip back to main before sprint declared shipped | discipline-only | Prevents lost work in stale worktrees |

**Generalization beyond SDK:**

The drift framework applies to any **auto-generated material kept in version control**:

- SDK clients regenerated from OpenAPI spec
- TypeScript types regenerated from Zod schemas or DB schema
- ABI bindings regenerated from Solidity contracts
- Documentation pages regenerated from inline annotations (JSDoc → MDX)
- Embedded API examples regenerated from contract or schema source

Any of these can fall out of sync across parallel worktree cycles. Methodologies 1-3 apply uniformly.

**Architectural relationship to §2.6:**

| Framework | Drift kind | Source of truth | Catches |
|---|---|---|---|
| §2.6 — Memory-as-spec drift | Mental model vs reality | Code/infra/runtime state | Claude or agent inferences |
| §2.8 — Spec-codegen drift | Source spec vs generated artifact | Two synchronized files in repo | Cross-worktree gen cycles |
| §3.14 — VTP discipline | Pre-action assumption vs verified state | State verification commands | Operational ops |

All three operate at different layers of the discipline stack. §2.6 protects single-prompt action; §2.8 protects multi-PR sequence integrity; §3.14 operationalizes both into prompt design.

**Cross-reference:** §2.6 memory-as-spec drift framework; §3.14 VTP discipline; §3.19 sustained execution retrospective for May 17-18 thread context.

---

## SECTION TO INSERT — §2.9

Insert this section **after §2.8 (Spec-codegen drift framework)** and **before §3 (Architecture — Layer by Layer)**.

---

### 2.9 Velocity scale calibration invariant

This section codifies the founder-velocity vs agent-velocity ~10-15x difference on mechanical / well-scoped sprints. Surfaced as binding calibration rule for sprint estimation re-use.

**The pattern (X14.0 canonical case study):**

X14.0 was scoped in CR1 R2 SCOPING.md §4.1 with the estimate "2-3 days founder-velocity" — based on the assumption that the sprint touched four DB tables, dual-cron emit sites, three handler files, API forward-compat schemas, and required full production deploy + smoke verification.

Agent-velocity actual: **~3 hours** (start to merge + deploy + smoke verified).

| Phase | Scope estimate (founder-velocity) | Actual (agent-velocity) | Ratio |
|---|---|---|---|
| Schema migration design + apply | 4-6 hours | 25 min | ~12x |
| Dual-cron emit + handler persistence | 6-8 hours | 45 min | ~10x |
| API forward-compat schemas + 403 enforcement | 4-6 hours | 35 min | ~10x |
| /v1/scores T1+ 501→200 lift | 2-4 hours | 15 min | ~12x |
| Production deploy + smoke + memory finalize | 2-3 hours | 25 min | ~6-7x |
| **Total** | **18-27 hours (2-3 days)** | **~3 hours** | **~9-10x** |

**X20.0a corroborates:**

X20.0a was scoped at "3-5 days founder-velocity" — agent-velocity actual ~2.5 hours (commit `6564cc1`, merge `ede70a5`, browser e2e verified). Ratio ~12x.

**Implication for sprint scoping doc estimates:**

Scoping documents (CR1 R2/R3 outputs, SCOPING.md per X14/X20 agent reports, sprint plan files) carry **founder-velocity** estimates by convention. When re-using these estimates for **agent dispatch** planning, divide by ~10 (or use the empirical 9-12x range).

**Sprint dispatch revised estimates (X14 + X20 remaining work, agent-velocity):**

| Sub-sprint | Scoping (founder-velocity) | Agent-velocity dispatch |
|---|---|---|
| X14.0b cron settle exclusion | 1-2 days | 2-3 hours |
| X14.1 extension whitelist | 1 day | 1-2 hours |
| X14.2 AI browser detection | 1-2 days | 2-3 hours |
| X14.3 behavioral biometrics | 2-3 days | 4-6 hours |
| X14.4 dishonor SBT (ERC-5192) | 2-3 days | 4-6 hours |
| X14.5 integration test suite | 1-2 days | 2-3 hours |
| X20.0b F0 formula pure function | 1-2 days | 2-3 hours |
| X20.1 solo path enforcement | 3-5 days | 6-10 hours |
| X20.2 F1 confidence gate | 1-2 days | 2-3 hours |
| X20.3 F2 circuit-breaker | 2-3 days | 4-6 hours |
| X20.4 F4 Haiku off-chain advisory | 3-5 days | 6-10 hours |
| X11.5 multi-sig deployment | 1 week | 1-2 days (founder ceremony fraction non-scalable) |
| **Total X14 + X20 + X11.5** | **~6-8 weeks founder-velocity** | **~1.5-2 weeks agent-velocity** |

**Caveats — NON-scaling categories:**

The ~10x ratio applies to **mechanical / well-scoped sprints**:
- Schema migrations
- Code wiring with clear specs
- Test green path
- Deploy + smoke verification
- Documentation generation
- Pattern application from canonical examples

The ratio **DOES NOT apply** to:
- Strategic synthesis (pattern recognition, founder Q resolution, architectural decision)
- Design system creation (Stoplight customization is example — agent reconnaissance valuable, design call still founder + Claude)
- Pitch / fundraising material (audience-aware messaging, story arc)
- Hardware-ceremony work (X11.5 actual signer ceremony, mainnet cutover ritual)
- Audit firm coordination (people-process, NDA cycle, slot booking)
- Founder-strategic decisions (Q resolution, brand calls, threshold choices)

For these categories, **founder-velocity dominant.** Claude (chat) accelerates synthesis; agent dispatch doesn't apply.

**Implication for Phase 2 mainnet timeline modeling:**

If Phase 2 mainnet pre-req queue is modeled at founder-velocity estimates (6-8 weeks), funding-gated path (X12 audit ~4-8 weeks + X13 Cayman ~4-8 weeks) dominates timeline.

If modeled at agent-velocity (1.5-2 weeks for X14 + X20 + X11.5), funding-gated path **completely** dominates — the engineering surface is no longer the bottleneck. Fundraise becomes the critical path.

This is a Phase 2 strategic clarifier: **agent-velocity collapses the engineering bottleneck.** Mainnet timeline is funding-velocity, not code-velocity.

**Cross-reference:** §3.18 agent delegation principle (operational integration); §4 Sprint Sequence Phase 2 queue (agent-velocity estimates applied).

---

## SECTIONS TO INSERT — §3.18, §3.19, §3.20

Insert these three sections **after §3.17 (X20 moves instrumentation discovery)** and **before §4 (Sprint Sequence)**.

---

### 3.18 Agent delegation principle — framework lock May 18, 2026

✅ **Framework lock May 18, 2026 (post-X14.0 closure):** founder explicit declaration — *"agent'lar bizden daha iyi iş çıkarıyor, tüm delegate edilebilecek işleri agent'a verelim bundan sonra da."*

This section operationalizes the agent-led delegation pattern as Phase 2 baseline working discipline, formalizing what was emergent throughout the May 17-18 sustained execution thread.

**Role assignment table (binding):**

| Role | Tasks |
|---|---|
| **Founder + Claude (chat synthesis surface)** | Strategic decisions, pitch framing, pattern recognition, founder Q resolution, narrative + audit posture design, supplement writing, cross-context synthesis, decision pack design, design system calls, threshold choices, fundraise prep |
| **Agent (Claude Code, paste-ready prompts)** | Codebase grep / read / analysis, git + gh ops, Supabase migrations, Vercel deploys, commit cycles, worktree management, VTP pre-flight verification chains, post-action runtime smoke, file system ops, mechanical CSS / config changes, sprint scoping reconnaissance |

**Interface protocol:**

```
1. Founder + Claude synthesis (chat) →
2. Claude drafts paste-ready prompt (with VTP pre-flight gates per §3.14) →
3. Founder paste to fresh Claude Code session →
4. Agent executes, surfaces drift if any (per §2.6 gate-respect) →
5. Agent reports + commits per discipline (per §3.19 patterns) →
6. Founder forwards report to Claude chat →
7. Claude synthesizes next move + drafts next prompt
```

This is the canonical Phase 2 loop. Memory canonical entry `feedback_respect_gate_holds` protects step 4 (agent surfaces mismatch, STOPs, waits for founder authorization).

**Evidence — May 17-18 sustained thread:**

| Metric | Count | Notes |
|---|---|---|
| Total PRs (May 17-18 cumulative) | 19 | UTC calendar canonical (per §3.19 pattern lock) |
| Ironic drift catches by agent | 4 | Agent grep / state-verify surfaced founder-frame errors before damage |
| VTP pre-flight compliance | 100% | All paste-ready prompts opened with verification gates |
| Production damage events | 0 | Despite migration applies, prod deploys, contract-adjacent ops |
| State-verify pre-flight skip-when-already-done | Multiple | Agent self-detected idempotent ops, skipped redundant work |
| Plan deviations openly documented | Multiple | Agents reframed sprint shape mid-execution (X20.0a split, X14.0 line drift) |

**Three behaviors that mark a healthy delegation cycle:**

1. **Agent surfaces gate violations.** When agent encounters spec-vs-reality mismatch (per §2.6), it stops and reports rather than guessing. Founder authorization is the resume signal. This is what protects production state.

2. **Agent re-shapes sub-sprints when reality demands.** X20.0a discovery (per §3.17): scoping said "1 week pure function," reality required plumbing prerequisite. Agent split into X20.0a + X20.0b rather than blocking. Reframe is *expected*, not error.

3. **Agent documents drift catalogs alongside commits.** X14.0 example: line drift +15/+18 from scoping (529→544, 307→325), agent re-anchored via ±5 line tolerance fallback (per §3.19 pattern lock), recorded the deviation in feedback memory entry for canonical capture. This is how memory stays drift-resistant over multi-sprint windows.

**Counter-patterns (anti-patterns to avoid):**

- **Founder middleman.** Manual Vercel dashboard work / Supabase UI introspection / file system ops on behalf of agent. Past lesson per memory: dashboard manual work caused parsing bugs, state confusion, multiple wrong-target redeploys. Agent CLI/code-side fix more reliable. Founder time spent on dashboard work is time NOT spent on synthesis / strategy / fundraise.
- **Claude (chat) executing operations.** Claude chat surface cannot run gh CLI, git ops, Supabase MCP migration applies in autonomous fashion at the required pace. Bottleneck = agent dispatch. Claude chat synthesizes + drafts prompts + reviews reports.
- **Skipping pre-flight gates.** High-stakes prompts without VTP section per §3.14 → drift damage risk. The 4-ironic-drift-catches metric above is **only possible** because pre-flight gates were integrated, not because agent intuited correctness.

**Cross-reference:** §3.14 VTP discipline methodology (operational protocol for prompt design); §2.6 memory-as-spec drift framework (gate-respect foundation); §2.9 velocity scale calibration (productivity differential rationale).

---

### 3.19 Sustained execution retrospective May 17-18 — 21+ hour thread

This section documents operational patterns surfaced across the May 17 evening → May 18 afternoon sustained execution thread. The thread spanned X10b chain-verify session start through X14.0 closure end, producing 19 cumulative PRs across two UTC calendar days and closing the T1+ mainnet blocker.

**Thread anatomy:**

| Window | PRs | Key outputs |
|---|---|---|
| May 17 morning | #104-117 batch (UR Pass 1 + CR1 + Tier 0 hotfixes) | Phase 1 wrap declarations, 4 audit-prep tracks merged |
| May 17 evening overnight | #121 (X10b chain-verify) + #122 (X20 scoping) + #123 (X14 scoping) + #124 (v1.5 supplement) + #125 (v1.5 chain-verified addendum) + #126 (audit packet asset set) + #127 (X11.5 sprint plan) | 7 PRs, X10b on-chain attribution case study canonical |
| May 18 UTC | #128 (X20.0a moves instrumentation) + #129 (SDK regen drift catch) + #130 (X14.0 class enforcement + T1+ MAINNET BLOCKER CLOSED) | 3 PRs, T1+ blocker closure |

**Output snapshot (May 18 EOD):**

- 19 PRs cumulative across two-day window
- T1+ MAINNET BLOCKER CLOSED via X14.0 (/v1/scores 501→200 lift)
- Audit packet asset set canonical (PR #126: README + threat-model + wallet-topology + chain-inspection + audit-firm-outreach-templates)
- X10b end-to-end chain-verify case study (canonical §3.15)
- X14.0 production-deployed + runtime-smoke-verified (deploy `dpl_7AsNVj...`, alias `api.skillos.network`)
- X20.0a production-deployed + browser e2e verified (moves column captured at submit `7370154e-b955-41a0-a990-c11d681d681a7`)
- Memory canonical: 3-layer drift framework + 5-layer post-merge verification chain (per §2.6 expansion)

**Six operational pattern locks (commit-ready memory candidates):**

#### Pattern lock 1 — Pre-flight ±5 line tolerance fallback

Drift-resilient prompts include line number ±5 tolerance window. May 17-18 evidence:

- X14.0 dual-cron emit sites: scoping specified `packages/duel-backend/src/cron/tournaments.ts:529` and `index-tournaments-created.ts:307`. Reality at impl time: lines 544 and 325 (drift +15 / +18). Agent caught via grep within ±5 window fallback, re-anchored, proceeded without blocking.
- Pattern: prompts cite line numbers as *anchor*, not *contract*. Tolerance window grep'leri agent'a "find the function regardless of position" semantik kazandırıyor.

Generalization: any prompt citing file:line should include fallback grep pattern in pre-flight section.

#### Pattern lock 2 — Multi-protective merge gate

Production state protected by stacked layers, not single gate:

1. **Branch protection (repo-level)** — `gh pr merge` requires PR + 1 approval (waived for solo founder) + CI green + branch up-to-date
2. **Agent main-lock self-check** — agent verifies current branch via `git branch --show-current` before destructive ops; refuses if on `main`
3. **Worktree topology awareness** — agent surfaces "main is held by another worktree" before attempting branch ops that require main checkout
4. **VTP pre-flight gates (per §3.14)** — repo + infra + runtime verification before action

No single gate is sufficient. Stack provides defense in depth.

#### Pattern lock 3 — PR count UTC calendar canonical

Agent's frame ("today UTC") > "cumulative" fluid frame.

May 18 case: Claude (chat) cited "19 cumulative PRs tonight + this morning" — drift-prone framing. Agent flagged: "Today UTC (2026-05-18) main = 3 PRs (#128, #129, #130). 16-PR gap likely from broader scope."

Resolution: **PR counts always UTC calendar day** going forward. Sustained-thread cumulative tallies → explicit window labeling (e.g., "May 17 morning batch + May 17 evening overnight + May 18 UTC = 19 PRs across two-day window"). No mixed framing.

Generalization: any metric crossing calendar boundary requires explicit window. Avoid "tonight" / "today" / "this session" without UTC anchor.

#### Pattern lock 4 — Temp-file pattern for multi-line commit / PR content

Shell heredoc paste fragility caused 4+ commit failures across the thread. Resolution: temp-file pattern.

```bash
# Multi-line commit body
git commit -F /tmp/commit-msg.txt

# Multi-line PR body
gh pr create --title "..." --body-file /tmp/pr-body.md
```

Evidence recurring at PR #125 (v1.5 addendum), PR #126 (audit packet), PR #129 (SDK regen), X14.0 implementation commit. Each instance, multi-line `-m "$(cat <<EOF...)"` heredoc silently no-op'd; temp-file pattern landed cleanly.

Generalization: **shell heredoc multi-line strings are anti-pattern** for git / gh CLI in agent prompts. Default to temp-file.

#### Pattern lock 5 — ApiError union widening at impl time

Type system gap detection during implementation, not scoping.

X14.0 case: scoping doc specified 403 class_mismatch enforcement on `/v1/scores`. Agent at impl time discovered `ApiError` union type at `apps/api/src/types/errors.ts` did not include 403 variant; widening required before route handler could throw it. Agent surfaced the type gap, widened the union to include 403 + 500 with discriminated payloads, then proceeded.

Pattern: scoping documents specify *behavior*; type system gaps are *implementation artifacts* invisible at scoping. Pre-flight check at impl: grep target type definition for required variants before assuming throw path works.

Generalization: any sprint that introduces new error code or response shape should include type widening pre-flight.

#### Pattern lock 6 — Post-merge production-readiness sequencing

After PR merge, production readiness requires ordered sequence:

```
1. Verify merge landed on origin/main (git fetch + git log)
2. Apply pending Supabase migration (if schema change) — MCP apply_migration
3. Verify migration applied (introspect column / table / RLS state)
4. Prebuilt apps/api deploy (per canonical recipe in memory)
5. Verify deploy aliased to production domain (vercel alias inspect)
6. Curl smoke endpoints (positive + negative paths)
7. Update memory canonical entries (sprint state + finalize banners)
8. Cleanup worktree + branches
```

Skipping step ordering causes silent gaps. X14.0 case: agent followed sequence rigorously, no production damage. Migration applied via Supabase MCP because all v2_*/v3_*/v4_* migrations don't match Supabase CLI's `<timestamp>_name.sql` pattern (canonical historical pattern, MCP is the canonical apply mechanism).

Generalization: every on-chain or production-touching sprint includes the 8-step sequence as default post-merge checklist.

**Cross-reference:** §3.14 VTP discipline methodology (pre-flight integration); §2.6 3-layer drift framework (memory-as-spec); §2.8 spec-codegen drift framework (PR #128 → #129 case); §3.18 agent delegation principle (role boundaries).

---

### 3.20 Architectural humility — "doğru niyet, yapısal kısıt" pattern

This section names a recurring SkillOS architectural theme: **instinct correct, structural constraint blocking.** Surfaced across multiple Phase 1 → Phase 2 transitions; canonicalized as a binding analytical frame for audit firm narrative and pitch transparency.

**The pattern:**

When the team is blocked on an outcome, distinguish:

1. **Founder / team error** — incorrect instinct, fixable via better design or implementation
2. **Structural constraint** — correct instinct, blocked by upstream ecosystem / library / standard limitation

The two require different responses. Founder/team errors get rebuild scope; structural constraints get architectural workaround OR honest disclosure + rebuild scope.

**May 17-18 canonical instances:**

#### Instance 1 — Stoplight X1 sprint :root override (May 18 reconnaissance)

X1 sprint (per memory `reference_vercel_monorepo_hono_playbook`) shipped `/docs` route with Stoplight Elements rendering and attempted theme override via `:root` CSS variable injection ("Pitch Black + Lime + Inter"). Visual output partially landed — some accents reached, but font family + method label colors + overall feel did not match SkillOS design language.

May 18 reconnaissance (PR-less analysis report at `/tmp/stoplight-customization-report.md`) revealed: **Stoplight Elements 8.4.6 ships zero theme/color/font props on `<elements-api>`, and its compiled `styles.min.css` does not declare its internal `--color-*` / `--font-*` tokens at `:root`.** The X1 sprint's cascade target was the host page; Stoplight's utility classes don't read from host page `:root` because the tokens aren't declared at `:root` to begin with.

**Verdict:** X1 instinct correct (theme via CSS variable cascade is the standard pattern); cascade target wrong (Stoplight Elements deliberately doesn't expose internal tokens at `:root`). Stoplight's own theming-and-branding feature is still on their roadmap (roadmap.stoplight.io/c/52), not shipped.

**Response (May 18 founder decision):** Defer Stoplight customization to Phase 3+ branding sprint. `/docs` apex MDX route (memory pending sprint, ~15-20h) takes priority because it carries brand surface (anti-cheat overview, Skillz-vs-Papaya, architecture pages). Audit-firm narrative integrity preserved via honest disclosure: "Stoplight Elements UI is dev tooling-grade reference; brand surface lives at apex `/docs` MDX route."

#### Instance 2 — Phase 1 AntiCheat formula plausibility (T5-3 verification, per §3.13)

CR1 R3 T5-3 verification sub-sprint (PR #111, May 17) revealed: AntiCheat formula plausibility (duration × moves × score) was **design intent never built in code.** The architectural specification existed in CLAUDE.md + scoping docs; the implementation skipped the formula gate at submit; Haiku-direct on-chain `flagScore` writes filled the gap on the duel path (irreversible, no confidence gate), with solo path having no on-chain AntiCheat at all.

**Verdict:** Design intent correct (deterministic formula plausibility = right architectural pattern); implementation gap (never built) = team error AND structural constraint compound. Team error: spec drift to code over Phase 1 velocity-first window. Structural constraint: irreversible Haiku writes were the only available mechanism in the absence of formula gate, baking in worse trust assumption than the spec intended.

**Response (May 17 X20 scoping per PR #122, codified §3.13):** Architectural rebuild scoped pre-mainnet — X20 sub-sprints F0 formula impl (both paths) + F1 confidence gate + F2 circuit-breaker + F4 Haiku off-chain advisory queue. Strategic lock: Option F (deterministic primary, no irreversible LLM verdicts on-chain at mainnet launch). Audit-firm disclosure language: *"Phase 1 testnet AntiCheat scope was limited: bounds + play-window checks (solo) + Haiku-direct on-chain flagScore (duel path, currently inactive). Formula plausibility was design intent never built. Pre-mainnet rebuild architectural per X20 sub-sprints F0-F4."*

**Pattern application — analytical frame:**

When blocked on an outcome, run this sequence:

1. **Articulate the gap** — what was intended, what shipped, where they diverge
2. **Diagnose the cause** — team error (rebuild scope) or structural constraint (workaround or disclosure)
3. **Frame response by cause type:**
   - Team error → assign rebuild scope, sprint queue, fix in canonical sprint
   - Structural constraint with workaround available → architectural workaround design
   - Structural constraint without workaround → honest disclosure + rebuild scope on different surface
4. **Document the analysis** — drift catalog memory entry, supplement section, audit-firm disclosure language
5. **Recover dignity through transparency** — instinct correct framing protects team confidence; structural constraint framing protects ecosystem trust

**Audit-firm narrative value:**

> *"We tried; here's why it didn't land; here's the rebuild scope."*

is structurally stronger than:

> *"We hadn't gotten to it."*

The first frames Phase 1 as deliberate learning under constraint; the second frames it as omission. SkillOS audit-firm narrative consistently selects frame 1, supported by §3.20 pattern analysis.

**Pitch transparency value:**

Skillz / Papaya $420M Lanham Act verdict (April 2026, US history's largest) established that operator opacity = $4.7B fraud. SkillOS pitch contrast: **transparency-first by design.** §3.20 pattern operationalizes transparency: every Phase 1 → Phase 2 gap gets honest articulation + diagnosis + rebuild scope, not concealment.

This is what "decentralization earned, not claimed" means at the operational level — visibility into what was built, what wasn't, why, and what's coming.

**Cross-reference:** §3.13 X20 AntiCheat rebuild scope (Instance 2 canonical); §3.16 X14 architectural posture (off-chain enforcement = workaround-available structural constraint resolution); CR1 R3 T5-3 verification PR #111 (root case study); X1 sprint memory `reference_vercel_monorepo_hono_playbook` (Stoplight context).

---

## UPDATE TO §4 — Sprint Sequence current state

Append the following section to §4, after v1.5 Sprint Sequence content:

---

**Sprint Sequence — current state (May 18, 2026 EOD, post-X14.0 closure):**

| Sprint | Status | Notes |
|---|---|---|
| X1-X7 — Layer 1A through Layer 3 reference apps | ✅ COMPLETE | Phase 1 dev surface foundation |
| X3.5 — SkillOS Skill Pack | ✅ COMPLETE | npm + mdskills.ai listing |
| Skill Pack v0.2 | ✅ COMPLETE | Capabilities + Quality + Security improved |
| X9 + X9.1 + X9.2 | ✅ COMPLETE | Tournament data layer, wallet preflight, burn rate |
| X10 — Server-side dataSuffix attribution (agent path) | ✅ COMPLETE + chain-verified | PR #82 May 14, clicker tx `0xd371ba4c` |
| **UR Pass 1 (Tracks A/B/C/D + T5-3 verification + X19 schema drift scope)** | ✅ COMPLETE | PRs #104-#112 May 17 |
| **Tier 0 hotfixes** (C1 SIWA gate, D top-3a RLS, Y1 env rename) | ✅ COMPLETE + verified prod | PRs #107, #108, #109 |
| **Quick-win PRs (architecture supplements + Q-W1 manifest fix + agent-runner cron)** | ✅ COMPLETE | PRs #118, #119, #120 May 17 |
| **CR1 Codebase Reality Pass 1 (R1/R2/R3/R4 + SYNTHESIS)** | ✅ COMPLETE | PRs #113-#117 May 17 |
| **X10b — Server-side dataSuffix attribution (human path)** | ✅ COMPLETE + chain-verified | PR #121 May 17, tx `0xa454eb5f...0a20` |
| **X20 scoping — AntiCheat rebuild F0-F4** | ✅ COMPLETE | PR #122 May 17, sub-sprint breakdown + 5 founder questions |
| **X14 scoping — Class-aware fairness X8** | ✅ COMPLETE | PR #123 May 17, sub-sprint breakdown + 12 founder questions |
| **v1.5 architecture supplement** | ✅ COMPLETE | PR #124 + chain-verified addendum PR #125 |
| **Audit packet asset set** | ✅ COMPLETE | PR #126 May 17 (README + 4 assets) |
| **X11.5 sprint plan — Multi-sig deployment** | ✅ COMPLETE (plan only) | PR #127 May 17 (4 sprint docs + Safe deploy stub + wallet-topology update) |
| **X20.0a — Moves instrumentation plumbing** | ✅ COMPLETE + browser e2e verified | PR #128 May 18 UTC, migration applied + smoke `submit 7370154e` moves=179 |
| **SDK regen — api.gen.ts catch-up** | ✅ COMPLETE | PR #129 May 18 UTC, spec-codegen drift caught (per §2.8) |
| **X14.0 — Class declaration + 403 enforcement + T1+ MAINNET BLOCKER CLOSED** | ✅ COMPLETE + production-deployed + runtime-smoke-verified | PR #130 May 18 UTC, deploy `dpl_7AsNVj...`, `/v1/scores` 501→200 lift |
| **v1.6 architecture supplement** | ⏳ IN REVIEW | This document |

**Phase 2 mainnet pre-req queue (agent-velocity estimates per §2.9):**

| Sprint | Effort (agent-velocity) | Status |
|---|---|---|
| X14.0b — Cron settle exclusion | 2-3 hours | Queued |
| X14.1-5 enforcement layers (extension whitelist + AI browser detect + biometrics + dishonor SBT + regression suite) | ~12-20 hours total | Queued |
| X20.0b — F0 formula pure function | 2-3 hours | Queued |
| X20.1-4 (solo enforcement + F1 advisory + F2 circuit-breaker + F4 Haiku off-chain) | ~18-26 hours total | Queued |
| X11 — v2.2 developer fee splitter contract | ~12-20 hours | Queued |
| X11.5 — Multi-sig deployment (agent code work) | ~8-12 hours (founder ceremony fraction non-scalable) | Queued; threshold decision pending founder |
| X15 — Agent retry payments | 4-6 hours | Queued |
| X15.5 — Rate limit infra (Upstash KV) | 4-6 hours | Queued (mainnet blocker) |
| X16 — Vercel path-filter migration | 2-3 hours | Queued |
| X19 — Schema reconciliation (9-item) | 4-6 hours | In progress |
| **Total agent-velocity** | **~70-110 hours = ~2-3 weeks sustained** | Engineering bottleneck collapsed (per §2.9) |

**Phase 2 funding-gated (Cluster 3 per CR1 SYNTHESIS):**

| Sprint | Effort | Cost | Status |
|---|---|---|---|
| X12 — External audit (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin) | 4-8 weeks | $50-150K | Pending fundraise (templates in `docs/audit-packet/skillos-audit-firm-outreach-templates.md`) |
| X13 — Cayman Foundation structuring | 4-8 weeks | $30-80K | Pending fundraise |

**Critical path observation (per §2.9 velocity calibration):**

Engineering pre-req queue (~2-3 weeks agent-velocity) is now shorter than audit firm timeline (4-8 weeks). **Fundraise becomes the dominant critical path** for mainnet Q3 2026 target. Engineering can run ahead, hold at "audit-ready" state, await capital.

---

## CHANGELOG TO APPEND — §9

After all existing changelog entries (v1.5, v1.4, v1.3, v1.2, v1.1, v1) at the end of the doc, prepend the v1.6 entry:

```
### v1.6 — 2026-05-18 (later same day, post-X14.0 closure)
- Added §2.8 Spec-codegen drift framework — sibling to §2.6 memory-as-spec
  drift. PR #128 → #129 canonical case study: feature PR adds SDK lib but
  skips api.gen.ts regenerate; post-merge git status catches drift.
  Three detection methodologies (post-merge review + CI regen+diff +
  worktree cycle artifact awareness). Generalizes beyond SDK to any
  auto-generated material kept in version control (TS types, ABI bindings,
  doc pages, embedded examples).
- Added §2.9 Velocity scale calibration invariant — founder-velocity vs
  agent-velocity ~10-15x on mechanical/well-scoped sprints. X14.0
  canonical: scoping estimate 2-3 days, agent actual ~3 hours.
  Implication: scoping doc estimates ÷10 when re-using for agent dispatch.
  Critical path observation: engineering bottleneck collapses, fundraise
  becomes dominant Phase 2 critical path.
- Added §3.18 Agent delegation principle — framework lock May 18, founder
  explicit declaration. Role assignment table: founder + Claude (chat) =
  strategy/synthesis/decision/design; agent = grep/git/migrate/deploy/
  verify. Interface protocol 7-step loop. Evidence: 19 PRs cumulative,
  4 ironic drift catches by agent, 100% VTP compliance, 0 production
  damage.
- Added §3.19 Sustained execution retrospective May 17-18 — 21+ saat
  thread, X10b chain-verify start + X14.0 closure end. Output snapshot:
  19 PRs, T1+ MAINNET BLOCKER CLOSED, audit packet asset set, X10b case
  study canonical, X14.0 production-deployed. Six operational pattern
  locks: ±5 line tolerance fallback, multi-protective merge gate, PR
  count UTC canonical, temp-file commit pattern, ApiError union widening,
  post-merge production-readiness sequencing (8-step).
- Added §3.20 Architectural humility "doğru niyet, yapısal kısıt" pattern
  — recurring SkillOS theme: instinct correct, structural constraint
  blocking. Two canonical instances: Stoplight X1 sprint cascade target
  (May 18 reconnaissance) + Phase 1 AntiCheat formula intent (T5-3
  verification). Analytical frame: articulate gap → diagnose cause →
  frame response by cause type → document analysis → recover dignity
  through transparency. Audit-firm narrative value: "we tried; here's
  why it didn't land; here's the rebuild scope" > "we hadn't gotten to it".
- Updated §4 Sprint Sequence: X14.0 + X20.0a + SDK regen COMPLETE with
  T1+ MAINNET BLOCKER CLOSURE callout. Phase 2 mainnet pre-req queue
  re-estimated at agent-velocity (~70-110 hours total = ~2-3 weeks
  sustained). Critical path observation: engineering pre-req shorter than
  audit firm timeline; fundraise dominant critical path.
```

---

## END OF SUPPLEMENT
