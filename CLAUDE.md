# SkillOS Monorepo

Multi-app SkillOS monorepo — 7 game apps + 1 sponsor app + 7 shared packages + Foundry contracts + Supabase migrations. Each app deploys to its own Vercel project under scope `simpl3s-projects`. Production: `*.skillos.games` subdomains; chain: Base Sepolia.

For strategic narrative (3-sided platform thesis, AI pillars, revenue streams, full phase roadmap), see [`README.md`](./README.md). **This file is agent-operational guidance only — it does not duplicate `README.md`.**

## Project context

The locked architecture, phase roadmap, and pitch pack live in **claude.ai project memory** + `skillos-roadmap.md` / `skillos-pitch-pack.md` project files. **These docs are not on disk** — they live in the claude.ai project context, not the filesystem. When making strategic decisions about phase positioning, narrative framing, or tokenomics, reference them via the founder rather than searching the codebase.

## Companion repo: skillos-apex

The public-facing marketing site (`https://skillos.games`) lives in a **separate repo** at `/Users/inancayvaz/skillbase-apex` — see its [`CLAUDE.md`](file:///Users/inancayvaz/skillbase-apex/CLAUDE.md) for apex conventions. (Local folder still named `skillbase-apex` until the founder renames it; the repo on GitHub is `youngstar-eth/skillos-apex`.) Two routes share one Vercel scope but two separate codebases:

- **SkillOS monorepo (this repo)** — six game apps + sponsor dashboard + Phase 1 protocol contracts. Source-of-truth for runtime systems and on-chain logic.
- **skillos-apex** — marketing site copy + OG image + locked-architecture narrative. Source-of-truth for **public messaging** (tagline, hero lede, OG metadata, 4-phase public roadmap).

Apex tagline / phase-framing changes do **not** auto-propagate to SkillOS README.md (or vice versa). If you change positioning here, check whether apex needs a sister update — and remember the two phase numbering systems described below.

## Tech stack

- **Workspace:** npm 10.9.0 + workspaces (`apps/*`, `packages/*`); Node ≥ 20.0.0
- **Build orchestration:** Turborepo 2.3.3 — `turbo.json` defines dev/build/lint/typecheck pipelines with `^build` topology between packages
- **TypeScript:** 5.6.3, root `tsconfig.base.json` extended per-app/per-package
- **Lint:** ESLint 8.57.1 + eslint-config-next 16.2.4 (root [`package.json`](./package.json)). Apex repo also on Next 16; **don't cross-pollinate config or codemods between repos** — Vercel project wiring and deploy configs still diverge.
- **Frontend:** Next.js 16.2.4 App Router across all 8 monorepo apps (2048, wordle, sudoku, minesweeper, clicker, match3, sponsor, orchestrator — see [`apps/*/package.json`](./apps)); each deploys independently to its own Vercel project.
- **Smart contracts:** Foundry, Solidity 0.8.26, OpenZeppelin, optimizer 200 runs. Dual-profile pipeline ([`contracts/foundry.toml`](./contracts/foundry.toml), [ADR 0002](./docs/adr/0002-dual-profile-pipeline-split.md)): `profile.default` uses `via_ir = true` (ChallengeEscrow + all Phase 2 deploys); `profile.phase1-legacy` uses `via_ir = false` for reproducing the five pre-X19a deployed bytecodes (TournamentPool v2.1, SponsorshipModule, SponsorReceiptSBT, MockSanctionsOracle, SkillbaseAnchor). Set `FOUNDRY_PROFILE=phase1-legacy` to switch profiles.
- **Chain:** Base Sepolia (testnet), `https://sepolia.base.org`; mainnet migration is Phase 2-gated and audit-pending
- **Database:** Supabase Postgres (migrations in `supabase/migrations/`, forward-only)
- **Script runner:** tsx 4.21.0
- **Dep overrides:** `axios@^1.15.0` forced across `@coinbase/cdp-sdk` + `axios-retry`

**CI active:** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs four required gates on every PR to `main` (and on `main` pushes for defense-in-depth): `typecheck`, `test-ts` (15 node:test files via tsx), `test-foundry` (`forge test -vvv` in `contracts/`), and `lint` (`next lint` per app). Vercel previews additionally deploy each PR per Vercel project (8 game/sponsor apps + apex). Direct-to-main is BANNED (see Engineering discipline below); PR review + green CI required before squash-merge.

## Structure

```
apps/
  2048           — reference implementation; hosts public x402 endpoints
  wordle, sudoku, minesweeper, clicker, match3
                 — solo-tournament flow, mirror 2048 architecture
  sponsor        — permissionless prize-pool funding dashboard

packages/
  ai-coach       — Claude Sonnet 4.6 (Coach) + Haiku 4.5 (Recap, Anti-Cheat)
  contracts      — ABIs + addresses + game-slug helpers (re-exports from /contracts/out)
  duel-backend   — solo handlers, settle, settle-guard, cron
  game-types     — shared TS types (Duel state, status enums)
  lib-shared     — shared utilities
  sp-engine      — Skill Points calculation engine
  ui             — shared React components (incl. <DuelComingSoon />)

contracts/       — Foundry workspace
  src/           — Solidity sources
  test/          — Foundry tests (extend the existing settle-guard tripwire pattern)
  lib/           — vendored deps (openzeppelin-contracts, forge-std)
  deployments/   — chain deploy artifacts
  broadcast/     — forge script outputs

supabase/migrations/  — Postgres migration files (forward-only)

docs/            — sponsor-flow.md, audit/, superpowers/
reports/         — point-in-time audits (ultrareview-*, codebase-hygiene-*, x402-*)
scripts/         — one-shot ops (backfill-sp, seed-jury-tournaments, *-smoke.sh)
```

## Architectural invariants

These are non-negotiable. Any change risking these requires explicit founder discussion before merge.

1. **Sweepstakes safety.** Retry fees and prize pools live on **separate storage slots** in `TournamentPool`. Sponsor wallets fund pools directly via `sponsorPool()`. Foundation treasury **never** funds prize pools. A buggy module physically cannot corrupt segregated accumulators. The `settle-guard` integration tests are the tripwire — extend them, don't skip them.
2. **Pure infrastructure.** SkillOS smart contracts are non-custodial. No KYC at the protocol layer. Sanctions oracle is the only gate.
3. **Agent participation is a class, not a feature flag.** Players field includes both human and agent participants on the same arena. SP-tier-classified data flows uniformly across classes.
4. **No subscription tier.** All AI-data licensing flows through x402 per-call settlement. No enterprise quote, no monthly tier.
5. **AI is fire-on-mount, not blocking.** Coach/Recap routes POST from the result page mount, not from the submission path. Tournament settlement never depends on AI availability.
6. **Cron is the only writer of tournament state.** Per-app `/api/cron/*` routes (signed by `STUDIO_PRIVATE_KEY`, gated on `CRON_SECRET`) drive tournament create + settle. Manual settle paths exist only for ops break-glass — don't add new write surfaces.
7. **Achievement-gated tokenization.** Token economy is **optional, not promised**. Activation requires sustained adoption + regulatory clarity + organic economy maturity. Optionality > obligation.
8. **Self-evolving narrative restraint (v1.8-C8 lock).** Layered positioning respected across pitch + public surfaces. Funding window: agentic gaming traction is the PRIMARY framing; self-evolving substrate is touched on demand. Public marketing: tagline + one tier-2 narrative section, not over-amplified, to avoid the W26 "agent-infra startup fatigue" anti-pattern. Long-term measurement vision is the deep value proposition, not the lede headline. §2.4 L3 vertical expansion remains internal-only (NOT a roadmap promise).

## Two phase numbering systems

Two systems coexist intentionally:

| Frame | Where it lives | Phase 02 means | Phase 03 means |
|---|---|---|---|
| **Engineering-internal** | this repo's `README.md`, internal pitch | "in-progress" (solo polish, bracket tournament structure (X22), SDK alpha) | "Q3 2026 mainnet (post-legal-review)" |
| **Marketing-public** | apex `lib/apex.ts`, `https://skillos.games` | "Mainnet activation, H2 2026, audit-gated" | "Decentralization (when substrate proves itself)" |

Don't reconcile — the two audiences have different granularity needs. When writing **public-facing copy**, use the marketing-public system; when writing **internal docs / commit messages / GitHub issues**, use the engineering-internal system. README.md and apex are intentionally on different cadences.

## Vercel push gating

Vercel rejects pushes signed with a non-canonical git author identity for any branch destined for `youngstar-eth/skillos` or `youngstar-eth/skillos-apex`. Before committing on any branch:

```bash
git config user.email '251514042+youngstar-eth@users.noreply.github.com'
```

Critical for any branch pushed to a Vercel-linked project (mas-* + skillbase-* projects).

## CLI/MCP first principle

**Don't send the founder to dashboards.** Past lessons:
- Vercel UI parsing bug truncated install commands → use vercel.json overrides
- Supabase UI manual edits caused state confusion → use REST API or migrations
- GitHub UI multi-step flows → gh CLI faster + reproducible

Use CLI tools (vercel, gh, cast, forge, supabase, npm) over dashboard manual work whenever possible. Dashboard is last resort, only when CLI/code-side fix is impossible.

## Vercel build skip optimization (deferred to Phase 2)

**Investigation completed May 5 2026; implementation NOT adopted; deferred to Phase 2.**

The post-YC backlog item *"Turbo `--filter` pipeline optimization (skip unaffected app builds on packages/* changes)"* was investigated against all 7 Vercel projects (mas-2048, mas-wordle, mas-sudoku, mas-minesweeper, mas-match3, mas-clicker, skillbase-sponsor). Two findings made the obvious solution non-viable:

1. **`turbo-ignore` is officially deprecated by Vercel.** When invoked during a deployment, it prints `"turbo-ignore" is deprecated. Use Vercel's built-in project skipping instead.` Adopting it adds a deprecation tail we'd have to migrate off later.
2. **First-deploy-on-new-branch fallback semantics build, don't skip.** turbo-ignore looks for a previous successful deploy on the **same branch** to compare against. If none exists (first push on a new branch), it falls back to "build" as the safer default. This means turbo-ignore can't help with the first push of any PR branch — only with subsequent pushes on the same branch, which are typically rare in our workflow.

The investigation set + verified + tested + rolled back the configuration cleanly via Vercel REST API (`PATCH /v9/projects/<name>` with `commandForIgnoringBuildStep`). All 7 projects ended at `null` (no skip configured). No platform-side residue.

### Phase 2 follow-up

Migrate to **Vercel's built-in monorepo skipping** (the feature the deprecation warning points at). Likely paths:

- Path-based filters per project (Settings → Git → "Connected Git Repository" filters) so each project only deploys when files matching its `apps/<name>/**` or relevant `packages/**` paths change.
- Or: deeper Turborepo Remote Cache integration so unchanged builds get cache-hit short-circuits at the function level rather than the deployment level.

The shared-package fan-out concern is real either way: changes to `packages/ui/`, `packages/contracts/`, `packages/lib-shared/` SHOULD trigger all 7 builds. Whatever Phase 2 mechanism we adopt must preserve that fan-out; only changes whose blast radius doesn't intersect a given app's source should be skipped for that app.

### Reference

- This investigation: PR #32 (the discovery findings + REST API rollback procedure are preserved in the commit body and PR description as the durable artifact)
- Vercel deprecation notice surfaced at runtime by `turbo-ignore` v2.9.9
- [Vercel "Ignored Build Step" docs](https://vercel.com/docs/projects/overview#ignored-build-step) (the platform feature; `turbo-ignore` is one possible content for that field, not the only option)

## Engineering discipline (Phase 2 transition)

**Already in force:**

- **CI gate active** — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) enforces 4 required checks (`typecheck`, `test-ts`, `test-foundry`, `lint`) on every PR to `main`. Branch protection requires CI green + PR approval before merge (solo-founder approval waiver per repo settings).
- **Direct-to-main BANNED** — branch + PR + squash-merge mandatory.
- **ADR docs** in [`docs/adr/`](./docs/adr/) for major decisions (see ADR 0002 for the Foundry dual-profile split).
- **Memory discipline** — cross-cutting architectural deltas committed per-decision.

**Phase 2 carry-forward (not yet in CI):**

- Per-sprint drift sweep (30 dk audit committed) — manual today, candidate for `.github/workflows/` gate.
- Pre-commit hooks (husky + lint-staged: typecheck + secret scan).
- Integration test expansion (extend settle-guard tripwire pattern).

## Pre-flight gates (MANDATORY for production-state operations)

This repo enforces the §2.10 Triangulation Budget invariant (canonical in
[`docs/architecture/supplements/architecture-doc-supplement-v1.8.md`](./docs/architecture/supplements/architecture-doc-supplement-v1.8.md) §2.10).

> *"For decisions touching production state, sprint dispatch must declare
> ≥2 verification surfaces. Single-surface decisions are permitted only for
> non-production state changes. Multi-surface triangulation is enforced at
> scoping, not at recovery."*

### When this applies

- Any sprint that modifies `main` branch, contracts, or deploy artifacts
- Any sprint touching production runtime (Vercel, Supabase, on-chain Base)
- Any sprint with cross-worktree implications
- Any sprint reading or modifying generated artifacts (`*.gen.ts`)
- Any sprint where state assumptions cross multiple commands
- Branch creation, commit, push, PR open, merge operations

### When this does NOT apply

- Pure documentation read-only review
- Single-file artifact creation in isolated /tmp scratch work
- Conversational exploration without commit intent
- Founder explicit bypass: "single-surface OK because [reason]"

### Template structure (paste into agent prompts)

Every agent dispatch prompt for production-state work MUST begin with:

````
## Pre-flight gates (BEFORE any write)

State assumptions:
- [List each implicit assumption explicitly]
- Example: Working tree on `main`, clean
- Example: File X exists at path Y with property Z
- Example: Production at api.skillos.network serves endpoint W

Verification commands:

```bash
# 1. <verify assumption 1>
<command>
# Expect: <output>

# 2. <verify assumption 2>
<command>
# Expect: <output>
```

STOP CONDITIONS:
- Any verification output diverges from expected
- Any cross-surface mismatch (memory vs repo vs runtime)
- Any pre-existing state would be silently overwritten

→ STOP and surface to founder with divergence detail.
→ DO NOT proceed under uncertainty.
````

### Surface categories (canonical)

The Triangulation Budget invariant defines three verification surfaces:

1. **Memory** — claude.ai project memory entries, supplement files, prior
   chat context, sprint notes
2. **Repo** — git state, on-disk file contents, file structure, branch
   positions, hash blobs
3. **Runtime** — production API behavior, deployed contracts, live database
   state, observable system behavior

For each assumption, identify which surface(s) verify it. A single-surface
decision touching production state is a §2.10 violation.

### Worktree isolation default

Per §3.22 pattern lock θ (shared checkout race) + v1.8-S3 (workspace
concurrency surface):

- Default: agent dispatch operates in ISOLATED git worktree, NOT shared
  `/Users/inancayvaz/MAS` mainline
- Create isolated worktree: `git worktree add ../MAS-<sprint> -b chore/<sprint> main`
- DO NOT run `git checkout -b` on shared mainline — yanks other agents off `main`
- Mainline reserved for active code-reading and final pulls

### Bypass cases

When the §2.10 rule is overly conservative for a small change, the founder
may explicitly bypass with phrasing like:

> "single-surface OK for this prompt because [reason]"

This bypass is logged in the next supplement's §3.28 drift catalog under
D-class (doc/discipline drift) for retrospective audit.

### Tooling layered defense

Pre-flight gates are the FIRST line of defense (planning time). Repo also
enforces layered defenses:

- **`.husky/pre-commit` hook** (X24.2): last line at commit time, mainline-
  activated only (worktree linked-checkouts cannot fire pre-merge)
- **CI guards** (X24.3): first line at PR time, server-side enforcement
  regardless of local hooks
- **ADRs** (X24.4): explicit documentation layer for policy-level decisions

If any single layer fails (e.g., hook activation lifecycle constraint), the
other layers maintain enforcement. Defense in depth = audit-firm requirement.

### Examples from v1.8 thread (canonical instances)

- **v1.8-C1** PR #121 vs #130 X14.0 confusion — caught by triangulation
  (memory + git log + commit content)
- **v1.8-C3** §2.13 vs §2.10 numbering slip — caught by pre-draft Gate 4
  triangulation. Self-demonstrating: the invariant caught its own naming.
- **v1.8-S2** 3-worktree X14.0 hand-edit — caught by forensic ownership
- **v1.8-S3** 40+ concurrent agent shared mainline — caught at X24.2 Q2

See [`docs/architecture/supplements/architecture-doc-supplement-v1.8.md`](./docs/architecture/supplements/architecture-doc-supplement-v1.8.md)
§3.28 for full drift catalog (8 instances + 8 v1.9 candidates from X24.1-2
thread).

## Decision priority order

1. **Sweepstakes safety > everything.** If a change risks the invariant, stop and discuss.
2. **Submission readiness > polish.** Until May 4, 2026, prioritize what's submission-relevant.
3. **Architectural coherence > feature velocity.** Don't add capabilities that contradict locked architecture.
4. **Honest framing > overclaim.** Pitch what's actually shipped, signal what's roadmap, never promise unconditional tokens.
5. **Phase-aware decisions.** Phase 1 ≠ Phase 2 capabilities. Don't promise mainnet features in testnet pitch.
6. **CLI/MCP first.** Dashboard manual work is last resort.

## Active backlog awareness

**Post-YC backlog** (don't auto-suggest mid-sprint):
- SkillOS rebrand cutover (Phase 2 v2.2 mainnet window)
- Apex CLAUDE.md drift sync (already done in apex PR #11)
- Cron settle throughput refactor
- Next.js 16.2.4 bump
- TournamentCreated event indexer
- VERCEL_AUTOMATION_BYPASS_SECRET setup for apex previews
- 3 ambiguous SkillOS monorepo branches review (per-game-og-routes, v3-monorepo, v2-clean)

**Pitch-only (NOT public marketing yet):**
- Cross-lab agent interoperability claims at scale
- Specific AI lab data licensing volumes (until first contract signed)

**Controlled public + funding narrative** (relaxed from pitch-only May 20, 2026):
- Phase 5 substrate intelligence (foundation models trained on verified measurement data). Framed as "what this measurement infrastructure enables" — utility use case, NOT investment premium. No token-economic claims, no valuation language, no fixed launch dates. Achievement-gated optionality preserved.

## When in doubt

- Check skillos-roadmap.md for phase positioning (claude.ai project memory)
- Check skillos-pitch-pack.md for narrative framing (claude.ai project memory)
- Check claude.ai project memory entries (locked architecture, post-YC backlog, pitch references)
- Ask the founder before scope-creeping
- Suggest defer when submission timeline is tight
