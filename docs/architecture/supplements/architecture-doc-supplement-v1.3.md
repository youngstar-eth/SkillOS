# SkillOS Architecture Doc — Supplement v1.3 (May 14, 2026)

> **Purpose:** Add three sections to `docs/architecture/developer-surface.md`:
> - §2.5 — Mainnet pre-req checklist (NEW in v1.3)
> - §3.9 — Sprint X9-X10 retrospective (NEW in v1.3)
> - §3.10 — Skill Pack v0.2 (NEW in v1.3)
>
> Plus update §4 Sprint Sequence to mark X1-X10 complete and add X11+ candidates.
>
> **Approval:** Founder approved May 14, 2026 (post X9-X10 marathon sprint thread).
>
> **Baseline:** v1.2 (May 10, 2026) remains the architectural invariant baseline. v1.3 is **operational learnings + mainnet pre-req escalation** layered on top.

---

## SECTION TO INSERT — §2.5

Insert this section **after §2.4 (Domain Neutrality Invariant)** and **before §3 (Architecture — Layer by Layer)**.

---

### 2.5 Mainnet Pre-req Checklist

This section catalogs operational invariants and verification gates that must be satisfied before mainnet activation. These are derived from Phase 1 testnet learnings (X1-X10 sprint thread) and represent **hard mainnet pre-reqs** — not soft polish items.

**Contract layer:**

- **v2.2 developer fee splitter** — `createTournament(developerAddress)` param, `withdrawFeesToDev()` + `withdrawFeesToPlatform()` separate functions, Foundry invariant test `feeCollected_dev + feeCollected_platform == total_fees`, soulbound dev attribution NFT. Phase 1 70/30 split is currently off-chain commitment only.
- **Class-aware fairness X8** — tournament-level class declaration (human-only / agent-only / mixed-declared), extension whitelist, AI browser detection (Comet/Atlas/Antigravity/Claude-in-Chrome), behavioral biometrics, soulbound dishonor NFT for violations.
- **3rd party audit** — Trail of Bits / OpenZeppelin / Spearbit. Slot booking lead time 2-4 weeks, audit duration 4-8 weeks. **Book NOW for Q3 2026 mainnet timeline.**

**Legal layer (parallel to contract work):**

- **Cayman Foundation structuring** — Uniswap / Optimism / Arbitrum precedents. 4-8 weeks.
- **US legal opinion** — state risk matrix (IA / AR / LA / TN geofence requirements per dominant factor test analysis).
- **Turkish counsel** — already approved pure-infrastructure architecture (28 Apr 2026); reconfirmation at mainnet cutover.

**Operational invariants (X9-X10 thread learnings):**

- **Post-merge Vercel production commit verification mandatory.** Per X10 lesson: `apps/api` is prebuilt-only by design, auto-deploy does not trigger on git push. After every PR merge that touches `apps/api`, run `vercel ls | head -3` and verify top entry matches main HEAD. Without this verification, code can be merged + CI green + memory marked "shipped" while production runs N-days-old artifact.
- **Live tx verification on testnet before sprint close.** Unit test green ≠ live integration verified (X9.1 + X10 case studies). End-to-end calldata assertion required for every wire change.
- **Wallet topology hygiene at deployment time.** Phase 1 testnet uses single trustedSigner + sponsor wallet (acceptable). Mainnet requires zero on-chain connection between role-distinct addresses (trustedSigner, sponsor wallets, deployer, x402 receive wallet). Fund each via separate fiat onramps; no wallet-to-wallet transfers.
- **Agent retry payments** — T0 attestation signer currently does NOT compute `feePaidByPlayer × priorSoloCount × RETRY_FEE`. Mainnet requires either T0+retry tier extension (signer logic), separate retry-fee path, or T1+ default tier for agents. Phase 2 backlog: **agent retry payments** sprint.
- **Vercel path-filter migration** — `turbo-ignore` deprecated, auto-deploy reliability not guaranteed. Phase 2 backlog escalated from FUTURE to NOW-blocker per X10 root cause analysis.

**Brand + infra cutover (orthogonal to mainnet, but parallel):**

- Mainnet builder code re-wiring (testnet bc_* codes remain Phase 1 attribution).
- Auto-tournament creation (daily/weekly/monthly cycles).
- 3rd-party developer SDK rollout (web-native first, Unity WebGL adapter next, Roblox/Godot/Unreal after).
- Agent player class API.
- TournamentCreated indexer.
- Next.js 16 upgrade.

