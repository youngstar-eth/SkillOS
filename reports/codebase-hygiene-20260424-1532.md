# Codebase Hygiene + Apex Copy Audit

**Date:** 2026-04-24 15:32 local
**Scope:**
- `/Users/inancayvaz/MAS` (monorepo — 6 games, 7 packages, Foundry contracts)
- `/Users/inancayvaz/skillbase-apex` (marketing site)
**Mode:** Read-only scan. No files edited, no commits, no tooling installed. Working tree clean.

> **Note:** An earlier report `codebase-hygiene-20260424.md` exists in `reports/` from a prior run this morning. This file is a fresh full pass with the expanded Category K (revenue model) + full Category L (apex verbatim dump).

---

## Summary

| Category | Findings | Priority | Jury-visible |
|---|---|---|---|
| A — Nomenclature drift (XP→SP) | 0 | — | clean |
| B — Stale roadmap / Phase refs | 0 | — | clean |
| C — Dead code | 0 | — | clean |
| D — Commented code blocks | 0 | — | clean |
| E — TODO/FIXME/HACK | 1 (backlog, tracked) | LOW | no |
| F — v1 / deprecated refs | 1 (by design, rollback) | MED | no |
| G — Debug/dev artifacts | 0 `console.*`/`debugger`/test-wallet issues + **8 `.env.example` gaps** | **HIGH** | **yes** |
| H — README / docs freshness | **5 HIGH**, 1 MED | **HIGH / CRITICAL** | **yes** |
| I — Copy experiments | 0 | — | clean |
| J — Migration hygiene | 0 | — | clean |
| K — Revenue model alignment | **3 CRITICAL** (all on apex) | **CRITICAL** | **yes** |
| L — Apex copy verbatim dump | 24 sections captured | — | n/a |

**Jury-visible HIGH/CRITICAL count:** **16** (8 env, 5 README, 3 revenue).
**Estimated cleanup time if all approved:** 2–3 hours of edits + rewrites (before Apex copy rewrite which is on you).

**Headline:** Code is tight. XP→SP migration is clean. No debug artifacts, no dead code, no TODO rot. The jury-visible problems are **docs** (root README is a stub, packages/apps have no READMEs, apex README is boilerplate) and **apex copy** (Premium subscription tier clashes with the 4-layer revenue thesis).

---

## Category A — Nomenclature drift (XP → SP)

**0 findings.** The migration is complete.

- No `\bxp\b`, `total_xp`, `XP_`, `earnXP`, `gainXP`, `addXP` occurrences across either repo.
- No user-facing "experience points", "experience bar", "XP token", "XP System", "XP reward".
- No `skill_points` / `skillPoints` / `SkillPoints` casing drift — code uses `total_sp` / `current_level` canonically.

✅ Clean.

---

## Category B — Stale roadmap / Phase references

**0 jury-visible findings.**

- "Phase 2 / Phase 3" appear only in SQL migration comments (`supabase/migrations/v2_20260422_*.sql`) as deferred housekeeping notes, not in product copy.
- "Phase 1" appears ~25× as a factual cohort label ("all 6 Phase-1 apps") — not drift.
- "Testnet only / mainnet coming" appears once in `contracts/script/DeployTournamentPool.s.sol:35` in a revert message — legitimate forward-looking guardrail, keep.

✅ No "coming soon" copy for features that actually shipped.

---

## Category C — Dead code

**0 findings.** Heuristic pass (top 20 suspect candidates):

- `scripts/backfill-sp.ts` — flagged by isolation, but invoked via `npm run backfill:sp` (active one-shot utility). **KEEP.**
- All other files in `apps/` and `packages/` have active imports.
- Zero unused dependencies across the monorepo.
- Zero misclassified devDependencies.

