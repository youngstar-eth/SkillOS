# SkillOS Architecture Doc — Supplement v1.8 (May 20, 2026)

> **Purpose:** Add one §2.X invariant + four §3.X sections to `docs/architecture/developer-surface.md`:
> - §2.10 — Triangulation budget at sprint dispatch (NEW INVARIANT in v1.8 — founder-decided)
> - §3.25 — Sustained execution retrospective May 19-20 — ~25 hour thread (NEW in v1.8)
> - §3.26 — Pattern locks θ through ν — continuation of v1.7 §3.22 β-η series (NEW in v1.8)
> - §3.27 — Audit-narrative gold disclosures × 4 new (5-8) — §3.20 5-step frame applications (NEW in v1.8)
> - §3.28 — Drift catalog extension — May 19-20 instances + cross-window comparison (NEW in v1.8)
>
> Plus §4 Sprint Sequence update marking the May 19-20 backend hygiene wave + Wave 1 frontend visibility bundle + X23.3 SDK catch-up COMPLETE, F7 SkillOS-Games-Launcher repo + skillos.games domain live, F2 wallet UX DEFERRED-AS-TRACKED, X24 Codegen Discipline NEW sprint scoped (4-step), Phase 2 mainnet pre-req queue re-estimated.
>
> **Approval:** Founder approved May 20, 2026 (post x23-3 SDK fold canonical case study + GATE-4 §2.13→§2.10 invariant-numbering reconciliation).
>
> **Baseline:** v1.7 (May 19, 2026, post 37+ hour sustained execution thread; PR #148, blob `8c687d6a1c5d0c67ef8a9b805aa15392424ff00e`) remains the sustained-execution canonicalization layer. v1.8 is the **multi-surface triangulation canonicalization layer** capturing the May 19 02:30 UTC → May 20 03:00 UTC continuation window — specifically the post-v1.7-merge backend hygiene wave, the Wave 1 frontend visibility launch (new public repo + new live domain), and the x23-3 SDK-codegen fold whose drift-discovery → 4-phase resolution chain is the window's canonical case study.
>
> **Scope discipline:** v1.8 is **EXPANDED** — one new §2.X invariant (§2.10 Triangulation budget) is ADDED per explicit founder decision (rare exception; §2.X additions are founder-decided only per v1.7 scope-discipline rule). No cross-supplement refactor. Memory canonical entry updates restricted to §4 Sprint Sequence reflection.

---

## SECTION TO INSERT — §2.10 (NEW INVARIANT)

Insert after §2.9 (Velocity scale calibration invariant) in `docs/architecture/developer-surface.md`. This is the first §2.X invariant addition since §2.9; the on-disk invariant series advances §2.9 → §2.10.

> **Numbering note (GATE-4 reconciliation, self-demonstrating):** The draft spec for this invariant proposed §2.13, on the recollection that §2.12 was the latest invariant. Pre-flight GATE 4 triangulated three surfaces — claude.ai project memory (which carried §2.13), an on-disk `grep` of `docs/architecture/` (latest = §2.9), and a spec cross-check — and surfaced that §2.10–2.12 exist in project memory but were never synced to the on-disk supplements, which are the canonical artifact for the audit-firm packet and future-thread defense. Disk wins as the canonical state layer (per §2.6 three-layer framework, layer (b) git state). The new invariant is therefore numbered **§2.10**. The slip is catalogued as §3.28 instance v1.8-C3 — and is the **recursive canonical proof** of this very invariant: the Triangulation Budget invariant caught its own naming via the triangulation surface it mandates.

---

### 2.10 Triangulation budget at sprint dispatch

This invariant operationalizes the §2.6 memory-as-spec drift framework at **dispatch time** rather than at recovery time. Where §2.6 documents the three layers across which spec assumptions drift (claim / git-state / runtime), §2.10 makes multi-surface verification a **declared budget item** at the moment a sprint or high-stakes operation is scoped — not an ad-hoc rescue after drift has already cost a recovery cycle.

**Canonical statement:**

> *"For decisions touching production state, sprint dispatch must declare ≥2 verification surfaces. Single-surface decisions are permitted only for non-production state changes. Multi-surface triangulation is enforced at scoping, not at recovery."*

**Empirical basis:**

v1.7 §3.24 documented that 4 of 26 catalogued drifts (C5/P5, S4, Q3, Q4) required two or more surfaces to triangulate truth — single-surface detection would have missed or misframed them. The v1.7 synthesis (§3.24, signal 3) named "triangulation budget per sprint dispatch" as a v1.8+ canonicalization candidate. The May 19-20 thread supplied the confirming evidence: of 8 documented drift instances (§3.28), the highest-stakes three (v1.8-C1 commit-message PR-number error, v1.8-C3 invariant-number slip, v1.8-S2 cross-worktree orphan WIP) were each caught only because a second or third surface was consulted before the production-touching action. None reached post-merge.

**Operational definition — three surface categories:**

| Surface | What it is | Canonical probe | v1.8 instance caught |
|---|---|---|---|
| **Memory** | claude.ai project context, prior chat, agent claims, sprint-plan snippets | recall + cross-reference against the other two | v1.8-C3 (§2.13 memory recall) |
| **Repo** | on-disk git state — files, branches, blobs, `git show <ref>:<path>`, `git log` | `git`/`grep` against the working tree and refs | v1.8-C1 (PR #121 vs #130 via `git log origin/main`); v1.8-C2 (v1.7 via `git show main:<path>`) |
| **Runtime** | deployed behavior — endpoints, on-chain state, live OpenAPI spec | `curl` / `cast` / MCP introspection | v1.8-S1 (`api.skillos.network` ratings ahead of main) |

A decision touching production state must consult **≥2** of these three before dispatch. The strongest catches in the v1.8 window used all three (GATE-4: memory + repo + spec cross-check).

**Enforcement layer — dispatch, not recovery:**

The invariant binds at **scoping time**. A sprint plan or high-stakes prompt must name its verification surfaces as a pre-flight gate (the VTP "Verify-Then-Prompt" discipline of §3.14, extended). This is deliberately earlier than the §2.6 5-layer *post-merge* chain: post-merge verification confirms a shipped change; the triangulation budget prevents a wrong premise from ever being dispatched. The two compose — budget at the front, chain at the back.

**Exception cases (single-surface permitted):**

Single-surface decisions remain permitted for **non-production state changes** — local-only experiments, reversible working-tree edits, doc drafts pre-commit, branch creation, `git show`-based extraction. The cost of a wrong single-surface call on non-production state is a local redo, not a production incident or a durable false artifact. The x23-3 fold demonstrated the boundary: discarding an uncommitted regen (reversible, local) needed one surface; the commit message asserting "PR #121" (durable, public artifact) needed the repo surface that corrected it to #130.

**Audit-narrative value:**

The budget is itself an operator-transparency artifact. A sprint plan that declares "verification surfaces: repo (`git log origin/main`) + runtime (`curl openapi.json`)" before dispatch produces a paper trail showing the decision was triangulated before it touched production — the inverse of the Skillz/Papaya operator-opacity posture (§3.20, §3.27 Disclosure 6). The recursive case (v1.8-C3) is the gold instance: the invariant being defined caught its own naming drift through the surface it mandates.

**Cost-of-prevention math:**

Declaring ≥2 surfaces at dispatch costs sub-2-min (the same probes as §2.6). The avoided cost is a durable wrong artifact (a committed false PR reference is permanent on the public record; a mis-numbered invariant propagates through changelog + cross-references) or a production incident. The asymmetry mirrors §2.6: sub-2-min prevention vs 30-120-min recovery — but at the invariant layer the downside also includes audit-narrative damage that cannot be recovered by a re-run.

**Cross-reference:** §2.6 memory-as-spec drift 3-layer framework (the three surfaces map to §2.6 layers a/b/c); §2.8 spec-codegen drift framework; §2.9 velocity scale calibration; §3.14 VTP discipline (operationalizes triangulation into prompt design); §3.22 Pattern lock ε (SPEC-canonical-SOT at impl time — §2.10 extends SOT-discipline to dispatch time); §3.28 drift catalog (v1.8-C1/C2/C3/S1/S2 are the confirming instances).

---

## SECTIONS TO INSERT — §3.25, §3.26, §3.27, §3.28

Insert these four sections **after §3.24 (Drift catalog)** and **before §4 (Sprint Sequence)**.

---

### 3.25 Sustained execution retrospective May 19-20 — ~25 hour thread

This section documents the operational window from May 19 02:30 UTC (post-v1.7-merge, PR #148) through May 20 03:00 UTC (~25 hours), continuing the v1.7 §3.21 sustained-execution retrospective. The window is distinguished from prior windows by **breadth across surfaces** rather than depth in a single track: a backend hygiene wave on the monorepo, a frontend visibility launch that produced a new public repo and a new live consumer domain, and a SDK-codegen fold whose drift-discovery chain became the window's canonical case study. No sprint-cancel decisions in this window — all dispatched work executed.

**Cumulative thread anatomy (May 17 morning → May 20 morning UTC):**

| Window | PRs | Key outputs |
|---|---|---|
| May 17 (full day) | #104-127 batch | Phase 1 wrap + X10b on-chain attribution canonical |
| May 18 UTC | #128-144 | T1+ blocker closed; X11 hardening + X23 Glicko-2 + X20.0b shipped |
| May 19 UTC (v1.7 close) | #145 closed; B1 stash; **#148 (v1.7)** | 2 sprint-cancel artifacts + v1.7 supplement merged |
| May 19 02:30 → May 20 03:00 UTC (post-v1.7) | #146-157 range + Wave 1 launcher #1-3 + apex F1 | **v1.8 retrospective window** — backend hygiene + frontend visibility launch + x23-3 SDK fold |

**v1.8 window output snapshot (May 19 02:30 UTC → May 20 03:00 UTC):**

- **17 merged PRs** across the monorepo + companion repos (backend hygiene wave #146-157 range on `youngstar-eth/skillos`, including the v1.7 supplement #148 and the X19/X19a/X19b drift-reconciliation chain; Wave 1 frontend visibility PRs #1-3 on the new `SkillOS-Games-Launcher` repo + the apex F1 class-pill PR).
- **1 deferred-as-tracked** sprint (F2 wallet UX — WalletConnect path demand-gated, not canceled; F2.1 already fixed at `dd64b48`).
- **1 new public repo** — `SkillOS-Games-Launcher` (the consumer-facing launcher surface).
- **1 new live domain** — `skillos.games` DNS cut-over (consumer ecosystem surface per §3.27 Disclosure 7).
- **5 production migrations** (Supabase, forward-only).
- **`833c6216ab49fc582f910037ac90b5c4dfddf3fa`** — x23-3 SDK-types catch-up commit (the canonical case study; see §3.27 Disclosure 5 + §3.28).
- **0 production damage.**

**Two-track parallel execution structure:**

The window ran two disjoint tracks plus an emergent advisory thread:

```
Track A — backend hygiene (monorepo):   X19/X19a/X19b drift reconciliation,
                                          x14.1 audit log, x15.5 rate limiter,
                                          x20.1 solo F0 gate, v1.7 supplement
Track B — frontend visibility (Wave 1):  SkillOS-Games-Launcher repo + #1-3,
                                          apex F1 class pill, skillos.games DNS,
                                          F8 game-title canonical (#157)
Emergent — x23-3 SDK fold (advisory):     drift discovery → 4-phase resolution
                                          → X24 sprint scoped (this thread)
```

Track A and Track B had disjoint blast radius (monorepo backend vs launcher/apex frontend); the emergent x23-3 fold touched only `packages/sdk/src/api.gen.ts` on the `feat/x23-3-ratings-api` branch. No merge conflicts, no shared-package fan-out collisions.

**The x23-3 SDK fold — canonical case study (commit `833c621`):**

The emergent thread is the window's most instructive artifact because its value was a **drift discovery**, not a planned feature. Returning the mainline checkout to `main` surfaced that the mainline working tree was parked on a stale `chore/enable-ratings-cron` branch carrying an uncommitted `api.gen.ts` hand-edit. Investigation cascaded: the edit was the X14.0 `submitSoloScore` contract (not ratings); the same hand-edit was floating uncommitted across multiple worktrees; the `feat/x23-3-ratings-api` branch had shipped the ratings *server* (PR #141) but never regenerated the SDK types; and a live-spec regen reproduced the full contract (X23 ratings + X14.0) at +336/−11. Resolution was a 4-phase fold (preserve orphan as audit stash → fast-forward → regen → commit + push) gated by a 3-surface verification of the commit message that corrected an asserted "PR #121" to the actual "PR #130." The discovery seeded the X24 Codegen Discipline sprint (§4).

**What did NOT ship in v1.8 window (queued forward):**

- X11.5 multi-sig cutover ceremony + X11.6/X11.7 redeploy chain (founder-bound; blocks X22)
- X22 v2.3 bracket logic + redeployment (dependency-locked)
- X18-bundle Phase 2 redeploy (absorbs canceled B1 indexer + PR #145 alerting)
- X20.2-X20.4 enforcement layers
- X24 Codegen Discipline (NEW this window — scoped, queued; §4)
- F2 wallet UX WalletConnect path (deferred-as-tracked, demand-gated)

**Velocity observation continued from v1.7 §3.21:**

The v1.8 window shipped breadth — a new repo, a new live domain, a backend hygiene wave, and an emergent drift-resolution — without a single sprint-cancel and with zero production damage. Founder-velocity equivalent for the ~25-hour window (~17 PRs + 1 repo stand-up + 1 domain cut-over + 5 migrations) would be **~12-18 working days** at the §2.9 pre-agent baseline; achieved in roughly one calendar day. The cumulative May 17 → May 20 thread now spans **~62 hours** across four UTC calendar days. Engineering remains collapsed as the bottleneck (per §2.9); fundraise stays the dominant critical path (per v1.7 §4).

**Cross-reference:** v1.7 §3.21 (37+ hour retrospective baseline); §2.6 memory-as-spec drift framework; §2.8 spec-codegen drift framework; §2.9 velocity scale calibration; §2.10 triangulation budget (NEW — the x23-3 fold is its first canonical application); §3.18 agent delegation principle; §3.26 pattern locks θ-ν; §3.27 Disclosure 5.

---

### 3.26 Pattern locks θ through ν — continuation of v1.7 §3.22 β-η series

v1.7 §3.22 canonicalized six pattern locks (β-η) continuing the v1.6 §3.19 implicit α series. v1.8 continues the Greek-tag convention with six additional locks surfaced across the May 19-20 window. Where the β-η locks were predominantly *impl-time* discipline (import conventions, route order, SOT supremacy), the θ-ν locks are predominantly **dispatch-time and recovery-time** discipline — multi-agent isolation, memory hygiene, non-destructive recovery, and drift-cascade forensics — consistent with the §2.10 dispatch-budget direction.

#### Pattern lock θ — Shared-checkout race + isolated-worktree recovery

When multiple agents and a founder share a single mainline checkout, the working-tree branch can change underneath an agent mid-task; **re-verify `git branch --show-current` immediately before any commit or destructive operation**, and prefer isolated worktrees for concurrent feature work.

**Canonical instances:** Wave 1 launcher build-out (F7.1/F7.2/F7.4 catches) + x23-3 fold (May 20).

The x23-3 thread surfaced the mainline checkout (`/Users/inancayvaz/MAS`) parked on a stale branch (`chore/enable-ratings-cron`) that predated the v1.7 merge — an artifact of the shared checkout being left on whatever branch the last operation used. Every destructive step in the subsequent fold (discard, branch switch, stash) was guarded by a `git branch --show-current` race-check immediately prior. The Wave 1 launcher work, running concurrently across worktrees, applied the same guard.

**Cost-of-prevention:** one `git branch --show-current` probe (<5 sec) before each commit/destructive op vs a commit landing on the wrong branch or a discard wiping a concurrent agent's working tree.

**Generalization:** the memory canonical `feedback_shared_checkout_branch_race` captures this — shared checkouts with concurrent agents require a branch re-verify at the last possible instant, because branch state is not stable across the duration of a task.

#### Pattern lock ι — Memory-canonical duplicate prevention (agent self-discipline)

Before creating a memory entry or a canonical doc, **check whether the canonical artifact already exists** — agents drift toward authoring-new when an existing surface should be integrated against (the v1.7 §3.24 carry-forward candidate S3, now accumulating evidence).

**Canonical instance:** Wave 1 F7.1 case (May 19-20).

The launcher build-out surfaced a tendency to create fresh canonical entries for surfaces that already had a home. The discipline: grep/search the existing canonical set first; integrate or refine in place rather than spawning a near-duplicate. This is the same class as the v1.7 on-disk `§2.6`-defined-twice observation (refinement-in-place vs renumber) and directly informed the GATE-4 §2.10 reconciliation (check disk before asserting a new number).

**Cost-of-prevention:** one search of the canonical set before authoring vs a duplicate that later requires reconciliation (and itself becomes a drift instance).

**Generalization:** "author-new" is the default failure mode; "integrate-against-existing" is the disciplined default. Pairs with §2.10 (the repo surface check) and the v1.9 carry-forward S3 lock candidate.

#### Pattern lock κ — Brief-vs-apex canonical resolution

When the SkillOS monorepo and the apex/companion repo carry the same surface (copy, favicon, positioning), **the canonical source-of-truth must be named explicitly per surface** — the two repos are on intentionally different cadences and do not auto-propagate.

**Canonical instance:** Wave 1 F7.4 favicon decision (May 19-20).

The launcher/apex visibility work surfaced a copy/asset surface (the favicon "white S" mark) present in both the monorepo launcher and the apex repo. Per CLAUDE.md, apex tagline/phase-framing changes do not auto-propagate to the monorepo (or vice versa). The lock: for any shared surface, declare which repo is canonical for that specific item before editing, and check whether a sister update is needed in the other repo.

**Cost-of-prevention:** one canonical-SOT declaration per shared surface vs divergent copy/assets across two public-facing repos.

**Generalization:** two repos sharing one Vercel scope but separate codebases (per CLAUDE.md companion-repo section) require per-surface SOT declaration. This is §3.22 Pattern lock ε (SPEC-canonical-SOT) applied across the repo boundary rather than within a single repo.

#### Pattern lock λ — Non-destructive `git show <ref>:<path>` extraction

To obtain a file's canonical content from another branch without switching the working tree (and without disturbing a concurrent agent's checkout), use `git show <ref>:<path>` rather than `git checkout`.

**Canonical instance:** v1.7 supplement desktop copy (May 20).

A request to copy the v1.7 supplement surfaced that the file was absent from the working tree (the checkout was on a stale branch; §3.28 v1.8-C2). Rather than switch the founder's active branch, the file was extracted with `git show main:docs/architecture/supplements/architecture-doc-supplement-v1.7.md`, verified byte-identical via `git hash-object` against the canonical blob (`8c687d6a…`), and written out — with zero state change to the mainline checkout.

**Cost-of-prevention:** `git show <ref>:<path>` (read-only) vs a `git checkout` that switches a shared/active branch (a θ-class race) or a stash dance.

**Generalization:** any "get the canonical content of file X from ref Y" need on a shared checkout should use `git show` extraction, reserving `checkout` for when the working tree genuinely must move. Memory canonical: extraction-over-checkout for shared checkouts.

#### Pattern lock μ — Branch-state apparent-drift detection (working-tree drift ≠ memory drift)

When a file expected at a canonical path is "missing," **distinguish working-tree/branch state from genuine memory or repo drift** before concluding the canonical record is wrong — the file may simply be absent from the *currently checked-out branch's* working tree while present on `main`.

**Canonical instance:** v1.7 supplement "not on disk" (May 20; §3.28 v1.8-C2).

A pre-flight reported the v1.7 supplement absent from `docs/architecture/supplements/`. The naive read was "memory drift — v1.7 was never committed." The correct read: the mainline checkout was on `chore/enable-ratings-cron` (pre-v1.7-merge); the file was present on `main` and `origin/main` (identical blob). The apparent drift was a branch-state artifact, not a memory or repo drift. Triangulating the memory claim against `git show main:<path>` + `git ls-tree origin/main` resolved it in seconds.

**Cost-of-prevention:** one `git show main:<path>` / `git ls-tree` probe vs a false "memory drift" conclusion that could trigger an unnecessary re-author or escalation.

**Generalization:** "file missing" has at least three causes — branch state, working-tree state, genuine absence. Check branch state first (cheapest). Directly feeds §2.10 (repo surface) and the v1.8-C2 catalog entry.

#### Pattern lock ν — Cross-worktree drift-cascade survey

When an uncommitted edit is found in one worktree, **survey the other worktrees for the same drift** — a floating hand-edit (especially to a generated artifact) tends to propagate across checkouts and accumulate as duplicate stashes.

**Canonical instance:** `api.gen.ts` 3-worktree forensic (May 20; §3.28 v1.8-S2 + v1.8-P2).

The x23-3 fold found the same X14.0 `submitSoloScore` hand-edit uncommitted in two places (the stale `chore/enable-ratings-cron` mainline checkout and the `feat/x23-3-ratings-api` worktree), and the stash-queue forensic found three near-identical x15-era `api.gen.ts` snapshots (`@{2}/@{3}/@{4}`) captured within ~3 hours on May 15 — a drift cascade, not a single instance. Surveying by content (not by stash index) revealed the true blast radius: four `api.gen.ts` stashes, not the assumed three (§3.28 v1.8-P2).

**Cost-of-prevention:** a content-keyed survey across worktrees/stashes (minutes) vs repeatedly re-discovering the same floating edit and clobbering it in one place while it persists in another.

**Generalization:** generated artifacts hand-edited across worktrees are the highest-risk cascade surface. The survey is the forensic precursor to the X24 Codegen Discipline sprint (regen-only enforcement; §4). Memory canonical: cross-worktree forensic before acting on any single uncommitted generated-file edit.

**Cross-reference:** v1.7 §3.22 implicit α + β-η pattern locks; §2.10 triangulation budget (θ/μ/ν are repo-surface disciplines; λ is the non-destructive probe); §3.18 agent delegation principle; memory canonical entries `feedback_shared_checkout_branch_race`, `feedback_write_absolute_path_bypass`; §3.27 Disclosure 5; §3.28 drift catalog.

---

### 3.27 Audit-narrative gold disclosures × 4 new — §3.20 5-step frame applications

v1.8 applies the §3.20 "doğru niyet, yapısal kısıt" 5-step frame (articulate gap → diagnose cause → frame response by cause type → document analysis → recover dignity through transparency) to four new disclosures (5-8), continuing the v1.7 §3.23 series (Disclosures 1-4).

#### Disclosure 5 — Spec-codegen drift operational chain (X14.0 SDK catch-up → X24)

**Articulate the gap.** The X14.0 server code (tournament class declaration + `submitSoloScore` contract: `tournamentClass`/`tier`/`isAgent`/`classTag` + 403/404/409/429 responses) merged via PR #130 (May 18) and X23.3 ratings server endpoints merged via PR #141 — but in both cases the SDK consumer types in `packages/sdk/src/api.gen.ts` were **not regenerated**. The deployed contract at `api.skillos.network` drifted ahead of the committed SDK types. The gap surfaced only when an unrelated branch-return operation tripped over a stale `api.gen.ts` hand-edit.

**Diagnose the cause.** Compound structural constraint + process gap: `api.gen.ts` is a single full-contract generated artifact (regenerated from the live OpenAPI spec), but no enforcement bound regeneration to the server-side merges that changed the contract. In the absence of a regen gate, the contract delta was instead carried as **uncommitted hand-edits** — and those hand-edits propagated across worktrees (the X14.0 `submitSoloScore` delta appeared uncommitted in two checkouts) and accumulated as duplicate stashes (four `api.gen.ts` stashes total; §3.28 v1.8-S2/P2). Hand-editing a "do not edit by hand" generated file was the process anti-pattern; the missing CI regen gate was the structural enabler.

**Frame response.** Resolution executed as a 4-phase fold on `feat/x23-3-ratings-api` (commit `833c6216ab49fc582f910037ac90b5c4dfddf3fa`): preserve the orphan hand-edit as an audit-labeled stash → fast-forward to origin → regenerate from the live spec (+336/−11, reproducing both the X23 ratings types and the X14.0 contract canonically) → commit + push, gated by a 3-surface verification of the commit message. The discovery seeded the **X24 Codegen Discipline sprint** (4-step: stash audit + drop, pre-commit hand-edit ban on `*.gen.ts`, CI `generate-types` + `git diff --exit-code` guard, regen-only ADR; §4).

**Document the analysis.** Commit `833c621`; §3.25 (window case study); §3.26 Pattern locks θ/λ/μ/ν; §3.28 instances v1.8-S1/S2/P1/P2/P3; §2.8 spec-codegen drift framework (the canonical home; v1.8 supplies the operational-chain evidence the v1.7 §3.24 P1 case anticipated); X24 sprint scope (§4).

**Recover dignity through transparency.** The drift catch is published as architecture evidence, not hidden. Audit-firm language: *"SkillOS detected a spec-codegen drift (SDK consumer types lagging the deployed contract after PRs #130 and #141) during an unrelated branch operation. Resolution preserved the orphan hand-edit as an audit artifact, regenerated the types canonically from the live OpenAPI spec, and gated the commit on a 3-surface verification that corrected a misremembered PR reference (#121 → #130) before it reached the public record. The discovery was converted into a scoped enforcement sprint (X24) so the class of drift cannot recur silently."* The 3-surface gate (§2.10) is the operator-transparency artifact: a wrong fact was caught before it became durable.

#### Disclosure 6 — Public marketing narrative pivot (defensive → offensive)

**Articulate the gap.** Earlier external-facing framing leaned on the Skillz/Papaya $420M Lanham Act verdict as a defensive contrast ("we are not the opaque operator"). Defensive framing centers the competitor's failure rather than SkillOS's own verifiable properties.

**Diagnose the cause.** Not a defect — a positioning maturation. The defensive frame was correct for the early audit-narrative window (it established the transparency contrast). As the verifiable surface matured (permissionless funding, protocol-layer non-custody, on-chain attribution, agent-class parity), the narrative could stand on its own assertions rather than on the competitor's adjudicated opacity.

**Frame response.** The Papaya/Skillz $420M reference was dropped from external marketing (May 19). Positive framing canonicalized: **verifiable + permissionless + protocol-layer + agent-era infrastructure**. Defensive → offensive. The competitor contrast remains available for the audit-firm packet (where the adjudicated-fraud comparison is materially relevant), but is not the public-facing lede.

**Document the analysis.** apex `lib/apex.ts` positioning; this disclosure; v1.6 §3.20 + v1.7 §3.23 Disclosure 4 (where the Skillz/Papaya contrast was the explicit frame — v1.8 marks the pivot away from it for public copy). Audit-firm packet usage of the contrast is TBD per future founder call.

**Recover dignity through transparency.** The pivot is itself disclosed rather than silently executed: *"SkillOS moved its public narrative from a defensive transparency-contrast (vs the Skillz/Papaya verdict) to an offensive statement of its own verifiable properties as the verifiable surface matured. The competitor comparison is retained only where materially relevant (audit-firm packet), not as public-facing positioning."* Honest framing > overclaim (per the decision-priority order): the pivot does not claim new capabilities, it reframes shipped ones.

#### Disclosure 7 — Domain semantics canonical (.network vs .games)

**Articulate the gap.** With `skillos.games` going live (Wave 1) alongside the existing `skillos.network` apex/api surface, the two-domain topology needed an explicit audience-separation invariant — without it, the surfaces blur (which audience does each serve?).

**Diagnose the cause.** Structural, by design: the platform is three-sided (players, sponsors, AI-data consumers / agents) and the surfaces serve different audiences. Two domains encode the separation, but the semantics had not been canonicalized.

**Frame response.** Domain-semantics invariant locked:
- **`.network` = protocol / developer surface** — apex marketing, `api.skillos.network`, future docs/MCP surfaces. The audience is developers, agents, and the audit/protocol layer.
- **`.games` = consumer ecosystem** — apex launcher (`SkillOS-Games-Launcher`), the six game apps, the sponsor dashboard. The audience is players and sponsors.

Ten functional surfaces total across the two domains. Audience separation is treated as an architectural invariant, not a cosmetic split.

**Document the analysis.** This disclosure; CLAUDE.md two-phase-numbering + companion-repo sections; apex `lib/apex.ts`; Wave 1 launcher repo + `skillos.games` DNS cut-over (§3.25).

**Recover dignity through transparency.** *"SkillOS operates two domains by audience design: `.network` for the protocol/developer surface (apex, API, docs/MCP) and `.games` for the consumer ecosystem (launcher + games + sponsor). The separation is an architectural invariant reflecting the three-sided platform, not a marketing accident."* The clarity is the artifact: a reader can map any surface to its audience.

#### Disclosure 8 — Protocol + translation-layer dual role ("backend proves, frontend translates")

**Articulate the gap.** SkillOS's value is simultaneously a **protocol** (non-custodial contracts, segregated sweepstakes accumulators, on-chain attribution) and a **translation layer** that makes those protocol guarantees legible to non-technical players. The risk is presenting the protocol depth without the translation, or the translation without the proof.

**Diagnose the cause.** Not a defect — a dual-role positioning that needed naming. The backend invariants (e.g., separate storage slots for retry fees vs prize pools per CLAUDE.md invariant #1) are the proof; the frontend surfaces (class pill, exclusion tooltip, builder mark — Wave 1 F1/F5/F4) are the translation. Each alone undersells the whole.

**Frame response.** Positioning canonicalized as **"Chainlink-of-skill-economy"**: purposeful infrastructure that other surfaces build on, with a frontend that is *purposeful, not absent*. Canonical illustration: the **class pill is ~2 pixels and 0 jargon, yet communicates the same agent/human-parity commitment as a 200-line Foundry test** — the backend proves the invariant, the frontend translates it into a glance. "Backend proves, frontend translates."

**Document the analysis.** This disclosure; Wave 1 visibility bundle (F1 class pill + F5 exclusion tooltip + F4 builder mark, PR #156 `04d7d1f`; F8 game-title canonical, PR #157 `a65e393`); CLAUDE.md architectural invariants #1/#3 (the proofs being translated).

**Recover dignity through transparency.** *"SkillOS is both a protocol and a translation layer. The backend proves invariants (segregated sweepstakes accumulators, agent-class parity, on-chain attribution); the frontend translates them into legible surfaces (a 2-pixel class pill carries the same commitment as a 200-line Foundry test). The frontend is purposeful, not an afterthought — it is the translation half of the dual role."* The framing claims no new capability; it names the relationship between two shipped halves.

---

### 3.28 Drift catalog extension — May 19-20 instances + cross-window comparison

This section extends the v1.7 §3.24 four-category taxonomy (claim / state / spec / scope-premise drift) with the instances surfaced in the May 19-20 window. The headline cluster is the **May 20 x23-3 advisory thread**, which produced 8 documented instances — notable for a **zero post-merge** catch rate (every instance caught at pre-flight or impl time) and for instance v1.8-C3 being a **recursive self-demonstration** of the §2.10 invariant defined in this same supplement.

**May 20 x23-3 thread instances (8 documented):**

| ID | Class | Instance | Detection |
|---|---|---|---|
| **v1.8-C1** | Claim drift (memory) | Commit message asserted X14.0 server merged via **PR #121**; #121 is X10b (`sprint/x10b-human-path-datasuffix`) | Repo-surface triangulation pre-commit (`git log origin/main`) — corrected to **PR #130** before the durable artifact landed |
| **v1.8-C2** | Claim drift (memory) | "v1.7 supplement is missing from disk" → branch-state artifact, not memory drift | Pre-flight `git show main:<path>` + `git ls-tree origin/main` (blob `8c687d6a…` present on `main`) |
| **v1.8-C3** | Claim drift (memory → disk) | Draft spec proposed §2.13 for the new invariant; on-disk latest is §2.9 | GATE-4 3-surface triangulation (project memory + on-disk `grep` + spec cross-check) → renumbered **§2.10**. *Recursive: the Triangulation Budget invariant caught its own naming via the surface it mandates.* |
| **v1.8-S1** | State drift (deploy) | `api.skillos.network` OpenAPI spec served ratings + X14.0 contract ahead of the committed SDK types on `main` | Runtime-surface probe (`curl openapi.json`) during investigation |
| **v1.8-S2** | State drift (cross-worktree) | Same X14.0 `submitSoloScore` hand-edit uncommitted across multiple worktrees | Cross-worktree forensic ownership analysis (§3.26 Pattern lock ν) |
| **v1.8-P1** | Spec drift (codegen) | X14.0 + X23 SDK catch-up gap — server merged (PR #130/#141) but `api.gen.ts` never regenerated | Post-discard live-spec regen test (+336/−11) |
| **v1.8-P2** | Scope/premise drift (plan) | Stash-audit premise "3 `api.gen.ts` stashes" → actually 4 (`@{4} pre-x15.3` also touches the file) | `git stash list` content enumeration (not index assumption) |
| **v1.8-P3** | Scope/premise drift (plan) | Audit-loop hardcoded `for i in 0 1 2` → real `api.gen.ts` stashes at `@{0}/@{2}/@{3}/@{4}` | Content-keyed stash filtering replaced index-keyed iteration |

*Taxonomy note: per v1.7 §3.24, spec drift uses the P-prefix and scope/premise drift the Q-prefix. The v1.8 thread's premise drifts (stash-count P2, loop-index P3) are retained under the founder-assigned P-IDs for this window's catalog continuity; they are scope/premise-class by content. v1.9 may renormalize the prefix scheme.*

**Wave 1 instances (referenced; detailed in the Wave 1 retro):** the F7.1/F7.2/F7.4 catches behind §3.26 Pattern locks ι (memory-canonical duplicate prevention), κ (brief-vs-apex canonical resolution), and θ (shared-checkout race) are catalogued in the Wave 1 launcher retrospective and cross-referenced here rather than duplicated.

**Catalog observations (May 20 thread):**

- **Detection mechanism:** 5/8 caught at pre-flight (C1/C2/C3/S1/S2 — repo + runtime + memory surfaces), 3/8 caught at impl/execution time (P1 regen test, P2/P3 stash forensic). **0/8 reached post-merge.**
- **Triangulation evidence:** the three highest-stakes instances (C1, C3, S2) each required ≥2 surfaces; C3 required all three. This is the direct empirical basis for §2.10.
- **Memory-drift dominance:** 3/8 are claim/memory drift (C1/C2/C3) — the v1.8 window's signature is *memory-vs-reality* drift caught by repo/runtime cross-check, distinct from the v1.7 window's spec-drift dominance.

**Cross-window comparison vs v1.6/v1.7:**

| Window | Drift instances | Caught pre-impl | Caught at impl | Caught post-merge |
|---|---|---|---|---|
| v1.6 (May 17-18, 21+ hrs, 19 PRs) | ~14 inferred | ~5 (36%) | ~5 (36%) | ~4 (29%) |
| v1.7 (May 18-19, 11.5 hrs active, 13 PRs + 2 cancels) | 26 documented | 13 (50%) | 8 (31%) | 5 (19%) |
| v1.8 (May 19-20, ~25 hrs, x23-3 thread) | 8 documented | 5 (62%) | 3 (38%) | **0 (0%)** |

The pre-impl catch rate continues its climb (36% → 50% → 62%) and post-merge catches reach **zero** in the v1.8 thread — the strongest signal yet that triangulation-at-dispatch (§2.10) is doing measurable work. Caveat: the v1.8 figure is from a single advisory thread (8 instances), a smaller sample than the v1.7 window's 26; the trend is directional, and v1.9 should re-measure across a full multi-track window.

**Synthesis — what the v1.8 catalog tells us about v1.9+ direction:**

1. **Memory drift is the new dominant class.** Where v1.7 was spec-drift-dominant (sprint plans drifting from SPEC.md), v1.8 is memory-drift-dominant (recall drifting from disk/runtime). v1.9+ candidate: a standing pre-flight "memory-vs-disk reconciliation" probe for any sprint that cites a PR number, section number, or canonical path from memory.
2. **The triangulation budget proved itself recursively.** §2.10 was canonicalized in this supplement and its own naming was caught by the invariant's mandated surface (v1.8-C3). This is the strongest possible adoption evidence — and the v1.9 candidate is to make the surface-declaration a literal field in the sprint-plan template.
3. **Generated-artifact discipline graduated from observation to sprint.** The v1.7 §3.24 carry-forward candidate S3 (existing-artifact integration) and the §2.8 spec-codegen framework converged into the X24 Codegen Discipline sprint. v1.9 should report X24 completion and re-evaluate whether S3 is now a fully-locked pattern.

**Carry-forward candidates (updated from v1.7 §3.24):**

- **S3 — existing-contract/artifact integration vs author-new** — v1.8 supplied a second instance (the `api.gen.ts` case = integrate-against-existing-generated-artifact, not author-new). With two windows of evidence, S3 is a **v1.9 lock candidate** (would become a named pattern lock once X24 ships the enforcement).
- **P6 — Vercel Hobby-tier cron cadence ceiling** — no new v1.8-window evidence; stays single-instance.
- **Q5 — test-file path convention** — no new v1.8-window evidence; stays single-instance.

**Cross-reference:** §2.6 memory-as-spec drift framework; §2.8 spec-codegen drift framework (Disclosure 5 operational-chain home); §2.10 triangulation budget (C1/C2/C3/S1/S2 are its confirming instances; C3 is its recursive proof); §3.18 agent delegation principle; §3.22 β-η + §3.26 θ-ν pattern locks (θ/λ/μ/ν cover the v1.8 state/claim instances); §3.27 Disclosure 5.

---

## UPDATE TO §4 — Sprint Sequence current state

Append the following section to §4, after v1.7 Sprint Sequence content:

---

**Sprint Sequence — current state (May 20, 2026, post May 19-20 ~25 hour thread):**

| Sprint | Status | Notes |
|---|---|---|
| (All v1.7 baseline rows preserved with status carried forward) | | |
| **v1.7 architecture supplement** | ✅ COMPLETE | PR #148 May 19 (blob `8c687d6a…`) |
| **X19 — Schema reconciliation (9-item)** | ✅ COMPLETE | PR #150 May 19 (drift fix + CI/CODEOWNERS/pre-push lock policy) |
| **X19a — Drift-check workflow auth** | ✅ COMPLETE | PR #153 May 19 (PostgREST → Management API; Phase 2 pre-req gate ACTIVE) |
| **X19b — Drift reconciliation (Class A1 restore + X20.0a normalization)** | ✅ COMPLETE | PR #154 May 19 (30 files == 30 registry rows; drift gate green) |
| **X15.5 — Upstash-backed rate limiter** | ✅ COMPLETE | PR #151 May 19 (closes UR Pass 1 Track B C2; unblocks per-endpoint tuning) |
| **X14.1 — Extension whitelist soft-warning + server audit log** | ✅ COMPLETE | PR #152 May 19 |
| **X20.1 — Solo path F0 formula gate at submit** | ✅ COMPLETE | PR #146 May 19 (AntiCheat enforcement first dimension) |
| **CLAUDE.md drift sweep** | ✅ COMPLETE | PR #149 May 19 (3 stale claims fixed) |
| **Visibility-pass reconnaissance (findings-only)** | ✅ COMPLETE | PR #155 May 19 (`dad1a09`; frontend surface gap analysis) |
| **Wave 1 visibility bundle (F1 class pill + F5 exclusion tooltip + F4 builder mark)** | ✅ COMPLETE | PR #156 May 19 (`04d7d1f`) |
| **F8 — Game title canonical (6 subdomain titles)** | ✅ COMPLETE | PR #157 May 19 (`a65e393`; Phase 2 reality alignment) |
| **F7 — SkillOS-Games-Launcher (new public repo + Wave 1 #1-3 + DNS)** | ✅ COMPLETE | New public repo + Wave 1 launcher PRs #1-3 + `skillos.games` DNS cut-over (§3.27 Disclosure 7) |
| **F2 — Wallet UX** | ✅ DEFERRED-AS-TRACKED | F2.1 fixed (`dd64b48`); F2.2 WalletConnect demand-gated (not canceled; revisit trigger = consumer demand) |
| **X23.3 — SDK types catch-up (ratings + X14.0 contract sync)** | ✅ COMPLETE | Commit `833c6216ab49fc582f910037ac90b5c4dfddf3fa` May 20 (on `feat/x23-3-ratings-api`; +336/−11 regen from live spec; §3.27 Disclosure 5) |
| **X24 — Codegen Discipline (NEW)** | ⏳ QUEUED | Phase 2 pre-req; 4-step scope locked (below); emergent from x23-3 fold |
| **v1.8 architecture supplement** | ⏳ IN REVIEW | This document |

**X24 — Codegen Discipline sprint scope (locked, emergent from x23-3 fold):**

| Sub-sprint | Action | Effort |
|---|---|---|
| **X24.1** | Stash audit + drop: verify `@{0}` (x14.0 orphan) content == committed `833c621` → drop; verify x15-era `/v1/agents/matches/start-solo` is live + committed → triple-drop `@{2}/@{3}/@{4}` | ~30 min |
| **X24.2** | Pre-commit hook banning hand-edits to `*.gen.ts` (the "do not edit by hand" banner already exists — enforce it) | ~30 min |
| **X24.3** | CI guard: `npm run generate-types` + `git diff --exit-code` on `packages/sdk` so spec↔SDK drift fails the build instead of accumulating as WIP | ~1 hr |
| **X24.4** | ADR: "generated artifacts are regen-only, never hand-edited" | ~20 min |
| **Acceptance** | stash queue has 0 `api.gen.ts` entries; CI fails on uncommitted regen drift; ADR merged | ~3 hr total |

**Phase 2 mainnet pre-req queue (agent-velocity estimates per §2.9, updated):**

| Sprint | Effort (agent-velocity) | Status |
|---|---|---|
| X11.5 — Multi-sig cutover ceremony (agent code work) | ~8-12 hours (founder ceremony fraction non-scalable) | Queued; threshold decision pending founder |
| X11.6 — v2.2 deploy script + redeployment integration | ~3-5 hours | Queued (blocks X22) |
| X11.7 — TournamentPool v2.2 redeployment to Base Sepolia | ~2-3 hours | Queued (blocks X22) |
| X14.2-5 enforcement layers | ~10-16 hours total | Queued |
| X20.2-4 (F1 advisory + F2 circuit-breaker + F4 Haiku off-chain) | ~14-20 hours total | Queued |
| X16 — Vercel path-filter migration | 2-3 hours | Queued |
| X18-bundle — Phase 2 redeploy bundle (indexer reset + alerting integration) | ~10-15 hours | Queued (replaces canceled B1 + PR #145) |
| **X24 — Codegen Discipline (NEW)** | **~3 hours** | **Queued (emergent from x23-3 fold)** |
| X22 — v2.3 bracket logic + redeployment | TBD (post X11.5-X11.7 chain) | Queued (dependency-locked) |
| **Total agent-velocity** | **~73-115 hours = ~2.5-3 weeks sustained** | Engineering bottleneck collapsed (per §2.9); fundraise remains dominant critical path (per v1.7 §4) |

**Critical path observation (per §2.9 + v1.7 §4):**

The engineering pre-req queue (~73-115 hours = ~2.5-3 weeks agent-velocity, now including X24) remains shorter than the audit-firm timeline (4-8 weeks). **Fundraise stays the dominant critical path** for the mainnet target. The v1.8 window did not alter this — the backend hygiene wave, Wave 1 visibility launch, and x23-3 SDK fold shipped without consuming fundraise-dependent slots; X24 (~3h) is the only net addition to the queue.

---

## CHANGELOG TO APPEND — §9

Prepend the v1.8 entry before the v1.7 entry:

```
### v1.8 — 2026-05-20 (post May 19-20 ~25 hour sustained execution thread)
- Added §2.10 NEW INVARIANT (founder-decided; rare §2.X exception):
  Triangulation budget at sprint dispatch — for production-state
  decisions, ≥2 verification surfaces required (memory / repo /
  runtime). Single-surface permitted only for non-production state
  changes. Enforced at scoping, not at recovery. Operationalizes the
  §2.6 3-layer framework at dispatch time. NOTE: drafted as §2.13 on
  memory recall; GATE-4 triangulation found on-disk latest = §2.9 and
  renumbered to §2.10 — the invariant caught its own naming drift via
  the surface it mandates (recursive proof; catalogued §3.28 v1.8-C3).
- Added §3.25 Sustained execution retrospective May 19-20 — ~25 hour
  thread: 17 merged PRs + 1 deferred-as-tracked (F2 wallet UX) + 1 new
  public repo (SkillOS-Games-Launcher) + 1 new live domain
  (skillos.games) + 5 prod migrations + 0 production damage. Two-track
  (backend hygiene + Wave 1 frontend visibility) plus the emergent
  x23-3 SDK fold canonical case study (commit 833c621; drift discovery
  → 4-phase resolution → X24 sprint scoped). Cumulative May 17→20
  thread ~62 hours across four UTC calendar days.
- Added §3.26 Pattern locks θ through ν (continuation of v1.7 §3.22
  β-η — dispatch/recovery-time discipline):
  θ — Shared-checkout race + isolated-worktree recovery
      (re-verify git branch before destructive ops; Wave 1 F7.* + x23-3)
  ι — Memory-canonical duplicate prevention (integrate-against-existing
      over author-new; Wave 1 F7.1)
  κ — Brief-vs-apex canonical resolution (per-surface SOT across the
      two-repo boundary; Wave 1 F7.4 favicon)
  λ — Non-destructive git show <ref>:<path> extraction (v1.7 desktop
      copy without switching the shared checkout)
  μ — Branch-state apparent-drift detection (working-tree drift ≠
      memory drift; v1.7 "missing from disk" → branch-state artifact)
  ν — Cross-worktree drift-cascade survey (api.gen.ts 3-worktree +
      4-stash forensic; precursor to X24)
- Added §3.27 Audit-narrative gold disclosures × 4 new (§3.20 5-step
  frame):
  (5) Spec-codegen drift operational chain (X14.0 SDK catch-up gap →
      833c621 fold → X24 sprint; closes the §2.8 P1 operational arc)
  (6) Public marketing narrative pivot (Papaya/Skillz $420M reference
      dropped from external marketing; defensive → offensive positioning)
  (7) Domain semantics canonical (.network protocol/dev surface vs
      .games consumer ecosystem; 10 functional surfaces; audience
      separation as invariant)
  (8) Protocol + translation-layer dual role ("backend proves, frontend
      translates"; class pill = 2px + 0 jargon == 200-line Foundry test)
- Added §3.28 Drift catalog extension — May 19-20 instances (8 from the
  x23-3 thread: C1 PR#121→#130, C2 v1.7 branch-state artifact, C3
  §2.13→§2.10 recursive self-proof, S1 deploy-ahead-of-main, S2
  cross-worktree orphan WIP, P1 SDK catch-up gap, P2 3→4 stash count,
  P3 loop-index hardcode), 4-category taxonomy continued. Detection:
  5/8 pre-impl, 3/8 at impl, 0/8 post-merge. Cross-window pre-impl
  catch rate 36% → 50% → 62%; post-merge → 0%. Memory drift is the new
  dominant class. S3 (existing-artifact integration) → v1.9 lock
  candidate with second instance.
- Updated §4 Sprint Sequence: May 19-20 backend hygiene wave COMPLETE
  (X19/X19a/X19b + X15.5 + X14.1 + X20.1 + CLAUDE.md sweep); Wave 1
  visibility bundle + F8 + F7 launcher repo + skillos.games COMPLETE;
  F2 wallet UX DEFERRED-AS-TRACKED; X23.3 SDK catch-up COMPLETE
  (833c621); X24 Codegen Discipline NEW (4-step scope locked); Phase 2
  pre-req queue ~73-115 agent-hours (+X24 ~3h); fundraise stays
  dominant critical path.
- Added §2.10 invariant per founder decision (EXPANDED scope — the
  first §2.X addition since §2.9; rare exception to the additive
  scope-discipline rule).
- Memory canonical entry updates restricted to §4 Sprint Sequence
  reflection per scope discipline.
```

---

## END OF SUPPLEMENT