**Reverification cadence:**

Every 2 weeks during Phase 2 prep, the mainnet pre-req checklist is reviewed against current sprint progress. Items move from `pending` → `in-progress` → `verified` → `audit-approved` states. No mainnet activation without all items in `audit-approved` state.

---

## SECTION TO INSERT — §3.9

Insert this section **after §3.8 (SkillOS Skill Pack — Vector 1 distribution)** and **before §4 (Sprint Sequence)**.

---

### 3.9 Sprint X9-X10 Retrospective — Phase 1 wrap-up learnings

This section documents operational discoveries from the May 13-14 sprint thread (X9 cron data layer fix + X9.1 preflight + X9.2 burn rate + X10 server-side dataSuffix attribution). These learnings inform mainnet pre-req design (§2.5) and protocol invariant phrasing.

**3-PR composition pattern (X10 thread anatomy):**

The X10 thread shipped as 3 PRs that compose into a coherent operational fix:

1. **PR #80 (X9.1 preflight)** — observability layer. Strict sponsor USDC balance check at sweep start, fail-loud with structured deficit logs.
2. **PR #81 (X9.2 burn rate)** — demand-side reduction. Daily tournament prize pool default 10 → 5 USDC (testnet runway extension).
3. **PR #82 (X10 attribution)** — wire closure. Server-side `submitSoloScore` builder code dataSuffix attribution for Path A agent submissions.

**Pattern:** observability → early-warning → demand-side reduction → wire closure. Each PR is independently reviewable; the cumulative effect achieves mainnet-readiness on the agent funnel side.

This pattern is reusable for any systemic gap: identify failure surface (observability), build alerting (early-warning), reduce stress on the system (demand-side), then close the wire (root fix).

**Wallet burndown RCA case study (match3 chronic + 5/10 outage):**

Root cause: `TOURNAMENT_GAMES = [2048, wordle, sudoku, minesweeper, clicker, match3]` iteration order × finite sponsor wallet balance = silent compounding failure. Match3 (last iteration) was the first to fail as balance depleted across the cron sweep. 5/10 was the all-iteration case (zero balance at sweep start, all 6 reverted).

Pre-X9 substring-match catch silently swallowed the revert via ABI-metadata false-positive on "TournamentAlreadyExists" in viem's `formattedMetaMessages`. X9 strict throw exposed it loudly. X9.1 preflight balance check prevents it from happening at all.

**Architectural takeaway:** schedule properties (cron iteration order) × operational environment properties (wallet topology) collide in failure modes neither alone exhibits. Mainnet alerting layer is mandatory.

**apps/api prebuilt-only deploy recipe (X10 root cause):**

Per X1 sprint design (memory `reference_vercel_monorepo_hono_playbook`), `apps/api` uses `@vercel/node` runtime with hono + OpenAPI app + npm-workspace-hoisted deps. Node File Tracing (NFT) cannot follow hoisted dependencies on auto-deploy; the manual recipe flattens 126 prod packages into the function bundle AND strips the NFT filePathMap.

**Canonical deploy command sequence:**

```bash
cd /Users/inancayvaz/MAS && npm install
cd apps/api && ./scripts/prepare-bundle.sh
vercel deploy --prebuilt --prod --archive=tgz
```

**Trap to avoid:** `cd apps/api && vercel --prod` implicitly takes the git-style deploy path (CLI uploads CWD, runs `vercel.json` `installCommand`), which expects "Include source files outside of Root Directory" + Git clone — apps/api does not have either configured. The `--prebuilt --archive=tgz` flags bypass the install step entirely.

**Four patterns locked (pattern memory candidates):**