✅ Clean. (Skipped installing knip/ts-prune per scope; heuristic pass is sufficient given the repo's youth.)

---

## Category D — Commented-out code blocks

**0 findings.** Every multi-line comment scanned was JSDoc or pedagogical example code, not dead code.

Examples of detected patterns (all legitimate):
- `packages/duel-backend/src/api/profile.ts:25-26` — factory-usage example
- `packages/duel-backend/src/handlers.ts:13-14` — export-pattern example

✅ Clean.

---

## Category E — TODO / FIXME / HACK / XXX / WIP

**1 finding — all tracked.**

| Status | file:line | Text |
|---|---|---|
| [backlog] | `packages/duel-backend/src/api/profile.ts:16` | `// TODO(post-submission): profile activity feed includes tournament rank bonuses` |

Context: valid deferred work. Commit `f4d8e2c` (2026-04-24) documents the limitation — tournament rank bonuses increment `tournaments_won` but don't surface as individual activity rows. Requires either `v2_sp_ledger` per-event rows or a denormalized materialized view.

No `HACK`, `XXX`, `WIP`, `FIXME` anywhere. High comment discipline.

---

## Category F — v1 / deprecated references

**1 finding — intentional, rollback-only.**

- **[MED / KEEP]** `packages/contracts/src/addresses.ts:29-34`
  - `TOURNAMENT_POOL_ADDRESS` (v1, duel-gated submit) exported.
  - Explicit file comment: *"F4 TournamentPool v1 (duel-gated submit) — Base Sepolia. Preserved for rollback only; no new code paths should route here. All active flows target TOURNAMENT_POOL_V2_ADDRESS."*
  - Only consumed by a doc comment in `packages/lib-shared/src/attestation.ts:133`.
  - **Recommendation:** Keep through rollback window. Delete post-submission once v2 is proven in production. Not jury-visible.

No `_v1_` / `_old_` / `_legacy_` / `_deprecated_` in file or symbol names.

---

## Category G — Debug / dev artifacts

### G1 — `console.*` calls: **all acceptable**

38 total occurrences across production paths, all intentional:

- **Backend server-logging (KEEP):** `packages/duel-backend/src/sp/award.ts:67,83,114` · `packages/duel-backend/src/api/recap.ts:101,119,136,167` · `packages/duel-backend/src/api/plausibility.ts` · `packages/duel-backend/src/cron/tournaments.ts` · `apps/*/src/app/api/cron/{settle,create}-tournaments/route.ts`. All prefixed with contextual tags (`[sp-award]`, `[recap]`, etc.). These are read by Vercel's logging layer. Upgrading to a shared logger is post-submission work.
- **Dev-guarded (KEEP):** `apps/*/src/app/dev/game-test/page.tsx:54` → guarded by `notFound()` when `NODE_ENV === "production"` (line 29).

### G2 — `debugger;` statements
**0 matches.**

### G3 — Hardcoded test wallets outside test files
**0 matches.** Anvil default accounts (`0xf39F...`, etc.) appear nowhere in production paths. Dev fixture in `apps/2048/.../dev/game-test/page.tsx` is prod-guarded.

### G4 — `// eslint-disable`
**24 occurrences, all legit.** Mostly `react-hooks/exhaustive-deps` on submit-guard polling loops and `@next/next/no-img-element` on tournament prize-token icons.

### G5 — `.env.example` vs code drift — **8 HIGH gaps** (JURY-VISIBLE)

All 6 game apps have identical but **undersized** `.env.local.example` files. A fresh clone cannot run any app without guessing these:

| Missing var | Required by | Impact |
|---|---|---|
| `ANTHROPIC_API_KEY` | `packages/ai-coach/src/client.ts:22` | Coach/Recap fail |
| `CRON_SECRET` | `apps/2048/src/app/api/cron/{create,settle}-tournaments/route.ts:15` | Tournament cron auth |
| `NEXT_PUBLIC_URL` | `apps/*/src/components/AIRecap.tsx:44` | Share-link origin |
| `NEXT_PUBLIC_TOURNAMENT_POOL_V2_ADDRESS` | `packages/contracts/src/addresses.ts:41` | Live tournaments |
| `NEXT_PUBLIC_TOURNAMENT_POOL_ADDRESS` | `packages/contracts/src/addresses.ts:33` | v1 rollback |
| `ADMIN_API_TOKEN` | `packages/duel-backend/src/api/admin/{flags,reconcile}.ts` | Admin endpoints |
| `TESTNET_DEFAULT_PRIZE_POOL` | `packages/duel-backend/src/cron/tournaments.ts:79` | Prize pool cron |
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | `packages/lib-shared/src/rpc.ts:8` | Public RPC override |

Current `.env.local.example` (all 6 apps, identical, 8 vars only):
```
NEXT_PUBLIC_CHAIN_ID
NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS
NEXT_PUBLIC_USDC_ADDRESS
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STUDIO_PRIVATE_KEY
BASE_SEPOLIA_RPC_URL
```

**Recommendation:** Expand each `.env.local.example` to cover all 16 vars. Single shared template + per-app symlink would be cleanest, but duplicate-and-sync is acceptable for submission. **Priority: HIGH, jury-visible.**

---

## Category H — README / docs freshness

### H1 — MAS root `README.md` **[CRITICAL]**
- Last modified: 2026-04-20 (4 days old)
- Size: 21 lines
- **Issues:**
  - Describes "Async matchmaking 2048 duels on Base Sepolia" — i.e. reads as the V2-demo stub, not the current multi-game ecosystem
  - Does **not** list the 6 games
  - Does **not** describe the SP system
  - Does **not** describe the 4 AI pillars
  - Does **not** describe the 4-layer revenue model
  - References `/docs (coming soon)` — stale; `/docs` exists with `audit/` and `superpowers/` subdirs
- **Recommendation:** Full rewrite. This is the first thing jurors will read.

### H2 — MAS `packages/*/README.md` **[HIGH]**
- **0 READMEs across 7 packages** (`ai-coach`, `contracts`, `duel-backend`, `game-types`, `lib-shared`, `sp-engine`, `ui`).
- **Recommendation:** Minimum one-paragraph README per package. `sp-engine`, `contracts`, `duel-backend` are the highest-signal for jurors.

### H3 — MAS `apps/*/README.md` **[HIGH]**
- **0 READMEs across 6 game apps.**
- **Recommendation:** Per-game stub README covering: rules, keybindings, SP award formula, link to game-specific backend routes.

### H4 — MAS `docs/` ✅ clean
- `docs/audit/task-10-v2-cutover/README.md` — 2026-04-23 — detailed v2 cutover reconciliation, **excellent**
- `docs/superpowers/specs/2026-04-21-skillbase-v2-backend-design.md` — 2026-04-21 — V2 backend spec, locked, **excellent** (note: intentionally scoped to 2048-only for V2 demo; this is labeled in the doc)

### H5 — MAS `CLAUDE.md` **[MEDIUM]**
- **Not present.** No agent-guidance file at repo root. Not jury-visible but would help future sessions.

### H6 — skillbase-apex `README.md` **[HIGH]**
- Last modified: 2026-04-23
- Size: 36 lines
- **Content: Next.js boilerplate template.** Not customized to skillbase.games. No description of sections, design tokens, Tally form integration, or relationship to MAS monorepo.
- **Recommendation:** Replace with a site-specific README.

### H7 — skillbase-apex `CLAUDE.md` + `AGENTS.md` ✅ clean
- `CLAUDE.md` (2026-04-23) — comprehensive, current, locked 14-section architecture, tech stack, design tokens, rules
- `AGENTS.md` (2026-04-23) — minimal but appropriate guardrail about Next.js breaking changes

---

## Category I — Copy experiments

**0 findings.**

- No "lorem ipsum", "TBD", "Placeholder", "FIXME copy" anywhere.
- No `@ts-ignore` / `@ts-expect-error` directives in either repo.
- No adjacent commented-out duplicate string literals (A/B copy artifacts).

The only `"tbd"` occurrence is `apps/wordle/src/components/GameWordle.tsx:344` — a legitimate letter-state enum value ("not yet guessed"). Keep.

The `"COMING Q2 2026"` badges in apex `Pricing` are intentional structured data, not draft markers.

✅ Clean.

---

## Category J — Migration hygiene

**0 findings. All 8 migrations follow `v2_YYYYMMDD_feature-name.sql`.**

```
v2_20260421_duels.sql
v2_20260422_coach_cache.sql
v2_20260422_plausibility_check.sql
v2_20260422_recap_cache.sql
v2_20260422_tournaments.sql
v2_20260423_tournament_solo.sql
v2_20260424_solo_ai_cache.sql
v2_20260424_user_stats.sql
```

Sequential, uniform, audit-friendly. No orphans, no stale v1 files. Known v2_* out-of-band issue skipped per scope.

---

## Category K — Revenue model alignment **[CRITICAL]**

Canonical 4-layer model:
1. **In-game purchases** (retry fees, items, SP boosters)
2. **B2B sponsorship** (prize pool funding, cross-brand growth)
3. **Developer SDK** (indie dev onboarding, profit share)
4. **AI data layer** (anti-cheat + difficulty models, vertical integration then licensing)

### K1 — MAS monorepo: ✅ **0 findings**

No `subscription`, `subscribers`, `premium tier`, `monthly plan`, `pro plan`, `Duolingo`, `Strava`, standalone `data marketplace` anywhere in MAS. Code framing (retry fees in `TournamentPool.sol`, sponsorship-funded prize pools, plausibility/anti-cheat in `duel-backend`) is aligned.

### K2 — skillbase-apex: **3 CRITICAL findings** (all jury-visible)

#### K2.1 — Pricing "Premium" subscription tier clashes with in-game-purchases layer
- **File:** `lib/constants.ts:115-131`
- **Verbatim:**
  ```
  tier: "Premium",
  badge: "COMING Q2 2026",
  price: "$5.99",
  period: "per month",
  features: [
    "Everything in Free",
    "Unlimited tournament entries",
    "AI Coach Pro (deep analysis, trends)",
    "Priority matchmaking",
    "Early access to new games",
    "Premium-only tournaments",
  ]
  ```
- **Also rendered in:** `components/sections/Pricing.tsx` (consumes `PRICING_TIERS` from constants)
- **Issue:** A monthly subscription tier is the *legacy* monetization thesis. The new 4-layer model replaces it with in-game purchases (retry fees, items, SP boosters).
- **Recommendation:** Either (a) repositioning this slot as "Retry packs / SP boosters / Cosmetics" under layer 1, or (b) remove the Premium tier entirely and collapse Pricing to Free + Developer. Jury will read "Premium $5.99/mo" and mentally downgrade the moat story from "AI-data platform" to "F2P subscription game".

#### K2.2 — Developer tier framed as SaaS subscription, not SDK / rev-share
- **File:** `lib/constants.ts:133-148`
- **Verbatim:**
  ```
  tier: "Developer",
  badge: "FOR BUILDERS",
  priceLabel: "Starting at",
  price: "$99",
  period: "per month",
  ```
- **Issue:** Layer 3 of the canonical model is *Developer SDK with profit share*. "$99 / per month" frames it as a B2B SaaS subscription, which contradicts the indie-onboarding-plus-rev-share thesis.
- **Recommendation:** Replace with usage-based or rev-share language: *"Free to integrate. X% of tournament fees collected through your game."* Keep an "Enterprise" SLA tier if you want a higher-contact price anchor.

#### K2.3 — "Data marketplace" standalone framing
- **File:** `components/sections/Roadmap.tsx:53` (Phase 4 horizon item)
- **Verbatim:** `"Data marketplace beta"`
- **Issue:** Per the updated thesis, layer 4 is "AI data layer (vertical integration then licensing)" — marketplace is a *subset* of that, not the whole thing.
- **Recommendation:** Replace with `"AI data layer licensing & marketplace beta"` or `"AI data licensing partnerships"`.

### K2.4 — Minor adjacent finding (flagged for context)
- **File:** `app/layout.tsx` meta description still says: *"...Three-sided platform: skill gaming as consumer wedge, AI APIs for developers, decision data marketplace for AI labs."*
- **Issue:** Uses "decision data marketplace" framing. Same fix as K2.3.
- **Verbatim (from L2):** `"Where players earn, AI learns, and developers build. Three-sided platform: skill gaming as consumer wedge, AI APIs for developers, decision data marketplace for AI labs."`
- **Recommendation:** Update description to: *"...AI data layer for labs."* or similar.

---

## Category L — Apex copy verbatim dump

> **Rules:** No recommendations here. Awaiting your rewrite. Template literals preserved with `${...}` placeholders.

### L1 — Hero (`components/sections/Hero.tsx:32-72`)
- EYEBROW_BADGE: `"Live on Base · Testnet"`
- H1_HEADLINE: `"AI-powered infrastructure for skill gaming"`
- SUBHEADING: `"Where players earn, AI learns, and developers build."`
- CTA_PRIMARY: `"Start playing"` (href `#games`)
- CTA_SECONDARY: `"Build on SkillOS"` (href `#developer`)

### L2 — Meta tags (`app/layout.tsx:20-55`)
- TITLE_DEFAULT: `"SkillOS — AI-powered infrastructure for skill gaming"`
- DESCRIPTION: `"Where players earn, AI learns, and developers build. Three-sided platform: skill gaming as consumer wedge, AI APIs for developers, decision data marketplace for AI labs."`
- OG_TITLE: `"SkillOS — AI-powered infrastructure for skill gaming"`
- OG_DESCRIPTION: `"Where players earn, AI learns, and developers build. Live on Base Sepolia."`
- TWITTER_TITLE: `"SkillOS"`
- TWITTER_DESCRIPTION: `"AI-powered infrastructure for skill gaming."`
- KEYWORDS: `["skill gaming", "AI gaming", "Base blockchain", "USDC tournaments", "RLHF data", "human decision data", "sweepstakes", "skillos"]`

### L3 — Opengraph image (`app/opengraph-image.tsx:43-98`)
- PILL_LABEL: `"Live on Base · Testnet"`
- HEADLINE: `"AI-powered infrastructure for skill gaming"`
- SUBHEAD: `"Where players earn · AI learns · Developers build"`
- BOTTOM_STATS: `"6 games"` · `"4 ai pillars"` · `"1.2M+ decisions"`

### L4 — Site constants (`lib/constants.ts:1-7`)
- SITE_NAME: `"SkillOS"`
- SITE_TAGLINE: `"AI-powered infrastructure for skill gaming"`
- SITE_SUBTITLE: `"Where players earn, AI learns, and developers build."`
- SITE_NETWORK: `"Base Sepolia"`

### L5 — Games cards (`lib/constants.ts:18-61`)
- 2048: `"Slide, merge, master the board."`
- Wordle: `"Six guesses. One answer. Daily."`
- Sudoku: `"Logic, discipline, perfect grids."`
- Minesweeper: `"Read the field. Avoid the boom."`
- Clicker: `"Rhythm, precision, compound gains."`
- Match3: `"Pattern recognition, chain combos."`

### L6 — Stats strip (`lib/constants.ts:63-68`)
- STAT_1: value `"6"` | label `"Games live"`
- STAT_2: value `"4"` | label `"AI pillars"`
- STAT_3: value `"${DECISIONS_COUNT}"` (default `"1.2M+"`) | label `"Decisions collected"`
- STAT_4: value `"Base Sepolia"` | label `"Network"`

### L7 — AI Pillars constant (`lib/constants.ts:70-96`)
- PILLAR_1: `"AI Coach"` — `"Post-match tactical feedback. Every loss becomes a lesson."` — status `"LIVE"` — model `"Claude Haiku"`
- PILLAR_2: `"AI Recap"` — `"Shareable match narratives. A viral hook for every game."` — status `"LIVE"` — model `"Claude Haiku"`
- PILLAR_3: `"AI Anti-Cheat"` — `"Every match reviewed for plausibility. Trust layer at scale."` — status `"LIVE"` — model `"Claude Haiku"`
- PILLAR_4: `"On-chain Tournaments"` — `"Sponsored prize pools, transparent settlements, anti-cheat integrated."` — status `"LIVE"` — model `"Base Sepolia"`

### L8 — Pricing tiers (`lib/constants.ts:98-149`)
**Free**
- badge: `"Play forever"`
- price: `"$0"` · period: `"Always free"`
- features: `["All 6 games", "1 free tournament entry per day", "AI Coach (basic feedback)", "USDC rewards (sponsor-funded)", "Community support"]`
- CTA: `"Start playing →"` (`#games`)
- highlighted: false

**Premium**
- badge: `"COMING Q2 2026"`
- price: `"$5.99"` · period: `"per month"`
- features: `["Everything in Free", "Unlimited tournament entries", "AI Coach Pro (deep analysis, trends)", "Priority matchmaking", "Early access to new games", "Premium-only tournaments"]`
- CTA: `"Join waitlist →"` (`#premium-waitlist`)
- highlighted: true

**Developer**
- badge: `"FOR BUILDERS"`
- priceLabel: `"Starting at"` · price: `"$99"` · period: `"per month"`
- features: `["Tournament framework API", "AI Coach, Recap, Anti-Cheat APIs", "USDC payment rails", "Sponsorship marketplace", "White-label support (Growth+)", "SLA guarantees (Enterprise)"]`
- CTA: `"Request early access →"` (`#developer-waitlist`)
- highlighted: false

### L9 — StatsStrip section (`components/sections/StatsStrip.tsx`)
Renders from `STATS` constant — see L6. No additional copy.

### L10 — ValueProp section (`components/sections/ValueProp.tsx:62-72`)
- LABEL: `"§ 03 · Built for"`
- TITLE: `"Three audiences. One platform."`
- SUBTITLE: `"Players earn from skill. AI labs access premium data. Developers build without infrastructure overhead."`

**Audience 1**
- TITLE: `"Compete and earn"`
- TAGLINE: `"Skill-based tournaments with sponsor-funded prize pools. Free entry, unlimited skill."`
- BULLETS: `["6 games, daily tournaments", "AI coach that helps you improve", "USDC rewards, sweepstakes-safe"]`
- CTA: `"Start playing →"` (`#games`)

**Audience 2**
- TITLE: `"Build skill games, skip the infra"`
- TAGLINE: `"Tournament framework, AI APIs, on-chain payments, anti-cheat — delivered as a service."`
- BULLETS: `["Tournament + leaderboard APIs", "AI Coach, Recap, Anti-Cheat endpoints", "USDC payment rails + compliance"]`
- CTA: `"Join early access →"` (`#developer`)

**Audience 3**
- TITLE: `"High-signal human decision data"`
- TAGLINE: `"Every match is timestamped, validated, consented. Premium training signal at scale."`
- BULLETS: `["Anti-cheat verified decisions", "Multi-domain: strategy, language, logic", "Opt-in consent, GDPR-compliant"]`
- CTA: `"Contact for partnership →"` (`#data`)

### L11 — Games section (`components/sections/Games.tsx:7-12`)
- LABEL: `"§ 04 · Games"`
- TITLE: `"6 games. One platform. Growing."`
- SUBTITLE: `"Play instantly. No downloads. Connect a wallet, jump in."`

### L12 — Flywheel section (`components/sections/Flywheel.tsx:8-22`)
- LABEL: `"§ 05 · How it works"`
- TITLE: `"How SkillOS compounds"`
- SUBTITLE: `"Every player strengthens the platform. Every improvement attracts more players."`
- FOOTER_TEXT: `"1.2M+ decisions · 6 games · 4 AI pillars · growing daily"`

### L13 — Flywheel diagram (`components/ui/FlywheelDiagram.tsx:6-11`)
- NODE_1: `"PLAY"`
- NODE_2: `"DATA"`
- NODE_3: `"AI"`
- NODE_4: `"BETTER GAMES"`
- DIAGRAM_TITLE: `"SkillOS flywheel: play generates data, data trains AI, AI powers better games, better games attract more play."`

### L14 — AI Pillars section (`components/sections/AiPillars.tsx:150-158`)
- LABEL: `"§ 06 · AI pillars"`
- TITLE: `"Four AI pillars. All shipped."`
- SUBTITLE: `"Every pillar is live in production, on 6 games, running on Claude Haiku."`

**Pillar 1 — AI Coach**
- TITLE: `"AI Coach"`
- DESCRIPTION: `"Post-match tactical feedback. Every loss becomes a lesson."`
- EXAMPLE_HEADER: `"Coach · 2048"`
- EXAMPLE_TEXT: `"You lost tempo on turn 7 by merging 2→4 when stacking right was cleaner. Next time, prioritize the corner column before top-row merges."`
- STATUS: `"Live"` — POWERED_BY: `"Claude Haiku"`

**Pillar 2 — AI Recap**
- TITLE: `"AI Recap"`
- DESCRIPTION: `"Shareable match narratives. A viral hook for every run."`
- EXAMPLE_HEADER: `"Recap · 2048"`
- EXAMPLE_TITLE: `"1784 in 50 Seconds Flat"`
- EXAMPLE_TEXT: `"A clean run from a rough opening — you turned a double-stacked 2-2 into a cascade that finished inside the 60s buzzer. No hesitation after the 512 breakpoint."`
- STATUS: `"Live"` — POWERED_BY: `"Claude Haiku"`

**Pillar 3 — AI Anti-Cheat**
- TITLE: `"AI Anti-Cheat"`
- DESCRIPTION: `"Every match reviewed for plausibility. Trust layer at scale."`
- EXAMPLE_STATUS: `"AI Reviewed"` · PLAUSIBILITY: `"98.2%"` · FLAGGED_24H: `"0.3%"`
- STATUS: `"Live"` — POWERED_BY: `"Claude Haiku"`

**Pillar 4 — On-chain Tournaments**
- TITLE: `"On-chain Tournaments"`
- DESCRIPTION: `"Sponsored prize pools, transparent settlements, anti-cheat integrated."`
- EXAMPLE_TOURNAMENT: `"Daily · 2048"` · TIME_LEFT: `"2h 29m left"` · PRIZE: `"10 USDC"` · PLAYERS: `"12"` · SPONSOR: `"SkillOS"`
- STATUS: `"Live"` — POWERED_BY: `"Base Sepolia"`

### L15 — Tournaments section (`components/sections/Tournaments.tsx:14-66`)
- LABEL: `"§ 07 · Tournaments"`
- TITLE: `"Free to compete. Sponsored to win."`
- SUBTITLE: `"Daily tournaments across all 6 games. Prize pools funded by sponsors, not players."`
- HEADLINE: `"No entry fee. No consideration."`
- BODY: `"SkillOS tournaments are sweepstakes-safe by design. Sponsors fund prize pools to reach engaged skill-gaming audiences. Players compete freely, improve their skills, and earn USDC based on ranking."`
- BULLETS: `["Free first entry per tournament, always", "Sponsored prize pools — no player deposits to prizes", "Top 50% of players earn rewards", "AI anti-cheat on every submission"]`
- LEGAL_NOTE: `"Mainnet deployment gates on sweepstakes legal review — Q2 2026"`

**Leaderboard mock**
- HEADER: `"Daily · 2048"` · TIME: `"2h 29m left"`
- ENTRIES: `[{rank:1,handle:"@inanc.eth",score:1844}, {rank:2,handle:"0xb4f2…c3a8",score:1712}, {rank:3,handle:"@strike",score:1624}, {rank:4,handle:"0x17ae…9def",score:1512}, {rank:5,handle:"@speedrun",score:1428}]`
- PRIZE: `"10 USDC"` · PLAYERS: `"12 players"`

### L16 — Pricing section (`components/sections/Pricing.tsx:10-27`)
- LABEL: `"§ 08 · Pricing"`
- TITLE: `"Pricing"`
- SUBTITLE: `"Start free. Upgrade when you need more."`
- FOOTER_NOTE: `"All prices in USD · Premium + Developer open Q2 2026 · Free stays free forever"`
- MOST_POPULAR_BADGE: `"Most popular"`

### L17 — Developer section (`components/sections/Developer.tsx:44-71`)
- LABEL: `"§ 09 · Developers"`
- TITLE: `"Build on SkillOS"`
- SUBTITLE: `"Turn any skill game into a tournament-ready, AI-enhanced, USDC-earning product."`

**Feature 1 — Tournament API**
- DESCRIPTION: `"Create daily or weekly tournaments. Manage entries, distribute prizes, handle settlements — all on-chain."`

**Feature 2 — AI APIs**
- DESCRIPTION: `"Plug into Coach, Recap, and Anti-Cheat endpoints. Your game becomes AI-native in hours, not months."`

**Feature 3 — Payment rails**
- DESCRIPTION: `"USDC tournament pools, auto-settlement, sponsor integration. We handle KYC, compliance, chain ops."`

**Feature 4 — Anti-Cheat**
- DESCRIPTION: `"Every score reviewed by Claude Haiku. Flagged matches enter admin review. Trust layer included."`

**Waitlist**
- TITLE: `"Join the developer early access"`
- DESCRIPTION: `"First drop is a private alpha of the Tournament + AI APIs on Base Sepolia. SLA-backed tiers follow at launch."`
- EMAIL_LABEL: `"work@company.com"`
- CTA: `"Request access →"`

### L18 — SDK Code Block (`components/ui/SdkCodeBlock.tsx:14-41`)
- FILENAME: `"quickstart.ts"`
- Step 1 comment: `"Create a daily tournament, funded by a sponsor"`
- Step 2 comment: `"Submit a score — AI-reviewed before it hits the board"`
- Step 3 comment: `"Inspect the anti-cheat verdict inline"`
- Example tokens: `import { SkillOS } from '@skillos/sdk'` · game `'reaction-time-2048'` · currency `'USDC'` · antiCheat `'strict'` · status `'flagged'`

### L19 — DataLab section (`components/sections/DataLab.tsx:74-122`)
- LABEL: `"§ 10 · AI labs"`
- TITLE: `"High-signal decision data"`
- SUBTITLE: `"The scarcest resource in AI training, collected at scale through skill competition."`
- STAT_DISPLAY: `"${DECISIONS_COUNT}"` (default `"1.2M+"`)
- STAT_LABEL: `"verified decisions collected · updated daily"`

**Value prop 1**
- HEADLINE: `"Scale matters"`
- BODY: `"Every tournament submission produces structured, validated decision data. Six games × thousands of daily matches × multiple decisions per game compounds into millions of data points."`

**Value prop 2**
- HEADLINE: `"Anti-cheat verified"`
- BODY: `"Every submission reviewed by AI for plausibility. Bot-generated noise filtered out. What remains is pure human skill expression under real stakes."`

**Value prop 3**
- HEADLINE: `"Opt-in, transparent"`
- BODY: `"Players opt in explicitly and earn a 10% bonus for consent participation. GDPR and CCPA compliant, anonymized with differential privacy."`

**Use case 1 — RLHF training data**
- BLURB: `"Scored human decisions across six reasoning domains — ready for preference-model fine-tuning."`

**Use case 2 — Cognitive science research**
- BLURB: `"Time-stamped, session-grained sequences for studying pattern recognition, memory, and strategy formation."`

**Use case 3 — Game design empiricism**
- BLURB: `"Per-level engagement signals, difficulty curves, and skill-ceiling measurement for production tuning."`

**Form**
- TITLE: `"Interested in data partnerships?"`
- DESCRIPTION: `"We work with a short list of AI labs and research groups under structured data-sharing agreements."`
- EMAIL_LABEL: `"you@lab.org"`
- CTA: `"Get in touch →"`

### L20 — WhyNow section (`components/sections/WhyNow.tsx:34-72`)
- LABEL: `"§ 11 · Why now"`
- TITLE: `"Why SkillOS, why now"`
- SUBTITLE: `"Three tectonic shifts converging at once — and the first team at the intersection takes the market."`

**Pillar 1**
- THEME: `"AI training data scarcity"`
- STAT: `"$14B"` · LABEL: `"Scale AI valuation"`
- BODY: `"RLHF is saturated. Synthetic data plateaued. The next moat in AI is real-time human decision data under real stakes — and no one is collecting it systematically at consumer scale."`

**Pillar 2**
- THEME: `"Skill-gaming regulation clarity"`
- STAT: `"30+"` · LABEL: `"US states where skill gaming is explicitly legal"`
- BODY: `"DFS (DraftKings, FanDuel) cleared the regulatory path for skill-based real-money gaming. SkillOS operates within the established framework — sweepstakes-safe architecture is the first-line defense."`

**Pillar 3**
- THEME: `"Crypto payment rails mature"`
- STAT: `"$108B"` · LABEL: `"Web3 gaming market by 2030"`
- BODY: `"USDC on Base makes microtransactions economically viable. What required credit card rails and 3% fees now runs on sub-cent transactions. The infrastructure is ready."`

### L21 — Roadmap section (`components/sections/Roadmap.tsx:105-110`)
- LABEL: `"§ 12 · Roadmap"`
- TITLE: `"Roadmap"`
- SUBTITLE: `"What we've built, what we're building, what comes next."`

**Phase 1 — Shipped**
- TITLE: `"What's live"`
- ITEMS: `["6 games launched", "4 AI pillars (Coach · Recap · Anti-Cheat · Tournaments)", "On-chain settlement on Base Sepolia", "Sweepstakes-safe architecture"]`

**Phase 2 — In progress**
- TITLE: `"What we're building"`
- ITEMS: `["Solo tournament submission", "Premium subscription tier", "Developer SDK (alpha)", "Sponsor onboarding pipeline"]`

**Phase 3 — Q2 2026**
- TITLE: `"Mainnet + public launch"`
- ITEMS: `["Mainnet deployment (pending legal review)", "Public SDK launch", "Premium tier opens", "First external sponsor"]`

**Phase 4 — Q3–Q4 2026**
- TITLE: `"Scale surface"`
- STATUS: `"Horizon"`
- ITEMS: `["Data marketplace beta", "Cross-game leaderboards", "Mobile apps (PWA → native)", "Team expansion"]`

### L22 — About section (`components/sections/About.tsx:9-48`)
- LABEL: `"§ 13 · Mission"`
- TITLE: `"Why SkillOS exists"`
- BODY_1: `"Skill gaming generates billions of decisions per day — valuable training signal for AI, engagement surface for players, distribution channel for developers. But the economy is broken: players generate value, companies capture it, platforms mediate. We're fixing the flow with three-sided infrastructure."`
- BODY_2: `"SkillOS is where skill gets rewarded three ways: players earn USDC for performance, developers build without infra overhead, AI labs access training data at unprecedented quality. Every part reinforces the others."`
- BODY_3: `"We believe the best AI of 2030 will be trained not on scraped text, but on real human decisions collected in real competitive contexts. That's what we're building — starting with six games, one platform, and an architecture designed to scale."`
- FOUNDER_ATTRIBUTION: `"— İnanç Ayvaz, Founder · @youngstar-eth on Farcaster →"`
- FOUNDER_FARCASTER_LINK: `"https://warpcast.com/youngstar-eth"`

### L23 — Footer (`components/sections/Footer.tsx:33-87`)
- FOOTER_BRAND_TAGLINE: `"AI-powered infrastructure for skill gaming."`
- SOCIAL_LABELS: `["Twitter", "Farcaster", "Discord"]`
- BUILD_BADGE: `"Built on Base"`
- COPYRIGHT: `"© 2026 SkillOS. All rights reserved."`
- NETWORK_STATUS: `"Live on Base Sepolia"`
- MAINNET_TIMELINE: `"Mainnet Q2 2026"`
- PRODUCT_LINKS: `["Games", "Pricing", "Developers", "AI Labs", "Tournaments"]`
- COMPANY_LINKS: `["Mission", "Blog (soon)", "Careers (hiring soon)", "Press"]`
- LEGAL_LINKS: `["Terms of Service", "Privacy Policy", "Sweepstakes Rules", "Contact"]`

### L24 — WaitlistForm (`components/ui/WaitlistForm.tsx`)
- INPUT_PLACEHOLDER: `emailLabel` prop (e.g. `"you@company.com"`, `"work@company.com"`, `"you@lab.org"`)
- FALLBACK_NOTE: `"Tally embed swaps in once form ID is wired"`

---

## Aggregated cleanup plan

If you approve all CRITICAL + HIGH items below, here's the ordered diff-preview:

### Tier 1 — CRITICAL (copy + docs, jury-visible)

1. **Apex Pricing tier rewrite** — `skillbase-apex/lib/constants.ts:98-149` + `components/sections/Pricing.tsx`
   *Awaiting new copy from user.* (K2.1 + K2.2)

2. **Apex Roadmap "Data marketplace beta" → AI data layer phrasing** — `skillbase-apex/components/sections/Roadmap.tsx:53`
   *Awaiting new copy from user.* (K2.3)

3. **Apex meta description — replace "decision data marketplace"** — `skillbase-apex/app/layout.tsx:20-55`
   *Awaiting new copy from user.* (K2.4)

4. **MAS root README rewrite** — `/Users/inancayvaz/MAS/README.md`
   Add: 6-game overview, SP system + levels, tournament architecture (v2), 4 AI pillars, 4-layer revenue model, dev/build commands, link to `docs/audit/` and `docs/superpowers/specs/`. Approximately 120–180 lines. (H1)

5. **Apex README rewrite** — `/Users/inancayvaz/skillbase-apex/README.md`
   Replace Next.js boilerplate with site-specific content: purpose, 14-section architecture, design tokens, Tally integration, relationship to MAS monorepo, deploy flow. (H6)

### Tier 2 — HIGH (docs + env, jury-visible)

6. **Expand `.env.local.example` in all 6 apps** — `apps/{2048,clicker,match3,minesweeper,sudoku,wordle}/.env.local.example`
   Add 8 missing vars (see G5). Consider consolidating to a single template at repo root with per-app symlink. (G5)

7. **Write `packages/*/README.md`** — 7 files, 1–2 paragraphs each
   Priority order: `sp-engine`, `contracts`, `duel-backend`, `ai-coach`, `lib-shared`, `game-types`, `ui`. (H2)

8. **Write `apps/*/README.md`** — 6 files, 1 paragraph each
   Per-game rules, keybindings, SP formula, backend links. (H3)

### Tier 3 — MEDIUM (non-jury, nice-to-have)

9. **MAS `CLAUDE.md` at root** — agent guidance for future sessions. (H5)

10. **Delete v1 `TOURNAMENT_POOL_ADDRESS`** — `packages/contracts/src/addresses.ts:29-34` + the doc reference in `packages/lib-shared/src/attestation.ts:133`. *After rollback window closes — not pre-submission.* (F)

### Tier 4 — LOW (backlog, not submission-blocking)

11. Nothing. The single outstanding TODO (E) is appropriately tracked in a commit.

---

## Next actions (awaiting your call)

- **Apex copy rewrite:** you mentioned you'd supply revised hero + subheadline + sections after reading L. I'll wait on that before touching any `components/sections/*` or `lib/constants.ts`.
- **Root README rewrites (MAS + apex):** approve structure/tone and I'll draft.
- **`.env.local.example` fixes:** quick + safe; approve to proceed.
- **Per-package / per-app READMEs:** batch of 13 small files; approve and I'll write them in one pass.

No files were modified by this scan. Working tree remains clean (other than the new report under `reports/`).
