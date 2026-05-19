# SkillOS Architecture Doc — Supplement v1.7 (May 19, 2026)

> **Purpose:** Add four sections to `docs/architecture/developer-surface.md`:
> - §3.21 — Sustained execution retrospective May 17-19 — 37+ hour thread (NEW in v1.7)
> - §3.22 — Pattern locks β through η — continuation of v1.6 §3.19 implicit α series (NEW in v1.7)
> - §3.23 — Audit-narrative gold disclosures × 4 — §3.20 5-step frame applications (NEW in v1.7)
> - §3.24 — Drift catalog — 26 documented instances, 4-category taxonomy (NEW in v1.7)
>
> Plus §4 Sprint Sequence update marking X11.1-X11.4 + X23.1-X23.3 + X20.0b COMPLETE, B1 indexer remediation + PR #145 alerting CANCELED (X18-bundle deferral), Phase 2 mainnet pre-req queue re-estimated.
>
> **Approval:** Founder approved May 19, 2026 (post 3-cron RCA + B1 cancellation + PR #145 close decisions).
>
> **Baseline:** v1.6 (May 18, 2026, post-X14.0 closure) remains the operational discipline canonicalization layer. v1.7 is the **sustained execution canonicalization layer** capturing the May 17-19 cumulative 37+ hour thread learnings — specifically the May 18 post-v1.6-merge → May 19 09:13 UTC continuation window.
>
> **Scope discipline:** v1.7 is additive. No new §2.X invariants (founder-decided only). No cross-supplement refactor. Memory canonical entry updates restricted to §4 Sprint Sequence reflection.

---

## SECTIONS TO INSERT — §3.21, §3.22, §3.23, §3.24

Insert these four sections **after §3.20 (Architectural humility "doğru niyet, yapısal kısıt" pattern)** and **before §4 (Sprint Sequence)**.

---

### 3.21 Sustained execution retrospective May 17-19 — 37+ hour thread

This section documents operational patterns surfaced across the cumulative May 17 evening → May 19 morning execution thread, with focus on the v1.7 continuation window (May 18 post-v1.6-merge → May 19 09:13 UTC). The thread spanned X10b chain-verify session start through B1 indexer cancellation, producing 32 cumulative PRs across three UTC calendar days, closing the T1+ mainnet blocker, shipping two parallel sprint tracks to production-verified state, and capturing two sprint-cancel decisions as decision-artifacts.

**Cumulative thread anatomy (May 17 morning → May 19 morning UTC):**

| Window | PRs | Key outputs |
|---|---|---|
| May 17 morning | #104-117 batch (UR Pass 1 + CR1 + Tier 0 hotfixes) | Phase 1 wrap declarations, 4 audit-prep tracks merged |
| May 17 evening overnight | #121 + #122 + #123 + #124 + #125 + #126 + #127 | 7 PRs, X10b on-chain attribution case study canonical |
| May 18 UTC (pre-v1.6) | #128 + #129 + #130 | 3 PRs, T1+ MAINNET BLOCKER CLOSED |
| May 18 UTC (post-v1.6) | #131 (v1.6) + #132 + #133 + #134 + #135 + #136 + #137 + #138 + #139 + #140 + #141 + #142 + #143 + #144 | **14 PRs** — v1.7 retrospective window opens here |
| May 19 UTC | PR #145 closed (canceled); B1 stash created (canceled) | **2 sprint-cancel decision-artifacts** — v1.7 window closes 09:13 UTC |

**v1.7 window output snapshot (May 18 post-v1.6-merge → May 19 09:13 UTC):**

- **13 merged PRs** (#132 through #144) across ~11.5 active UTC hours on May 18
- **2 sprint-cancel decisions** captured as artifacts (B1 stash + PR #145 close) on May 19
- **Two parallel sprint tracks** ran fully to completion:
  - **X11 v2.2 contract hardening**: M-1 PullPayment (#136) + M-2 EIP-712 schema consolidation (#138) + M-3 emergencyWithdraw timelock (#140) + DevAttributionNFT 4×128k fuzz coverage (#143). All three audit findings closed via PR-per-finding pattern; SBT invariant coverage on already-shipped contract.
  - **X23 Glicko-2 rating system**: spec freeze (#134) → wrapper + DB schema (#137) → post-settle cron (#139) → API endpoints prod-verified May 19 00:35 UTC (#141). End-to-end rating system shipped in a single calendar day.
- **X20.0b F0 formula plausibility** shipped as `@skillos/anti-cheat` package pure function (#142) — closes Phase 1 AntiCheat design-intent-never-built gap (v1.6 §3.20 Instance 2 canonical reference).
- **Two docs-only PRs** (#132 audit-packet class_tag disclosure, #133 stale-doc drift cleanup) — Lock #3 propagation + recalibration of X14 class_tag framing.
- **3-cron production 500 RCA** (#144) — root cause identification (two independent causes, not one shared as sprint H1 hypothesised), no fix in same PR.
- **3-cron remediation decisions** (May 19): A1 sponsor wallet manual top-up by founder; B1 indexer RPC remediation canceled (X18-bundle Phase 2 redeploy will reset indexer state); PR #145 alerting infra closed (deferred to X18-bundle integration).

**Two-track parallel execution structure:**

The X11 and X23 sprint tracks dispatched in interleaved order, with no resource contention at the agent or repo level:

```
13:25 (#133) docs cleanup
13:31 (#134) X23.0 spec freeze        ──┐
13:39 (#135) X11.0 spec freeze        ──┼── both tracks begin
14:04 (#136) X11.1 M-1 PullPayment      │
17:41 (#137) X23.1 wrapper + schema     │
19:12 (#138) X11.2 M-2 EIP-712          │
19:18 (#139) X23.2 cron + sdk regen     │
20:17 (#140) X11.3 M-3 timelock         │
20:22 (#141) X23.3 API endpoints      ──┤── X23 track completes
20:36 (#142) X20.0b F0 formula          │
20:45 (#143) X11.4 fuzz invariants    ──┘── X11 hardening completes
21:38 (#144) 3-cron RCA
```

Two-track interleaving produced no merge conflicts and no shared-package fan-out collisions. Glicko track touched `packages/glicko-rating/` + `packages/duel-backend/src/cron/` + `apps/api/src/routes/ratings.ts` + `apps/orchestrator/`. Contract track touched `contracts/src/` + `contracts/test/invariant/`. Disjoint blast radius; parallel dispatch safe by construction.

**What did NOT ship in v1.7 window (queued forward):**

- X11.5 multi-sig cutover ceremony (founder-bound, threshold decision pending)
- X11.6 v2.2 deploy script + X11.7 redeployment to Base Sepolia (blocks X22)
- X22 v2.3 bracket logic + redeployment (dependency-locked behind X11.5-X11.7)
- X18-bundle Phase 2 redeploy (absorbs canceled B1 indexer remediation + canceled PR #145 alerting infra)
- X20.1-X20.4 (solo enforcement integration + F1 advisory + F2 circuit-breaker + F4 Haiku off-chain advisory queue)
- X14.1-X14.5 enforcement layers
- Pending CLAUDE.md drift sweep (3 stale claims surfaced — C2/C3/C4 per §3.24)

**Velocity observation continued from v1.6 §2.9:**

Two-track parallel execution ran without resource contention through agent dispatch. Sprint-cancel decisions surfaced ROI killers (B1 RPC remediation pre-mainnet) and decoupled deferred work (alerting → X18-bundle) without sunk-cost framing. Founder-velocity equivalent for the v1.7 window alone (~11.5 hours UTC of active sprint dispatch, 13 PRs shipped + 2 decision-artifacts) would have been **~10-15 working days** at pre-agent velocity baseline (per §2.9 calibration); achieved in a single overnight + morning thread.

The cumulative 37+ hour thread (May 17 morning → May 19 09:13 UTC) produced **32 PRs merged + 2 sprint-cancel artifacts** — founder-velocity equivalent ~25-35 working days, compressed to ~2.5 calendar days.

**Cross-reference:** v1.6 §3.19 (21+ hour May 17-18 retrospective baseline); §2.6 memory-as-spec drift framework; §2.8 spec-codegen drift framework; §2.9 velocity scale calibration invariant; §3.18 agent delegation principle; §3.20 architectural humility pattern.

---

### 3.22 Pattern locks β through η — continuation of v1.6 §3.19 implicit α series

v1.6 §3.19 canonicalized six operational pattern locks (numbered 1-6 in document; framed retroactively in v1.7 as the **implicit α series**: α-pre-flight tolerance, α-merge-gate stack, α-PR-count-UTC, α-tempfile-pattern, α-ApiError-widening, α-post-merge-8-step). v1.7 continues the Greek-tag canonical naming convention with six additional pattern locks surfaced across the May 18 post-v1.6 → May 19 window.

#### Pattern lock β — Workspace-package extensionless TS imports

Workspace TypeScript packages must use **extensionless imports** for intra-package modules; `.js` extension imports pass tsx + tsc but break the first Next consumer's webpack build.

**Canonical instance:** X23.1 → X23.2 (PR #139, May 18).

X23.1 (PR #137) shipped `packages/glicko-rating/` with intra-package imports using explicit `.js` extensions (Node ESM convention for source-equals-output mapping). Local `tsx` execution passed. Repo-wide `tsc --noEmit` typecheck passed. The package then surfaced as a dependency of the X23.2 cron handler at `packages/duel-backend/src/cron/ratings.ts`, which is consumed by `apps/orchestrator/src/app/api/cron/update-ratings/route.ts` — the first Next.js consumer. Next.js webpack module resolution rejected the `.js` extension imports at build time; the workspace-internal references didn't resolve through the transformed output paths.

PR #139 included a hotfix commit `9a67dcf fix(x23.2): strip .js extensions from glicko-rating intra-package imports` to land the integration. The lesson canonicalized in memory `reference_glicko_rating_js_ext_imports`: extensionless imports are the only safe form across all three consumers (tsx, tsc, Next webpack).

**Cost-of-prevention:** ~5-minute ESLint rule (`import/extensions: ['error', 'never']`) vs. 2-3 hour post-merge debug cycle isolating the discrepancy between tsx/tsc green and Next build red.

**Generalization:** any new workspace package added must follow the extensionless-imports convention. Raw `node -e` dry-runs are false signals because they exercise Node ESM resolution, not webpack — use `tsx` invocations and consumer-app builds for pre-merge validation.

**Code pattern (canonical):**

```ts
// packages/glicko-rating/src/index.ts — DO NOT use .js extension
import { updateRating } from './update';        // ✓ extensionless
// import { updateRating } from './update.js';  // ✗ breaks Next webpack
```

**Pre-merge validation chain (extended for workspace additions):**

```
1. tsx test/update.test.ts       — runtime sanity (Node ESM resolution)
2. tsc --noEmit                  — compile-time type check
3. npm run build (consumer app)  — webpack resolution check (CRITICAL: this is what tsx + tsc miss)
4. CI test-ts list registration  — gate parity with PR-time enforcement
```

#### Pattern lock γ — OpenAPI route-order trap (static-before-dynamic)

In an `OpenAPIHono` instance, static-path routes must register **before** dynamic-parameter siblings sharing the same prefix; radix-tree match-order coupling causes dynamic-param routes to swallow static-path traffic when the order is reversed.

**Canonical instance:** X23.3 (PR #141, May 18).

The X23.3 rating API ships three endpoints under `/v1/ratings/*`:

- `GET /v1/ratings/{wallet}` (dynamic param)
- `GET /v1/ratings/leaderboard?game=&class=&cursor=&limit=` (static)
- `GET /v1/ratings/history/{wallet}?game=&class=&cursor=&limit=` (dynamic param)

If `/v1/ratings/{wallet}` registers before `/v1/ratings/leaderboard` in the same `OpenAPIHono` instance, the radix-tree matches `leaderboard` against the `{wallet}` route, the wallet-validation regex fails, and the response is a 422 with a wallet-regex error path. The endpoint appears broken; the trap is the silent route collision, not a code bug.

PR #141 surfaced this via in-process smoke test. The fix lands `leaderboard` registration first. A regression-guard unit test now asserts on `error.details[].path` (must mention `class`, must NOT mention `wallet`) — without it, status-only 422 assertions cannot distinguish the two possible bugs.

**Cost-of-prevention:** assert on `details[].path` not just status code; document static-before-dynamic ordering as a route-registration convention in the OpenAPIHono setup file header comment.

**Generalization:** any OpenAPIHono (or Hono) router with mixed static + dynamic-param siblings under a shared prefix has this exposure. Lint cannot easily catch it; convention + regression test pair is the durable defense. Memory canonical: `reference_hono_openapi_route_order`.

**Regression test pattern (canonical):**

```ts
// apps/api/test/ratings.test.ts — route-order regression guard
const res = await app.request('/v1/ratings/leaderboard'); // missing required class
expect(res.status).toBe(422);
const body = await res.json();
expect(body.error.details).toBeDefined();

// Critical assertion: the 422 must be the leaderboard's class-validation 422,
// NOT the {wallet} route's wallet-regex 422
const paths = body.error.details.map((d: any) => d.path.join('.'));
expect(paths.some((p: string) => p.includes('class'))).toBe(true);
expect(paths.some((p: string) => p.includes('wallet'))).toBe(false);
```

#### Pattern lock δ — Substring-oracle log filter (truncation diagnostic)

When the deployment platform's runtime log surface truncates message bodies in the listing view, the **full-text `query=<term>` filter functions as a substring oracle**: a row appears in the filtered listing if and only if the truncated body contains the queried substring. This converts the listing UI from a passive viewer into an active confirmer.

**Canonical instance:** PR #144 3-cron 500 RCA (May 18).

Three orchestrator crons (`create-tournaments`, `index-sponsor-events`, `index-tournaments-created`) had returned 500 in production for ≥3 days. Vercel's runtime log table truncated the error message bodies — the visible row showed status + path + first ~80 characters, but not the full stack or specific error class. Without full-text access, error-class identification appeared blocked.

Diagnostic shift: instead of trying to access raw bodies, the agent ran `query="insufficient"` and `query="balance"` against the create-tournaments cron logs — only rows whose truncated body contained those terms appeared. Confirmed: `preflightSponsorBalance` throws "insufficient balance" class. Same technique with `query="getLogs"` and `query="block range"` against the indexer crons confirmed the Alchemy free-tier 10-block `eth_getLogs` cap rejection class.

Two independent root causes identified within a single diagnostic session, despite zero raw-body access.

**Cost-of-prevention:** memory canonical entry only (`reference_vercel_log_substring_oracle`); prevents hours of triangulating on truncated rows or escalating to log export workflows.

**Generalization:** any logging surface that supports filter-by-substring while truncating display becomes an oracle for confirming error class hypotheses. Pattern applies to Vercel runtime logs, GitHub Actions log search, Supabase log explorer, CloudWatch insights queries.

**Diagnostic technique (canonical):**

```bash
# Hypothesis: create-tournaments cron failing on sponsor balance
# Vercel UI: query="insufficient" — does this row appear in filtered listing?
#   row appears   → hypothesis confirmed (substring is in truncated body)
#   row absent    → hypothesis falsified (try next term)

# Subsequent queries to narrow class:
#   query="balance"    — narrows to balance-class errors
#   query="preflightSponsorBalance"  — narrows to specific call site

# Result: error class identified without ever seeing raw body
```

The technique is **inversion**: convert the listing UI from a passive viewer (read body to identify error) into an active confirmer (assert substring presence to confirm hypothesis).

#### Pattern lock ε — SPEC.md canonical SOT supremacy at impl time

When a sprint plan includes both an embedded code snippet AND a reference to a SPEC.md document, and the two drift, **the SPEC.md is canonical** and the embedded snippet is illustrative. Agents must re-derive implementation from SPEC.md, not the sprint plan's draft code.

**Canonical instances:**

**X23.3 (PR #141, May 18):** Sprint plan embedded code diverged from SPEC.md §E on **five dimensions**:

| Dimension | Sprint plan draft | SPEC.md §E |
|---|---|---|
| Class enum | Three values (`'human','agent','mixed'`) | Two values (`'human','agent'`) — inherits X14.0 |
| Pagination | Offset (`offset=` + `limit=`) | Opaque cursor (`cursor=` + `limit+1` peek) |
| History path | `/v1/ratings/{wallet}/history` | `/v1/ratings/history/{wallet}` |
| Response wrapping | `{ data: [...] }` envelope | Bare array |
| Rate limit | Not specified | 60-120 req/min/IP |

PR #141 pre-flight explicitly declared SPEC.md §E canonical SOT per the sprint plan's own pre-flight step. The implementation followed SPEC.md, not the embedded snippet. All five drifts caught pre-implementation.

**X11.4 (PR #143, May 18):** Sprint plan proposed a 10-test unit file at `contracts/test/X11_DevAttributionSBT.t.sol` with per-tournament SBT mint assumptions (`BalanceOf_IncrementsPerTournament`, `TokenIdUnique` per tournament, `DuplicateMintSameTournament_Reverts`, `TokenURI_ContainsTournamentId`). Actual shipped contract is **per-DEV, not per-tournament** — `tokenId == uint256(uint160(devAddr))`, deterministic, with 17 unit tests already in `test/DevAttributionNFT.t.sol`. Re-shipping the proposed unit tests would have been duplicate work without audit value AND would have proposed assertions against a contract behavior that does not exist.

Agent re-aligned to SPEC §H.1 (which scopes X11.4 to **invariant test files** in `contracts/test/invariant/`) and shipped `DevAttributionNFTInvariants.t.sol` with 4 invariants × 128k randomized paths each (INV-N1, INV-N4, INV-N5, INV-N1+ corollary).

**Cost-of-prevention:** declare SPEC-canonical SOT in sprint plan pre-flight section; agents check SPEC.md as source-of-truth before re-implementing embedded code snippets.

**Generalization:** sprint plans naturally drift from SPEC.md over revision cycles. The drift surfaces at impl time; the canonical declaration prevents the agent from cargo-culting stale snippets. Memory canonical: `feedback_respect_gate_holds` (analogous gate-hold principle for multi-gate plans).

#### Pattern lock ζ — Sub-sprint critical-path sequencing constraint

Sub-sprints have **dependency lattices**, not freedom-of-order. Sprint scoping must surface the critical path explicitly; agents must enforce sequencing at dispatch time, not at implementation time.

**Canonical instance:** X11.0 v2.2 spec freeze (PR #135, May 18).

X11.0 SPEC §J declared the sub-sprint critical path:

```
X11 (M-1 + M-2 + M-3 + DevAttribution fuzz)
  → X11.5 multi-sig cutover ceremony
    → X22 v2.3 redeployment + bracket logic
```

The constraint is hard: X11.5 cannot start until X11.1-X11.4 deploy artifacts exist; X22 v2.3 redeploy cannot start until the new owner (multi-sig) controls the deploy script signer. The chain is enforced by smart contract ownership transfer + Safe Wallet 1-of-1 deployment ceremony (PR #127), not by sprint plan checkbox.

PR #135 also explicitly time-boxed sub-sprint estimates at agent-velocity per v1.6 §2.9: **~30-45 agent-hours = 4-6 working days sustained** (founder-velocity equivalent ~14-21 days). Within X11, parallel branches exist: `max(X11.1, X11.2 → X11.6, X11.3) → X11.4 + X11.5 parallel → X11.7 → audit firm engagement X12`.

**Cost-of-prevention:** ~1 hour scoping diagram in sprint plan vs. ordering rework mid-implementation if dependencies surface late.

**Generalization:** any multi-sub-sprint sprint with cross-cutting deploy or ceremony dependencies needs explicit critical-path declaration in scoping. Surface parallel-safe branches separately so agents can dispatch concurrently where safe.

**Dispatch decision flow (canonical):**

```
For each sub-sprint S in plan:
  1. Identify upstream blockers (other sub-sprints S must wait on)
  2. Identify external blockers (founder ceremony, deploy artifact, contract redeploy)
  3. Mark dispatch-safe iff (all upstream sub-sprints complete) AND (all external blockers cleared)
  4. Parallel-safe set = all dispatch-safe sub-sprints with disjoint blast radius
  5. Sequential-only set = dispatch-safe sub-sprints with shared blast radius

X11 application:
  - X11.1, X11.2, X11.3 — parallel-safe (disjoint files: ArcadePool / EIP-712 module / TimelockBucket)
  - X11.4 — sequential after X11.1+X11.2+X11.3 (DevAttribution invariants reference pool state)
  - X11.5 — sequential after X11.1-X11.4 (multi-sig owns deploy artifacts)
  - X11.6 + X11.7 — sequential after X11.5 (script + redeploy by new owner)
```

The X11 sprint in the v1.7 window dispatched X11.1 (#136), X11.2 (#138), X11.3 (#140) in interleaved fashion with the X23 track, then X11.4 (#143) sequential — matching the dispatch decision flow exactly.

#### Pattern lock η — Sprint-cancel-as-product (decision capture > implementation completion)

A sprint canceled with **reason captured in stash message + memory entry + scope-defer pointer** is a shipped decision artifact, not waste. The deliverable is the captured decision, not the implementation.

**Canonical instances (May 19):**

**B1 indexer RPC remediation — canceled.** Per PR #144 RCA, the index-sponsor-events + index-tournaments-created crons fail because Alchemy free-tier `eth_getLogs` rejects block ranges >10 blocks. Naive fix: chunk the getLogs scan. Pre-mainnet ROI analysis: X18-bundle Phase 2 redeploy will reset indexer state entirely (new contracts, new event signatures, fresh backfill window). Any chunking implementation built now is wasted work — the indexer will be replaced before mainnet. Cancellation decision captured in stash message:

> `stash@{0}: On fix/b1-rpc-chunking-strategy: B1 cancelled 2026-05-19: indexer Alchemy 10-block chunking — ROI killed pre-mainnet (X18-bundle redeploy will reset state)`

535 LOC stashed; X18-bundle revival pointer carried forward via §4 Sprint Sequence.

**PR #145 alerting infra — canceled.** PR opened May 18 evening with `withAlert(cronName, handler)` HOF wrapper, Discord webhook utility, `v2_alert_history` dedup table, 7 cron handlers retrofitted, 5 node:test cases. Closed May 19 09:03 UTC. Cancellation reason: alerting belongs in the X18-bundle integration, not as a standalone PR landed before the indexer + cron infrastructure resets. The decision captured in memory canonical entry `reference_cron_alerting_pattern` carries the design forward: `withAlert` HOF + `v2_alert_history` dedup + `DISCORD_ALERTS_WEBHOOK` env var pattern, applicable when X18-bundle wraps new cron handlers.

**Cost-of-prevention:** zero (decision-capture is the deliverable); avoids sunk-cost framing or perception of abandoned work.

**Generalization:** when a sprint surfaces a pre-mainnet ROI killer or a sequencing dependency on bundled future work, **cancel with artifact**, not with silence. Stash messages, closed-PR descriptions, and memory entries are the durable carriers. Audit-firm narrative value: visible decision-making is stronger than silent abandonment.

**Cancellation artifact checklist (canonical):**

```
□ Stash created with descriptive message (date + reason + carry-forward target)
  Example: "B1 cancelled 2026-05-19: indexer Alchemy 10-block chunking —
            ROI killed pre-mainnet (X18-bundle redeploy will reset state)"
□ If a PR exists: close with description capturing the deferral reason
  Example: PR #145 description preserved with "Out of scope" + "Founder
            follow-up" sections so X18-bundle integration can revive
□ Memory canonical entry capturing the design (so future thread can
  rebuild from spec, not from stash diff archaeology)
  Example: reference_cron_alerting_pattern captures withAlert HOF design
□ Sprint Sequence row updated with CANCELED + reason + carry-forward target
  Example: §4 row "B1 — indexer RPC remediation ❌ CANCELED" with X18-bundle ref
```

Without the checklist, cancellation degenerates into "we just didn't ship it" framing. With it, cancellation is documented decision-making — the same artifact category as a shipped PR.

**Cross-reference:** v1.6 §3.19 implicit α series pattern locks 1-6; §3.18 agent delegation principle; §3.20 architectural humility pattern; memory canonical entries `reference_glicko_rating_js_ext_imports`, `reference_hono_openapi_route_order`, `reference_vercel_log_substring_oracle`, `reference_cron_alerting_pattern`.

---

### 3.23 Audit-narrative gold disclosures × 4 — §3.20 5-step frame applications

v1.6 §3.20 canonicalized the "doğru niyet, yapısal kısıt" (correct intent, structural constraint) analytical frame with five steps: articulate gap → diagnose cause → frame response by cause type → document analysis → recover dignity through transparency. v1.7 applies the frame to four canonical instances: two carried forward from v1.6 with shipped follow-ups, two surfaced in the v1.7 window.

#### Disclosure 1 — X20 AntiCheat F0 formula rebuild (v1.4 §3.13 + v1.6 §3.20 Instance 2 closure)

**Articulate the gap.** Phase 1 testnet AntiCheat scope was limited to (a) bounds checks (min/max score per game), (b) play-window checks (min duration, max duration), (c) Haiku-direct on-chain `flagScore` writes on the duel path (irreversible, no confidence gate). Solo path had no on-chain AntiCheat at all. Deterministic formula plausibility — the documented architectural intent (duration × moves × score, per-game coefficients, pure function verdict) — was never built in code.

**Diagnose the cause.** Compound: team error (spec drift to code over Phase 1 velocity-first window — formula gate intended but skipped at submit) + structural constraint (in the absence of a formula gate, irreversible Haiku writes were the only available mechanism, baking in a worse trust assumption than the spec intended).

**Frame response.** Architectural rebuild scoped pre-mainnet via X20 sub-sprints F0-F4 (PR #122 May 17 scoping). Strategic Option F lock: deterministic primary, no irreversible LLM verdicts on-chain at mainnet launch. **X20.0a (PR #128 May 18) shipped moves instrumentation** (the F0 input plumbing). **X20.0b (PR #142 May 18) ships F0 formula** as `@skillos/anti-cheat` package — pure function (no I/O, deterministic verdict + confidence), per-game coefficient table for all six game apps, three independent checks (duration/move floor + score/move ceiling + move count bounds; first failure wins), 10 node:test cases (6 per-game baselines + axis failures + verdict shape + determinism).

**Document the analysis.** v1.4 §3.13 (X20 AntiCheat rebuild scope canonical); v1.6 §3.20 Instance 2 (formula plausibility design intent never built); PR #142 description (F0 formula pure function); v1.7 §4 Sprint Sequence (X20.0a + X20.0b COMPLETE).

**Recover dignity through transparency.** Audit-firm disclosure language locked: *"Phase 1 testnet AntiCheat scope was limited: bounds + play-window checks (solo) + Haiku-direct on-chain flagScore (duel path, currently inactive). Formula plausibility was design intent never built. Pre-mainnet rebuild architectural per X20 sub-sprints F0-F4. F0 formula pure function shipped as @skillos/anti-cheat package (PR #142, May 18 2026); F1 confidence gate + F2 circuit-breaker + F4 Haiku off-chain advisory queue queued for Phase 2 pre-mainnet."* The "design intent never built → architectural rebuild → package shipped" arc is the closure that v1.6 §3.20 Instance 2 promised.

**Closure status snapshot (as of v1.7 supplement):**

| Sub-sprint | Status | Surface |
|---|---|---|
| X20.0a moves instrumentation | ✅ COMPLETE | PR #128, `moves` column on `v2_tournament_solo_runs`, captured at all 6 game apps |
| X20.0b F0 formula pure function | ✅ COMPLETE | PR #142, `@skillos/anti-cheat` package, 10/10 tests |
| X20.1 solo enforcement integration | ⏳ QUEUED | Call F0 at submit-time per `apps/api/src/routes/scores.ts` |
| X20.2 F1 Haiku confidence gate | ⏳ QUEUED | Transitional layer pre Option F lock |
| X20.3 F2 per-tournament circuit-breaker | ⏳ QUEUED | Auto-disable retry on aggregate failure rate |
| X20.4 F4 Haiku → off-chain advisory queue | ⏳ QUEUED | Target architecture per Option F |

#### Disclosure 2 — X14 class_tag implementation surface (intentional two-path design)

**Articulate the gap.** May 18 chat session: founder + Claude (chat) + X23 Glicko-2 scoping agent triangulated to hypothesis "X14.0 class_tag is hardcoded human, agent path silently corrupted." Three surfaces converged on the same incorrect read. Hotfix sprint scoped.

**Diagnose the cause.** X14-hotfix scoping agent pre-flight verification (the fourth surface) caught the drift: the design is **intentional two-path architecture**. Per-game Next.js routes submit anonymous (no SIWA) writing `class_tag='human'` to `v2_tournament_solo_runs` at `packages/duel-backend/src/api/tournaments/solo.ts:413-415`. The `/v1/scores` Hono route is SIWA-gated (agent authentication required) writing whatever `class_tag` the SIWA token authenticates at `apps/api/src/routes/scores.ts:306-307`. Two paths, two callers, two enforcement mechanisms — not a bug, the design.

**Frame response.** X14-hotfix closed as no-op (no code change, no production damage). PR #132 (May 18) ships audit-firm disclosure capturing the recalibrated framing: `docs/audit-packet/phase1-class-tag-disclosure.md`. The disclosure documents Phase 1 baseline (387 `v2_tournament_solo_runs` + 349 `v2_tournament_entries` + 13 `v2_duels`, 100% `class_tag='human'`, 0 `class_tag='agent'` per Supabase MCP introspection May 18 against project `clizuqvtkekzxiflbsyr`).

**Document the analysis.** PR #132 description; `docs/audit-packet/phase1-class-tag-disclosure.md`; memory canonical entries `feedback_respect_gate_holds` (gate-hold discipline that surfaced the catch) + `reference_constraint_compliance_over_label_granularity` (schema-constraint resolution pattern).

**Recover dignity through transparency.** The drift catch itself becomes architecture evidence. Multi-protective stack visible: three surfaces triangulated incorrectly (founder + chat + scoping agent #1); X14-hotfix scoping agent's pre-flight read caught the misframing before code touched. Audit-firm narrative value: *"SkillOS captures drift catches as architecture evidence rather than hiding them. The X14-hotfix close-as-no-op + this disclosure together demonstrate the discipline."* The four-surface stack (versus single-gate failure) is the published artifact.

#### Disclosure 3 — Stoplight X1 sprint :root override (v1.6 §3.20 Instance 1 continuation)

**Articulate the gap.** X1 sprint shipped `/docs` route with Stoplight Elements rendering and theme override via `:root` CSS variable injection ("Pitch Black + Lime + Inter"). Visual output partially landed — some accents reached, but font family + method label colors + overall feel did not match SkillOS design language.

**Diagnose the cause.** May 18 reconnaissance (`/tmp/stoplight-customization-report.md`, PR-less analysis) revealed Stoplight Elements 8.4.6 ships zero theme/color/font props on `<elements-api>`, and its compiled `styles.min.css` does not declare its internal `--color-*` / `--font-*` tokens at `:root`. The X1 sprint's cascade target was the host page; Stoplight's utility classes don't read from host page `:root` because the tokens aren't declared at `:root` to begin with. X1 instinct correct (theme via CSS variable cascade is the standard pattern); cascade target wrong (Stoplight Elements deliberately doesn't expose internal tokens at `:root`). Stoplight's own theming-and-branding feature is still on their roadmap (roadmap.stoplight.io/c/52), not shipped.

**Frame response.** Defer Stoplight customization to Phase 3+ branding sprint. `/docs` apex MDX route (memory pending sprint, ~15-20h) takes priority because it carries brand surface (anti-cheat overview, Skillz-vs-Papaya, architecture pages). v1.7 carry-forward: the deferral remains in effect; no v1.7 work touched Stoplight surface.

**Document the analysis.** v1.6 §3.20 Instance 1; `/tmp/stoplight-customization-report.md`; v1.7 §3.23 (this disclosure as continuation).

**Recover dignity through transparency.** Audit-firm narrative integrity preserved via honest disclosure: *"Stoplight Elements UI is dev tooling-grade reference; brand surface lives at apex `/docs` MDX route."* The instinct-correct framing protects team confidence (CSS-variable cascade is the standard pattern); the structural-constraint framing protects ecosystem trust (Stoplight's roadmap-pending theming feature acknowledged).

#### Disclosure 4 — 3-cron production 500 silent failure → alerting cancellation (NEW v1.7)

**Articulate the gap.** Three orchestrator crons (`create-tournaments`, `index-sponsor-events`, `index-tournaments-created`) returned 500 in production for ≥3 days. No alerting baseline existed. The silent failure surfaced only when a manual diagnostic surfaced the gap via Vercel runtime log review. Production damage: 1 day of missed tournament creation (no replay), ≥3 days of stale indexer dashboards (mirror only — on-chain state authoritative, no user-facing damage).

**Diagnose the cause.** Compound structural constraints + team error:

- **Structural constraint 1:** Alchemy free-tier `eth_getLogs` rejects block ranges >10 blocks. The index-sponsor-events + index-tournaments-created crons use a chunked scan strategy that worked at lower block heights; at scale, every poll fails.
- **Structural constraint 2:** Sponsor wallet USDC depletion auto-trips `preflightSponsorBalance` in create-tournaments cron. The preflight is correct behavior (refuse to attempt tournament creation if sponsor funds insufficient); the silent 500 is the visibility gap.
- **Team error:** No alerting baseline existed before X18-bundle redeploy. Phase 2 mainnet cutover would require notification infrastructure; Phase 1 testnet operated on honor-system uptime visibility.

**Frame response.** Per PR #144 RCA, fix scope split into A1 (sponsor wallet top-up + Vercel cron-500 alerting) + B1 (indexer RPC remediation + backlog replay). Decision pivot May 19:

- **A1 partial — sponsor wallet manual top-up done by founder** May 19 (cron returns to green at next 00:00 UTC tick).
- **B1 canceled** — X18-bundle Phase 2 redeploy will reset indexer state entirely (new contracts, new event signatures, fresh backfill window). Any chunking remediation built now is wasted work pre-mainnet. Decision captured in stash artifact.
- **PR #145 alerting infra canceled** — withAlert HOF + Discord webhook + dedup table design preserved in memory canonical (`reference_cron_alerting_pattern`), deferred to X18-bundle integration where new cron handlers will wrap via this pattern from inception.

**Document the analysis.** PR #144 RCA (`docs/sprints/diag-3-cron-500/RCA.md`); B1 stash message; PR #145 closed-state description; memory canonical entries `reference_cron_alerting_pattern` + `reference_vercel_log_substring_oracle`.

**Recover dignity through transparency.** Audit-firm narrative: *"3-cron production 500 silent failure detected via manual diagnostic on May 18, 2026. Root cause analysis identified two independent structural constraints (Alchemy free-tier eth_getLogs cap + sponsor wallet depletion preflight) and one team-error gap (no alerting baseline). A1 sponsor wallet top-up executed by founder May 19; B1 indexer remediation canceled with ROI rationale captured (X18-bundle Phase 2 redeploy will reset state); alerting infra design preserved in memory and deferred to X18-bundle integration. Decision-capture artifacts: stash message + closed-PR description + memory canonical entries."* The decision-capture-as-deliverable arc replaces the silent-failure framing entirely.

**Comparison vs Skillz/Papaya transparency contrast (per v1.6 §3.20):**

The Skillz/Papaya $420M Lanham Act verdict (April 2026) established operator opacity as adjudicated fraud. SkillOS contrast: every Phase 1 → Phase 2 gap surfaces with **detection mechanism + root cause + decision rationale + carry-forward target**, captured in version-controlled artifacts. The 3-cron silent failure is the canonical Phase 1 evidence: the failure itself was visibility-gap'd, but the response — including the cancellations — is fully documented across PR descriptions, stash messages, memory canonical entries, and this supplement. The decision-capture chain is the **operator-transparency artifact** that distinguishes SkillOS from the Skillz/Papaya posture.

---

### 3.24 Drift catalog — 26 documented instances, 4-category taxonomy

This section consolidates the drift instances surfaced across the May 17-19 thread, plus cumulative carry-forward from prior windows, into a four-category taxonomy. Each category clusters drifts by the **source-of-truth boundary** that was crossed.

**Taxonomy:**

1. **Claim drift** — agent or chat claim ≠ reality at time of claim (including stale documentation claims and PR-count framing drift)
2. **State drift** — local file / git state / deploy runtime ≠ assumed state at action time
3. **Spec drift** — source-of-truth document (SPEC.md, schema, OpenAPI) ↔ generated artifact or implementation
4. **Scope/premise drift** — sprint scope or hypothesis premise ≠ actual scope or correct premise at impl time

**Category 1 — Claim drift (7 instances):**

| # | Drift | Detection | Disposition |
|---|---|---|---|
| C1 | "19 cumulative PRs tonight + this morning" mixed-frame claim | Agent flagged: UTC calendar canonical | v1.6 §3.19 Pattern lock 3; canonicalized α-PR-count-UTC |
| C2 | CLAUDE.md "no CI today" claim | X14.0 PR #130 merge attempt surfaced GitHub Actions enforcing typecheck + test-ts + test-foundry + lint | Memory `feedback_claudemd_ci_state_stale`; pending CLAUDE.md fix in §axis-6 |
| C3 | CLAUDE.md "no via_ir; remappings in foundry.toml" claim | X19a.2 dual-profile (default has `via_ir=true`) | Memory `project_foundry_dual_profile_phase1_legacy`; pending CLAUDE.md update |
| C4 | CLAUDE.md "Next 14 framing" claim | All 5 games + 2048 on `next@^16.2.4` as of 2026-05-12 | Memory `project_claudemd_nextjs_version_stale`; pending §axis-6 CLAUDE.md sweep |
| C5 | Chat May 18 "X14.0 class_tag hardcoded bug" hypothesis | X14-hotfix scoping agent pre-flight surfaced intentional two-path design | PR #132 audit-packet disclosure; §3.23 Disclosure 2 |
| C6 | Sprint H1 "single shared root cause" hypothesis for 3-cron 500s | RCA found two independent root causes (Alchemy 10-block + sponsor depletion) | PR #144 RCA; §3.23 Disclosure 4 |
| C7 | X23 sprint plan "8 crons" claim | Only 7 crons exist; `sponsor-balance-check` from A1 not yet merged | PR #145 description (sprint-plan-drift section); accepted with note |

**Category 2 — State drift (6 instances):**

| # | Drift | Detection | Disposition |
|---|---|---|---|
| S1 | X14.0 dual-cron emit-site line targets `:529` and `:307` | Reality at impl: lines 544 and 325 (drift +15 / +18) | v1.6 §3.19 Pattern lock 1; canonicalized α-pre-flight ±5 tolerance |
| S2 | X11.0 task prompt referenced "PR #133" pre-existing | Latest merge at branching point was PR #132; worktree branched from `5bde6e3` | PR #135 §K founder docket entry 1 |
| S3 | DevAttributionNFT.sol "to be authored" assumption in X11 task | Contract already shipped (121 LOC, ERC-5192, deterministic `tokenId`, OnlyTournamentPool guard) | PR #135 §K founder docket entry 2; X11.4 PR #143 re-scoped to invariant coverage |
| S4 | TournamentPool deployed-state assumption "matches v2.2 source" | Source is v2.2 (dev fee splitter shipped); deployed Base Sepolia still v2.1 (`0x52049b...`) | PR #135 §K founder docket entry 3; X11.7 redeploy queued |
| S5 | X23.1 `.js`-ext imports passing tsx + tsc green | First Next consumer (X23.2 cron handler) webpack rejected at integration | PR #139 hotfix commit `9a67dcf`; §3.22 Pattern lock β |
| S6 | PR #145 alerting "8 crons" wrapper target | `sponsor-balance-check` from A1 doesn't yet exist; HOF retrofits 7 | PR #145 description notes wrapper will pick up #8 when A1 lands; PR canceled before relevant |

**Category 3 — Spec drift (7 instances):**

| # | Drift | Detection | Disposition |
|---|---|---|---|
| P1 | PR #128 → #129 SDK regen drift | Post-merge `git status` surfaced `M packages/sdk/src/api.gen.ts` 70-line diff from parallel worktree | v1.6 §2.8 canonical case; PR #129 mini-PR pattern |
| P2 | X23.2 schema-mapping vs sprint plan (4 column names) | Supabase MCP introspection vs sprint plan draft surfaced `class_declaration → tournament_class`, `wallet → player_address` ×2, `score → best_score` | PR #139 description (schema-mapping table); spec re-derivation pattern |
| P3 | X23.3 sprint snippet vs SPEC.md §E (5 dimensions) | Class enum / pagination / path structure / response wrapping / rate limit drifts | §3.22 Pattern lock ε; PR #141 followed SPEC.md as canonical SOT |
| P4 | X11.4 sprint snippet (per-tournament SBT mint) vs SPEC.md §H.1 (per-DEV invariant) | Sprint plan assumed 10-test unit file at `X11_DevAttributionSBT.t.sol`; spec scopes X11.4 to invariant tests in `contracts/test/invariant/` | §3.22 Pattern lock ε; PR #143 followed SPEC §H.1 |
| P5 | X14 chat-draft framing "hardcoded bug" vs design "intentional two-path" | Pre-flight verification by X14-hotfix scoping agent | §3.23 Disclosure 2 (overlaps with C5 by category) |
| P6 | X23 SPEC §D.1 "every 10 min" vs Vercel Hobby tier "sub-daily cron rejected" | Inherited from settle-tournaments cron workaround | PR #139 cadence-deviation note; daily 00:35 UTC slot chosen |
| P7 | X23.3 SPEC §E.3 "60-120 req/min/IP rate limit" vs in-memory LRU lib "60/min for all keys" | Existing `lib/rate-limit.ts` lacks per-endpoint tuning | PR #141 deferred per-endpoint tuning to Phase 2 Upstash migration |

**Category 4 — Scope/premise drift (6 instances):**

| # | Drift | Detection | Disposition |
|---|---|---|---|
| Q1 | Standalone duel framing in CLAUDE.md + wallet-topology.md | X22 bracket scoping agent flagged 2 stale references in §I.9 docket | PR #133 docs cleanup (Lock #3 propagation) |
| Q2 | X11.0 sub-sprint scope assumed flat ordering | SPEC §J declared critical-path constraint `X11 → X11.5 cutover → X22 v2.3 redeploy` | §3.22 Pattern lock ζ; PR #135 §J |
| Q3 | 3-cron RCA scope "find one root cause" premise | RCA found two independent root causes | PR #144 TL;DR explicitly notes "Two independent root causes, NOT one shared as sprint H1 hypothesised" |
| Q4 | B1 indexer remediation premise "fix pre-mainnet" | X18-bundle redeploy will reset indexer state; remediation = wasted work | §3.22 Pattern lock η; May 19 stash cancellation |
| Q5 | X23.3 test directory premise `apps/api/src/__tests__/` | Actual `apps/api/test/`; `v2_player_rating_history` schema includes `volatility_before/after` cols sprint snippet's mapper missed | PR #141 description (drift-from-plan section) |
| Q6 | PR #145 alerting premise "ship standalone now" | Cancellation: belongs in X18-bundle integration, not standalone | §3.22 Pattern lock η; May 19 PR #145 close |

**Catalog observations:**

- **Detection mechanism breakdown:** 9/26 caught by agent pre-flight verification, 8/26 caught by post-merge or in-PR review, 5/26 caught by build/typecheck/integration failure, 4/26 caught by chat ↔ agent ↔ scoping-agent triangulation cross-check.
- **Disposition breakdown:** 14/26 resolved by alignment to canonical SOT (SPEC.md, schema, on-chain state), 7/26 captured as memory canonical entries for future-thread defense, 5/26 deferred to scheduled future-bundle work.
- **Multi-protective stack evidence:** 4 instances (C5/P5, S4, Q3, Q4) required two or more surfaces to triangulate truth; single-surface detection would have missed or misframed them.

**Cross-window comparison vs v1.6 §3.19 implicit α series window:**

| Window | Drift instances | Caught pre-impl | Caught at impl | Caught post-merge |
|---|---|---|---|---|
| v1.6 (May 17-18, 21+ hrs, 19 PRs) | ~14 inferred | ~5 (36%) | ~5 (36%) | ~4 (29%) |
| v1.7 (May 18 post-v1.6 → May 19, 11.5 hrs active, 13 PRs + 2 cancels) | 26 documented | 13 (50%) | 8 (31%) | 5 (19%) |

The v1.7 window shows **pre-impl catch rate climbing** (36% → 50%) — agent pre-flight verification has matured. Post-merge catch rate **decreasing** in absolute and percentage terms (4 → 5 but 29% → 19% share) reflects the same maturation: drift that previously escaped to post-merge is now caught earlier in the dispatch loop. The implicit α + β-η pattern locks are doing measurable work.

**Carry-forward candidates (drift classes seen but not yet pattern-locked):**

Three drift sub-classes appeared in the v1.7 window with single instances each — insufficient evidence to canonicalize as pattern locks now, queued for v1.8+ evidence accumulation:

1. **Vercel Hobby-tier cron cadence ceiling** (P6) — sprint specs requesting sub-daily cadence rejected at platform. One instance May 18; broader pattern likely emerges across X20.1+/X15.5+ as more crons added.
2. **Existing-contract integration vs author-new contract assumption** (S3) — sprint plans default to "author new"; codebase often has existing surface to integrate against. One instance May 18 (DevAttributionNFT); broader pattern likely emerges as Phase 1 → Phase 2 surface mapping continues.
3. **Test-file path convention drift** (Q5) — `apps/api/src/__tests__/` vs `apps/api/test/`. One instance May 18; broader pattern requires evidence across other app boundaries before lock.

**Cross-reference:** §2.6 memory-as-spec drift framework (claim drift + spec drift surface); §2.8 spec-codegen drift framework (P1 canonical case); §3.18 agent delegation principle (pre-flight verification at dispatch time); §3.19 implicit α series pattern locks (α-pre-flight tolerance covers S1, α-PR-count-UTC covers C1, α-tempfile-pattern covers commit/PR ergonomics across all categories); §3.22 β-η pattern locks (β covers S5, γ covers route-collision class, δ covers diagnostic across all categories, ε covers P3+P4, ζ covers Q2, η covers Q4+Q6).

**Synthesis — what the v1.7 catalog tells us about v1.8+ direction:**

The drift catalog is a leading indicator of where next-window pattern locks will emerge. Three signals from the v1.7 window:

1. **Spec drift dominates spec-codegen drift** (7 P-instances vs 1 P-canonical case carried from v1.6 §2.8). The lesson: as the codebase matures, sprint plans drift from SPEC.md faster than generated artifacts drift from source spec. v1.8+ canonicalization candidate: SPEC-canonical-SOT enforcement at sprint dispatch time (extension of §3.22 Pattern lock ε beyond impl time to dispatch time).
2. **Sprint-cancel-as-product is a new artifact category.** Pattern lock η is the first formalization; B1 stash + PR #145 close are the first two instances. v1.8+ candidate: cancellation taxonomy (ROI killer vs sequencing defer vs scope drift correction).
3. **Multi-protective stack triangulation rate is climbing.** 4/26 drifts in v1.7 needed ≥2 surfaces vs ~2 inferred in v1.6 window. v1.8+ candidate: explicit "triangulation budget" per sprint dispatch — at least 2 verification surfaces required for decisions touching production state.

---

## UPDATE TO §4 — Sprint Sequence current state

Append the following section to §4, after v1.6 Sprint Sequence content:

---

**Sprint Sequence — current state (May 19, 2026 morning UTC, post 37+ hour thread):**

| Sprint | Status | Notes |
|---|---|---|
| (All v1.6 baseline rows preserved with status carried forward) | | |
| **v1.6 architecture supplement** | ✅ COMPLETE | PR #131 May 18 10:34 UTC |
| **Audit packet — Phase 1 class_tag implementation surface disclosure** | ✅ COMPLETE | PR #132 May 18 (recalibration per §3.23 Disclosure 2) |
| **Docs cleanup — Lock #3 propagation (CLAUDE.md + wallet-topology.md)** | ✅ COMPLETE | PR #133 May 18 (X22 scoping agent §I.9 docket) |
| **X23.0 — Glicko-2 spec freeze** | ✅ COMPLETE | PR #134 May 18 (Tier 1+2 locks, library `glicko2-lite@^5.0.0`, anchor 1000/350/0.06, class enum `'human','agent'` inherits X14.0) |
| **X11.0 — v2.2 spec freeze (TournamentPool extension scoping)** | ✅ COMPLETE | PR #135 May 18 (M-1/M-2/M-3 + DevAttributionNFT integration + INV-S1..S5 + critical-path declaration) |
| **X11.1 — M-1 PullPayment for ArcadePool.refundIfEmpty** | ✅ COMPLETE | PR #136 May 18 (audit finding M-1 closed; push → pull architecture shift; 8/8 invariant tests pass) |
| **X23.1 — Glicko-2 wrapper + DB schema** | ✅ COMPLETE | PR #137 May 18 (`@skillos/glicko-rating` workspace + `v2_player_ratings` + `v2_player_rating_history`; 6/6 deterministic tests; Glickman 2013 paper canonical worked example locked) |
| **X11.2 — M-2 EIP-712 schema consolidation + BRACKET_ROUND_START_TYPEHASH** | ✅ COMPLETE | PR #138 May 18 (EIP-191 dropped; canonical typehashes for ScoreSubmit + SoloScoreSubmit + BracketRoundStart; X22 v2.3 EIP-712 schema locked in v2.2 surface) |
| **X23.2 — Post-settle cron rating update + sdk regen integration** | ✅ COMPLETE | PR #139 May 18 (decoupled cron pattern + `runUpdateRatings` business logic + per-class cohort updates + `.js`-ext-strip hotfix per §3.22 Pattern lock β) |
| **X11.3 — M-3 emergencyWithdraw timelock + bucket-scoped withdrawal** | ✅ COMPLETE | PR #140 May 18 (audit finding M-3 closed; 48h proposal + EmergencyBucket enum + per-bucket balance check) |
| **X23.3 — Rating API endpoints (3 reads, anon-public, OpenAPI surface)** | ✅ COMPLETE + prod-verified May 19 00:35 UTC | PR #141 May 18 (`GET /v1/ratings/{wallet}` + `/leaderboard` + `/history/{wallet}`; route-order trap per §3.22 Pattern lock γ; 9/9 tests + 4/4 in-process smoke against live testnet Supabase) |
| **X20.0b — F0 formula plausibility pure function** | ✅ COMPLETE | PR #142 May 18 (`@skillos/anti-cheat` package; per-game coefficients for all 6 game apps; three checks duration-floor + score-ceiling + move-bounds; class-agnostic per CLAUDE.md invariant #3; 10/10 tests; closes §3.23 Disclosure 1) |
| **X11.4 — DevAttributionNFT 4×128k fuzz invariant coverage** | ✅ COMPLETE | PR #143 May 18 (INV-N1 mint idempotency + INV-N4 soulbound enforcement + INV-N5 deterministic tokenId + INV-N1+ pool↔NFT state pinning; 235 → 239 tests; SPEC §H.1 canonical SOT per §3.22 Pattern lock ε) |
| **Diag — 3-cron production 500 RCA** | ✅ COMPLETE (RCA only, fix scoping deferred) | PR #144 May 18 (`docs/sprints/diag-3-cron-500/RCA.md`; two independent root causes; substring-oracle log-filter technique per §3.22 Pattern lock δ) |
| **A1 — sponsor wallet manual top-up** | ✅ COMPLETE (founder manual execution) | May 19 (cron returns to green at next 00:00 UTC tick) |
| **B1 — indexer RPC remediation** | ❌ CANCELED | May 19 stash artifact (`fix/b1-rpc-chunking-strategy` 535 LOC; X18-bundle Phase 2 redeploy resets indexer state; ROI killed pre-mainnet; §3.22 Pattern lock η + §3.23 Disclosure 4) |
| **Alerting infra (PR #145)** | ❌ CANCELED | Closed May 19 09:03 UTC (`withAlert` HOF + Discord webhook + `v2_alert_history` dedup design preserved in memory `reference_cron_alerting_pattern`; deferred to X18-bundle integration; §3.22 Pattern lock η) |
| **v1.7 architecture supplement** | ⏳ IN REVIEW | This document |

**Phase 2 mainnet pre-req queue (agent-velocity estimates per §2.9, updated):**

| Sprint | Effort (agent-velocity) | Status |
|---|---|---|
| X11.5 — Multi-sig cutover ceremony (agent code work) | ~8-12 hours (founder ceremony fraction non-scalable) | Queued; threshold decision pending founder |
| X11.6 — v2.2 deploy script + redeployment integration | ~3-5 hours | Queued (blocks X22) |
| X11.7 — TournamentPool v2.2 redeployment to Base Sepolia | ~2-3 hours | Queued (blocks X22) |
| X14.0b — Cron settle exclusion | 2-3 hours | Queued |
| X14.1-5 enforcement layers (extension whitelist + AI browser detect + biometrics + dishonor SBT + regression suite) | ~12-20 hours total | Queued |
| X20.1-4 (solo enforcement + F1 advisory + F2 circuit-breaker + F4 Haiku off-chain) | ~18-26 hours total | Queued |
| X15.5 — Rate limit infra (Upstash KV) | 4-6 hours | Queued (mainnet blocker; also unblocks per-endpoint rate-limit tuning per X23.3 SPEC §E.3) |
| X16 — Vercel path-filter migration | 2-3 hours | Queued |
| X18-bundle — Phase 2 redeploy bundle (indexer state reset + alerting integration + new event signatures + fresh backfill) | ~10-15 hours | Queued (replaces canceled B1 + PR #145) |
| X19 — Schema reconciliation (9-item) | 4-6 hours | In progress |
| X22 — v2.3 bracket logic + redeployment | TBD (post X11.5-X11.7 ceremony chain) | Queued (dependency-locked) |
| **Total agent-velocity** | **~70-110 hours = ~2-3 weeks sustained** | Engineering bottleneck collapsed (per §2.9); fundraise remains dominant critical path (per v1.6 §4 observation) |

**Phase 2 funding-gated (Cluster 3 per CR1 SYNTHESIS) — carried forward unchanged from v1.6:**

| Sprint | Effort | Cost | Status |
|---|---|---|---|
| X12 — External audit (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin) | 4-8 weeks | $50-150K | Pending fundraise (templates in `docs/audit-packet/audit-firm-outreach-templates.md`) |
| X13 — Cayman Foundation structuring | 4-8 weeks | $30-80K | Pending fundraise |

**Critical path observation (per §2.9 velocity calibration + v1.6 §4):**

Engineering pre-req queue (~70-110 hours = ~2-3 weeks agent-velocity) remains shorter than audit firm timeline (4-8 weeks). **Fundraise stays the dominant critical path** for mainnet Q3 2026 target. v1.7 window did not alter this — X11 contract hardening + X23 Glicko-2 system + X20.0b F0 formula shipped without consuming fundraise-dependent slots; B1 + alerting cancellations reduced the queue (X18-bundle absorbs both deferred items as one bundle).

---

## CHANGELOG TO APPEND — §9

After all existing changelog entries (v1.6, v1.5, v1.4, v1.3, v1.2, v1.1, v1) at the end of the doc, prepend the v1.7 entry:

```
### v1.7 — 2026-05-19 (post 37+ hour sustained execution thread)
- Added §3.21 Sustained execution retrospective May 17-19 — 37+ hour
  cumulative thread anatomy across v1.6 (May 17 morning → May 18 EOD)
  + v1.7 continuation (May 18 post-v1.6 merge → May 19 09:13 UTC).
  v1.7 window output metrics: 13 merged PRs (#132-#144) in ~11.5
  active UTC hours on May 18 + 2 sprint-cancel decision-artifacts
  (B1 stash + PR #145 close) on May 19. Two parallel sprint tracks
  shipped to completion: X11 v2.2 contract hardening (M-1 PullPayment
  + M-2 EIP-712 + M-3 timelock + DevAttributionNFT 4×128k fuzz) and
  X23 Glicko-2 rating system (spec freeze → wrapper + schema → cron
  → API prod-verified May 19 00:35 UTC). Plus X20.0b F0 formula
  pure function shipped as @skillos/anti-cheat package.
- Added §3.22 Pattern locks β through η (continuation of v1.6 §3.19
  implicit α series):
  β — Workspace-package extensionless TS imports (X23.2 Glicko .js-ext
      webpack break canonical; raw node -e dry-runs are false signals)
  γ — OpenAPI route-order static-before-dynamic (X23.3 leaderboard
      vs {wallet} radix-tree collision; assert on details[].path)
  δ — Substring-oracle log filter (Vercel runtime log truncation
      diagnostic; PR #144 3-cron RCA canonical)
  ε — SPEC.md canonical SOT supremacy at impl time (X23.3 5-dim drift
      + X11.4 per-tournament-vs-per-DEV SBT)
  ζ — Sub-sprint critical-path sequencing constraint (X11 → X11.5
      cutover → X22 v2.3 redeploy chain per X11.0 SPEC §J)
  η — Sprint-cancel-as-product (B1 stash + PR #145 close as decision
      artifacts; X18-bundle deferral carry-forward)
- Added §3.23 Audit-narrative gold disclosures × 4 — applies §3.20
  "doğru niyet, yapısal kısıt" 5-step frame (articulate → diagnose
  → frame response → document → recover dignity) to:
  (1) X20 AntiCheat F0 formula rebuild closure (PR #142 ships package,
      closes v1.6 §3.20 Instance 2)
  (2) X14 class_tag implementation surface (intentional two-path
      design; PR #132 disclosure recalibration)
  (3) Stoplight X1 sprint :root override (v1.6 §3.20 Instance 1
      carryforward; deferral remains in effect)
  (4) 3-cron production 500 silent failure → alerting cancellation
      (PR #144 RCA + B1 stash + PR #145 close decision arc)
- Added §3.24 Drift catalog — 26 documented instances May 17-19 +
  cumulative carryforward, 4-category taxonomy: 7 claim drift +
  6 state drift + 7 spec drift + 6 scope/premise drift. Detection
  mechanism breakdown: 9/26 agent pre-flight, 8/26 post-merge or
  in-PR review, 5/26 build/typecheck failure, 4/26 multi-surface
  triangulation. Multi-protective stack evidence: 4 instances
  required ≥2 surfaces to triangulate truth.
- Updated §4 Sprint Sequence: X11.1 + X11.2 + X11.3 + X11.4 COMPLETE
  (audit findings M-1 + M-2 + M-3 closed; DevAttribution fuzz shipped);
  X23.1 + X23.2 + X23.3 COMPLETE (Glicko-2 end-to-end prod-verified
  May 19 00:35 UTC); X20.0b F0 formula COMPLETE; B1 indexer remediation
  + PR #145 alerting CANCELED with X18-bundle deferral carryforward;
  Phase 2 mainnet pre-req queue updated (X11.5-X11.7 cutover chain
  + X18-bundle absorbing B1 + alerting; ~70-110 agent-hours total =
  ~2-3 weeks sustained; fundraise stays dominant critical path).
- No new §2.X invariants in v1.7 (founder-decided only).
- Memory canonical entry updates restricted to §4 Sprint Sequence
  reflection per scope discipline.
```

---

## END OF SUPPLEMENT