1. **Evidence double-duty** — bug evidence sometimes blocks fix verification simultaneously. (X10 case: Run #7's 4 zero-tail txs proved pre-X10 attribution gap AND exhausted per-agent T0 one-shot, blocking same-day chain-verify of the fix.) When fixing a bug, audit whether existing evidence is reusable or itself a blocker for fresh evidence.

2. **Schedule × ops collision** — cron iteration order × wallet topology = silent compounding failure surface. Generalizes: schedule property × operational environment property collisions are common in distributed systems where neither component alone is broken. Audit cron schedules against ops environment characteristics at design time.

3. **Unit test green ≠ live integration verified** — PR #82 unit tests passed (encoder function works in isolation), but live runtime had zero attribution (wrong handler hooked OR deploy stale). End-to-end calldata assertion required for every wire change.

4. **Post-merge runtime truth check mandatory** — code merged + CI green + memory marked "shipped" ≠ production runtime verified. Required check sequence: (a) `vercel ls` confirms production commit matches main HEAD, (b) endpoint runtime spec query confirms code loaded, (c) end-to-end live trace confirms behavior.

**Builder Code attribution chain (Run #7 baseline + 5/15 chain-verify):**

Pre-X10 Run #7 (May 14 ~10:00 UTC) broadcast 4 successful tx, all with **zero dataSuffix tail** (712 hex chars = minimum ABI encoding). This is the documented baseline of the pre-X10 attribution gap.

X10 fix (PR #82) deployed via prebuilt recipe; OpenAPI runtime confirms `game` field required on `/v1/agents/scores`. Chain-verify deferred to 5/15 morning re-trigger (T0 one-shot constraint per same-tournament priorSoloCount exhaustion).

Expected post-fix calldata: 734 hex chars (712 ABI + 22 hex for `bc_*` ASCII tail), per-game tail matches canonical builder code map (memory entry `SkillOS Builder Codes canonical`).

---

## SECTION TO INSERT — §3.10

Insert this section **after §3.9 (Sprint X9-X10 retrospective)** and **before §4 (Sprint Sequence)**.

---

### 3.10 Skill Pack v0.2 — mdskills.ai listing optimization

✅ **Phase 2 inclusion confirmed; v0.2 update in progress (May 14, 2026).**

**Phase 1 status (X3.5 sprint, May 12-13):**

- `packages/skills/` shipped via X3.5 sprint
- Public mirror `youngstar-eth/skillos` (subtree split)
- npm publish `@skillos/skills` (claimed scope)
- mdskills.ai catalog listing live: https://www.mdskills.ai/skills/skillos
- Distribution channels confirmed: npm + base/skills + mdskills.ai + CCGS

**Skill Advisor baseline (3.2 / 10 — Weak band):**

Per https://www.mdskills.ai/docs/skill-advisor, three evaluation dimensions:

1. **Capabilities** — actionable, well-scoped, executable without guessing
2. **Quality** — trigger conditions, step-by-step, examples, edge cases, progressive disclosure
3. **Security** — appropriate permissions, no over-scope, no injection surface

Current weaknesses (per listing review):
- No agent-executable skills, triggers, or step-by-step instructions
- Broad permissions declared without corresponding agent task definitions

**v0.2 update scope (in progress):**

| Dimension | Current 3.2 | v0.2 target 7+ |
|---|---|---|
| Capabilities | README-style descriptive | YAML `when_to_invoke` triggers + prompts/ actionable instructions |
| Quality | No progressive disclosure, no edge cases | SKILL.md → prompts/ → references/ tiered structure with X10 case study |
| Security | Permissions declared, not justified | Per-permission `purpose` field with narrow scope |
| Examples | Missing | Integration walkthrough + edge case handling |
| Stale facts | "No CI today" (incorrect, CI active) | Reflect current state: ci.yml + agent-runner.yml + branch protection + X9-X10 thread PR-driven |

**Lock criteria for v0.2:**

- `@skillos/skills@0.2.0` published to npm
- mdskills.ai catalog refresh triggered (push to public mirror)
- Skill Advisor regenerated score ≥ 7
- README stale items corrected (CI active, Phase 2 discipline ACTIVE)
- VALIDATION.md updated with founder test of new content via Claude Code

**Constraints (preserved from X3.5 baseline):**

- Domain neutrality invariant (§2.4) — skill pack public content uses skill-gaming-context framing
- Builder code map canonical — do not invent new codes
- `@skillos/sdk` references match current scaffold state (not promise SDK if not scaffolded)

**Estimated effort:** 3-4 hours autonomous agent (started May 14 afternoon, parallel to X10 chain-verify deferral window).

---

## UPDATE TO §4 — Sprint Sequence current state

After all existing X1-X7 sprint entries in §4, mark sprints complete and add candidates:

---

**Sprint Sequence — current state (May 14, 2026):**

| Sprint | Status | Notes |
|---|---|---|
| X1 — Read-only API foundation | ✅ COMPLETE | apps/api scaffolded, OpenAPI spec served, Stoplight Elements UI live |
| X2 — Human writes via SIWB | ✅ COMPLETE | SIWB bearer token middleware, replay protection |
| X3 — SDK v0.1 (no agent auth) | ✅ COMPLETE | `@skillos/sdk@0.1.0` published, 2048 migrated, Builder Code attribution verified |
| X3.5 — SkillOS Skill Pack v0.1 | ✅ COMPLETE | `@skillos/skills@0.1.0` published, mdskills.ai catalog listing live |
| X4 — Agent auth via SIWA | ✅ COMPLETE | SIWA middleware drop-in, ERC-8128 per-request signing |
| X5 — x402 paywalled endpoints | ✅ COMPLETE | /v1/data/* endpoints with @x402/hono middleware |
| X6 — MCP server + CLI | ✅ COMPLETE | `@skillos/mcp` + `@skillos/cli` published |
| X7 — Game migrations + agent-runner | ✅ COMPLETE | PR #76 + #77 merged, 11 GH secrets, workflow live |
| **X9 — Tournament data layer fix** | ✅ COMPLETE | PR #78: strict revert decode + audit columns + DB-orphan recovery |
| **X9.1 — Wallet preflight check** | ✅ COMPLETE | PR #80: structured deficit logging, fail-loud at sweep start |
| **X9.2 — Burn rate reduction** | ✅ COMPLETE | PR #81: testnet prize pool 10 → 5 USDC + Vercel env removal |
| **X10 — Server-side dataSuffix attribution** | ✅ DEPLOY VERIFIED | PR #82: code live on apps/api commit 984696a; chain-verify deferred 5/15 morning |
| **Skill Pack v0.2** | ⏳ IN PROGRESS | Skill Advisor 3.2 → 7+ target, autonomous agent shipping |

**Sprint X11 candidates (post-X10 chain-verify close, Phase 2 prep window):**

| Candidate | Scope | Phase | Effort |
|---|---|---|---|
| X11 — v2.2 contract scope | createTournament(devAddr), withdraw splits, Foundry invariants | P2 mainnet pre-req | 1-2 weeks |
| X12 — Audit firm outreach + slot booking | Trail of Bits / OpenZeppelin / Spearbit parallel inquiries | P2 mainnet pre-req | 2-4 weeks lead time |
| X13 — Cayman Foundation counsel inquiry | Structuring + jurisdictional setup | P2 mainnet pre-req (parallel) | 4-8 weeks |
| X14 — Class-aware fairness X8 implementation | Extension whitelist + AI browser detect + behavioral biometrics + dishonor SBT | P2 mainnet pre-req | 2-3 weeks |
| X15 — Agent retry payments | T0+retry signer logic OR T1+ default tier | P2 mainnet pre-req | 1 week |
| X16 — Vercel path-filter migration | turbo-ignore replacement, deploy reliability | P2 mainnet pre-req | 3-5 days |
| X17 — Settle-side silent swallow fix | Parallel bug at line ~739 per issue #79 | P2 hardening | 1 week |
| X18 — Match3 chronic monitoring | Wallet alerting + auto top-up signal | P2 hardening | 1 week |

**Sprint X11+ sequencing principle:** X11-X16 are blocker-class for mainnet (parallel where possible). X17-X18 are Phase 2 hardening (parallel to audit window).

---

## CHANGELOG TO APPEND — §9

After all existing changelog entries (v1.2, v1.1, v1) at the end of the doc, prepend the v1.3 entry:

```
### v1.3 — 2026-05-14
- Added §2.5 Mainnet pre-req checklist — catalogs operational invariants 
  and verification gates derived from X1-X10 sprint thread learnings.
  Includes contract + legal + operational + brand cutover layers, 
  reverification cadence every 2 weeks during Phase 2 prep.
- Added §3.9 Sprint X9-X10 retrospective — documents 3-PR composition 
  pattern (observability → early-warning → demand-reduction → wire), 
  wallet burndown RCA case study (schedule × ops collision pattern), 
  apps/api prebuilt-only canonical deploy recipe, four locked patterns 
  (evidence double-duty, schedule × ops collision, unit-test ≠ live, 
  post-merge runtime truth check).
- Added §3.10 Skill Pack v0.2 — mdskills.ai listing baseline 3.2 / 10 
  Skill Advisor, v0.2 target 7+ across capabilities + quality + security 
  dimensions, autonomous agent shipping update.
- Updated §4 Sprint Sequence: X1-X10 marked complete (X10 deploy verified, 
  chain-verify pending 5/15), Skill Pack v0.2 in progress, X11-X18 
  candidates queued for Phase 2 prep window.
```

---

## END OF SUPPLEMENT
