# Ultrareview — YC S26 Submission Readiness

**Date:** 2026-05-01 (T-3 days to YC deadline 2026-05-04 8pm PT)
**Scope:** MAS monorepo (`/Users/inancayvaz/MAS`) + skillbase-apex (`/Users/inancayvaz/skillbase-apex`) + skillbase-demo-video.
**Mode:** Read-only. No fixes applied. Findings + severity + recommendations only.
**Method:** 5 parallel domain-isolated agents covered Layers 1–6; Layer 7 (risk inventory) synthesized in main session.
**Pre-condition:** v2.1 stack migration scheduled for Saturday 2026-05-02. Submission window opens immediately after.

---

## Executive Summary

### Severity distribution (48 distinct findings)

| Severity | Count | Definition |
|---|---|---|
| **CRITICAL** | **2** | Blocks submission OR breaks production |
| **HIGH** | **9** | Jury-visible degradation |
| **MED** | **18** | Post-YC fix; quick wins clustered |
| **LOW / INFO** | **19** | Backlog, positive notes, deferred |

### Top 5 action items requiring action before 2026-05-04

| # | Finding | Layer | Severity | Effort | Required by |
|---|---|---|---|---|---|
| 1 | **v2.1 pool trustedSigner = `0xf35c284D…` is orphaned** (no private key in any env). Saturday's migration would silently brick all v2.1 solo submissions with `BadSignature`. | L2.1 | **CRITICAL** | 1 owner tx (~2 min) | **Before Sat 2026-05-02 cutover** |
| 2 | **`sponsor.skillbase.games` returns 404 DEPLOYMENT_NOT_FOUND**. Source exists at `apps/sponsor/` but no Vercel project linked. Apex copy + README + demo video reference this URL. | L1.1, L4.1 | **CRITICAL** | Deploy: ~30 min · OR scrub references: ~1 hr | **Before submit** |
| 3 | **All 4 production contracts unverified on Blockscout** (v2.0 pool, v2.1 pool, SponsorshipModule, SBT). Jury inspects Basescan; unverified bytecode = credibility hit on the on-chain pitch. | L2.2 | **HIGH** | `forge verify-contract` × 4 (~5 min) | **Before submit** |
| 4 | **Demo video VO Scene 3 says "all powered by Claude Haiku"** — code uses Sonnet 4.6 for Coach. Plus Scene 5 hardcodes `TARGET = 1_200_000` while live x402 returns `total_decisions_recorded: 0`. Two factual errors in the headline jury asset. | L5.3, L5.2 | **HIGH** | Re-record VO + re-render: ~30 min | **Before submit** |
| 5 | **Pitch claim "70% to dev direct on-chain" has no contract enforcement.** `withdrawFees(id, to)` pays the entire `feeCollected[id]` to one owner-supplied address. Off-chain split is fine; "direct on-chain" is false. | L5.1 | **HIGH** | Reword apex.ts:58,64,134 (~5 min) | **Before submit** |

### Submission readiness score

**Conditional: 8/10 if all 5 P0 items closed pre-submit; 5/10 as-is.**

Rationale:
- **Strengths (push score up):** sweepstakes invariant is provable on-chain with 3 named Foundry tests; forge tests 156/156 pass; 6 game subdomains all serve sub-second with unique 1200×630 OG cards + Farcaster manifests; wallet UX (parseWalletError + SSR-mount + embed fallback) is solid; 8 of 9 jury-visible findings from the 2026-04-24 audit are resolved (apex marketing fully rewritten, all 13+ READMEs written, env vars expanded).
- **Drag (push score down):** the two CRITICAL items are immediate, not theoretical — one would brick Saturday's migration, the other 404s a URL the pitch references. The HIGH items concentrate around claim-vs-implementation drift (70/30 split, 1.2M+ fiction, Coach model attribution), which a juror who actually inspects can catch.

---

## Layer 1 — Production Health

| # | Finding | Severity | Evidence | Recommendation |
|---|---|---|---|---|
| 1.1 | `sponsor.skillbase.games` → HTTP 404 `DEPLOYMENT_NOT_FOUND` | **CRITICAL** | `curl -I` returns `x-vercel-error: DEPLOYMENT_NOT_FOUND`; `apps/sponsor/.vercel/project.json` missing while other 6 apps have it | Deploy + link sponsor project (`cd apps/sponsor && vercel link && vercel deploy --prod`) OR remove all references to sponsor.skillbase.games from pitch + apex copy + demo video. |
| 1.2 | Next.js 14.2.35 has 2 unpatched HIGH-CVSS DoS CVEs across all 7 apps | **HIGH** | `npm audit`: GHSA-q4gf-8mx6-v5v3 (CVSS 7.5, RSC DoS), GHSA-h25m-26qc-wcjf (CVSS 7.5, RSC deserialization) | Bump to next 15.5+ or 16.x in Saturday's v2.1 migration. If migration slips, document as known-pinned in security log. |
| 1.3 | `/api/tournaments/active` returns 400 expecting UUID + 1.4-2.2s slow | MED | All 6 games: `{"error":"invalid_tournament_id"}`; naming mismatch with "list active" semantics | Rename or add a true list endpoint. Investigate cold-start vs query plan for the 1.4-2.2s response. Post-YC. |
| 1.4 | React 18 (MAS) vs React 19 (apex) skew + Tailwind 3 (MAS) vs 4 (sponsor) skew via shared `@skillbase/ui` | MED | `npm outdated` apex: react 19.2.4; MAS: 18.3.1. `apps/sponsor/node_modules/tailwindcss` 4.2.4; rest 3.4.19 | Reconcile during v2.1 migration to prevent hydration mismatches. |
| 1.5 | axios SSRF chain via `@coinbase/cdp-sdk` | MED | `npm audit`: GHSA-3p68-rc4w-qgx5, GHSA-fvcv-3m26-pcqx; `fixAvailable: true` | `npm audit fix` (non-major). Bounded to route handlers per `next14_middleware_runtime` memo. |
| 1.6 | postcss <8.5.10 XSS via unescaped `</style>` | MED | GHSA-qx2v-qp2m-jg93 (CVSS 6.1, requires user interaction) | Resolves with next bump. Low real-world risk; SkillOS doesn't accept user-controlled CSS. |
| 1.7 | 2048 mobile fails Lighthouse `color-contrast` audit (a11y 0.96 vs apex 1.00) | MED | `lh-2048.json`: `color-contrast` 0 | Identify offending text/background pair; invoke `2048-design` skill for token review. Apex passes. |
| 1.8 | @anthropic-ai/sdk 0.40.1 in `packages/ai-coach` (50+ versions behind 0.92.0) | LOW | `npm outdated` MAS | Bump post-YC; preserve prompt caching per `claude-api` skill. |
| 1.9 | Vercel error logs (7 days) UNVERIFIED | LOW | `vercel logs --no-follow` hangs in CLI v52; `--output raw` flag removed | Manual review in Vercel dashboard pre-submit. Filter Status=5xx, last 7 days, on `/api/duel/`, `/api/tournaments/`, `/api/cron/`, paymaster routes. |
| 1.10 | 2048 production source maps not uploaded | LOW | `lh-2048.json`: `valid-source-maps` 0 | Enable `productionBrowserSourceMaps: true` + Sentry uploads when Sentry is wired. Not blocking. |
| 1.11 | `apps/sponsor/vercel.json` declares `index-sponsor-events` cron but project undeployed → cron never fires | MED | Compounds 1.1 | Either deploy sponsor or move cron to a deployed project. Extend pre-deploy checklist (per `tournaments_sprint_pre_task9` memo) to verify all `vercel.json` crons resolve to live projects. |

**Lighthouse:** apex desktop 96/100/100/100, mobile 95/100/100/100. 2048 mobile 100/96/100/100, desktop 99/96/100/100. **Strong.**

---

## Layer 2 — On-Chain State

| # | Finding | Severity | Evidence | Recommendation |
|---|---|---|---|---|
| 2.1 | **v2.1 pool `trustedSigner = 0xf35c284D9aB07Abb4fc297C2af89B467E30f2273` is orphaned**: zero on-chain history; no `SCORE_SIGNER_PRIVATE_KEY` exists in any env file. `STUDIO_PRIVATE_KEY` derives to canonical `0xA24f9122…`. Solo submissions on v2.1 will revert with `BadSignature` (TournamentPool.sol L614/634). | **CRITICAL — MIGRATION SHOWSTOPPER** | `read_contract(v2.1, trustedSigner)` returned `0xf35c284D…`; `get_address_info` shows no first_transaction; grep of MAS/.env.local + contracts/.env shows no `SCORE_SIGNER_PRIVATE_KEY`; `contracts/.env` only has `SCORE_SIGNER_ADDRESS=0xf35c284D…` with comment claiming it derives from a key in `apps/2048/.env.local` (which only has `STUDIO_PRIVATE_KEY`) | **Owner `0x3a4F9eB7…` MUST call `setTrustedSigner(0xA24f9122568e98b72f4dDD61119C7D92D0975692)` on v2.1 pool BEFORE Saturday's cutover.** Single owner tx. Without this, the migration silently brakes production. |
| 2.2 | All 4 production contracts NOT verified on Blockscout (v2.0 pool, v2.1 pool, SponsorshipModule, SBT) | **HIGH** | `is_verified: false` on each | `forge verify-contract` × 4. ~5 min total. Jury inspects Basescan. |
| 2.3 | v2.1 mirror tournaments span 25.4-day windows despite `cycleType=Weekly` | MED | startsAt 0x69f45ca0 → endsAt 0x6a16d67a (2026-04-28 → 2026-05-24) | Either accept (single jury-window) and update apex/pitch "weekly" copy, OR fix the seed script. Post-YC. |
| 2.4 | `emergencyWithdraw(to)` (TournamentPool.sol L515) drains entire contract USDC, crossing prizePool + feeCollected segregation if owner is compromised | MED | `USDC.balanceOf(this)` → `safeTransfer(to, balance)` | Document in YC submission as "owner safety valve, no auto path crosses pools". For mainnet: split into `emergencyWithdrawFees(id)` + `emergencyWithdrawPrize(id)` and/or timelock+multisig. |
| 2.5 | Sponsor wallet `0xc784e5D5…` ETH = 0.00999 ETH (~5 tx headroom) | MED | `get_address_info` coin_balance 9,993,437,946,409,684 wei | Top up 0.02 ETH from signer (which has 0.0496 ETH). Memory `tournaments_sprint_pre_task9` already flagged this. |
| 2.6 | `SKILLBASE_ANCHOR_ADDRESS` env empty default; signer interacted with `0x9d033b3A…` 2026-05-01 02:48 (likely deployed anchor) | LOW | `addresses.ts:106` defaults to `""`; cron route correctly fail-loud if missing | Populate env if anchor is part of YC story; otherwise leave fail-loud. |
| 2.7 | Memory's "11 USDC orphan residual on v2.1" is INCORRECT | INFO | All 29 USDC accounted for: 6 mirror × 3 + earlier `0x8199…` tournament 11 USDC | Update memory: no actual orphan. |
| 2.8 | **Sweepstakes invariant: PASS** | INFO/POSITIVE | TournamentPool.sol L92 (`prizePool` in struct) vs L181 (`feeCollected` top-level mapping) — physically distinct slots. `chargeRetryFee` writes only feeCollected (L440). `fundPrizePool` writes only prizePool (L301). `settle`/`_distributePrizes` reads only prizePool (L484). `withdrawFees` reads/zeroes only feeCollected (L505). Sample mirror tournament `feeCollected[id]=0` confirms visually. 3 named invariant tests in `contracts/test/TournamentPool.t.sol` (L982, L1038, L1267). | **Keep this proof prominent in pitch.** |

**Trusted signer (canonical, v2.0):** `0xA24f9122568e98b72f4dDD61119C7D92D0975692` — three D's verified, 42 chars, 0.0496 ETH + 145.5 USDC. **Healthy for submission window.**

**v2.0 pool (`0x5CadD…`):** active, 68 USDC balance, settle/createTournament/withdrawFees activity ongoing. Primary live infrastructure.

**v2.1 pool (`0x52049b…`):** newly deployed 2026-04-29, 29 USDC primed in 7 prizePools. Zero submission traffic yet — broken trustedSigner not yet on hot path. Migration on Saturday would put it there.

---

## Layer 3 — Codebase Hygiene

| # | Finding | Severity | Evidence | Recommendation |
|---|---|---|---|---|
| 3.1 | Stale `apps/sponsor/.next/types/app/icon/route.ts` causes monorepo `npm run typecheck` to fail | **HIGH** | `error TS2307: Cannot find module '../../../../src/app/icon/route.js'`; route was deleted but generated stub remains in cache | `rm -rf apps/sponsor/.next/`; add `**/.next/types/**` to `apps/sponsor/tsconfig.json` exclude. ~2 min. |
| 3.2 | `npm run lint` blocked across all 7 Next apps — no ESLint config; `next lint` waits for interactive prompt | **HIGH** | `npx next lint` in any game app: "How would you like to configure ESLint?" exits 1 under turbo non-TTY | Add minimal `.eslintrc.json` per app (`{ "extends": "next/core-web-vitals" }`) OR remove `lint` script from each `package.json`. ~5 min. |
| 3.3 | Apex README still Next.js boilerplate (unchanged from 2026-04-24) | **HIGH (jury-visible)** | `/Users/inancayvaz/skillbase-apex/README.md` 36 lines, default create-next-app content | Replace with site-specific README. Apex `CLAUDE.md` already has strong content to mine. |
| 3.4 | Apex eslint: 2 `react-hooks/set-state-in-effect` errors | MED | `lib/useTheme.ts:34`, `components/ui/Reveal.tsx:38` | Wrap in `useLayoutEffect` or move to render path. ~5 min. |
| 3.5 | `apps/sponsor/.env.local.example` missing | MED (jury-visible) | Sponsor app added post-prior-audit; only workspace without env example | Copy from `apps/2048/.env.local.example`; trim. ~5 min. |
| 3.6 | 5 secondary env vars still missing (`NEXT_PUBLIC_URL`, `NEXT_PUBLIC_TOURNAMENT_POOL_*_ADDRESS`, `ADMIN_API_TOKEN`, `TESTNET_DEFAULT_PRIZE_POOL`) | LOW | All have sensible defaults; not runtime-blocking | Document with inline comments next pass. |
| 3.7 | Branch coverage: `ChallengeEscrow` 61.54%, `SponsorshipModule` 50% | LOW | `forge coverage --report summary` | Add revert-path tests post-submission. |
| 3.8 | No TS-level test runner (no vitest/jest); cron + x402 endpoints have only smoke-script coverage | LOW | `tsx --test` for sp-engine + duel-backend; nothing else | Acceptable for submission. Consider vitest setup post-YC. |
| 3.9 | New TODO in `packages/ui/src/og/game-card.tsx:25` | LOW | Inline TODO for OG-card refinement | Not blocking. |
| 3.10 | MAS root `CLAUDE.md` still missing | LOW | Prior H5 unchanged | Not jury-visible. |

### Delta from 2026-04-24 audit (8 of 9 jury-visible items RESOLVED)

| Prior finding | Status |
|---|---|
| G5 — 8 missing env vars across 6 apps | **RESOLVED** (4 critical added; 4 secondary remain LOW) |
| H1 — MAS root README stub | **RESOLVED** (118 lines, dated 2026-05-01) |
| H2 — 7 packages without README | **RESOLVED** (all 7 written) |
| H3 — 6 apps without README | **RESOLVED** (all 6 + sponsor written) |
| K2.1-K2.4 — apex revenue-model copy mismatches | **RESOLVED** (entire apex marketing rewrite to "Field Notes layout" in commit 121ced6) |
| H6 — apex README boilerplate | **NOT RESOLVED** — see 3.3 |

### Tests + secrets

- **Forge tests:** 156/156 pass. TournamentPool 97.63% line coverage; ChallengeEscrow / SkillbaseAnchor / SponsorReceiptSBT / SponsorshipModule / ArcadePool all 100% lines. **Strong.**
- **Secrets scan:** clean. No hardcoded API keys or private keys in any production path. No `.env`/`.env.local` ever committed (verified via `git log --all --diff-filter=A`).
- **TS package tests:** sp-engine 37/37, duel-backend 29 pass + 4 intentionally skipped (Phase 2 deferred per `phase2_duel_reactivation` memo).

---

## Layer 4 — Submission Artifact Review

| # | Finding | Severity | Evidence | Recommendation |
|---|---|---|---|---|
| 4.1 | `sponsor.skillbase.games` 404 (duplicates 1.1) | **CRITICAL** | curl HEAD: `x-vercel-error: DEPLOYMENT_NOT_FOUND` | See 1.1 |
| 4.2 | Apex `www.skillbase.games/.well-known/farcaster.json` missing `accountAssociation` | **HIGH** | `curl https://www.skillbase.games/.well-known/farcaster.json` returns only `{frame, miniapp}` — no signed binding | Sign + deploy accountAssociation, OR remove the manifest entirely (half-state worse than absent). |
| 4.3 | No `useSwitchChain` UI anywhere — wrong-network is a UX dead end | MED | `grep -rn "useSwitchChain"` returns 0 matches; sponsor app shows static error string only | Add 2-line wagmi pattern to WalletButton. Coinbase Smart Wallet defaults to Base mainnet for many users. |
| 4.4 | No `apple-touch-icon` on any subdomain | MED | `/apple-icon.png` 404 on every subdomain | Drop one `apple-icon.png` (180×180) per `app/` folder. |
| 4.5 | Apex marketing has no wallet integration | LOW | `grep -rn "wagmi\|ConnectButton" /Users/inancayvaz/skillbase-apex` returns no real wallet code | Intentional design; confirm jury will not expect a "Connect Wallet" CTA on the homepage. |
| 4.6 | `/opengraph-image.png` 404 (canonical is `/opengraph-image`) | LOW | All 7 subdomains | Next.js convention; not a real bug. Optionally redirect for ad-hoc URL probes. |
| 4.7 | `/tournaments`, `/play`, `/games`, `/dashboard` 404 — actual route is `/tournament/solo` (singular) | LOW | curl HEAD | Update any pitch/marketing/README that links to plural `/tournaments`.<br><br>**Status (2026-05-02): N/A.** Copy hunt across apex repo, MAS READMEs, demo-video script, and CLAUDE/AGENTS docs returned 0 broken-link matches. False positives all confirmed valid (API namespaces, feature-name copy, sponsor /dashboard which exists). No surface exposes the 404 URLs to jury click-through. No fix shipped. |
| 4.8 | OG cards: 7/7 subdomains serve exact 1200×630 PNG, 27-36 KB, with full og:* + twitter:card + fc:frame + fc:miniapp meta | INFO/POSITIVE | All present, unique per game | **Keep as-is. Strong.** |
| 4.9 | Favicon: 7/7 serve `/icon` 200 PNG 512×512 via Next.js metadata route; `/favicon.ico` 307→/icon | INFO/POSITIVE | All present, unique etag/size per game | **Keep as-is.** |
| 4.10 | Wallet UX: `parseWalletError` covers UserRejectedRequestError + code 4001 + regex; `try/catch` wraps `connect()`; SSR-safe `mounted` gate; `EmbedWalletFallback` for Mini App auto-claim | INFO/POSITIVE | Code at `packages/ui/src/{utils,WalletButton,EmbedWalletFallback}.tsx` | **No action. Strongest layer of the stack.** |
| 4.11 | Farcaster Mini App: 6/6 game subdomains have signed `accountAssociation` (FID 3321662) | INFO/POSITIVE | curl `/.well-known/farcaster.json` per game | **Keep as-is.** |

---

## Layer 5 — Pitch Coherence

| # | Finding | Severity | Evidence | Recommendation |
|---|---|---|---|---|
| 5.1 | "70% to dev direct on-chain" claim has NO on-chain enforcement | **HIGH** | `apex.ts:58,64`; `TournamentPool.sol:505 withdrawFees(id, to)` pays whole `feeCollected` to one owner-supplied address. No split logic in `contracts/src/`. | Reword to "70% paid to developer (off-chain settlement)" OR add `withdrawFeesSplit(id, devAddr, opsAddr, devBps)`. **Reword is the 5-min fix.** |
| 5.2 | "1.2M+ decisions collected" is hardcoded fiction | **HIGH** | `Scene5Data.tsx:15` `TARGET = 1_200_000`; live x402 returns `total_decisions_recorded: 0` (`reports/x402-live-proof.md:67`); route handler `apps/2048/src/app/api/public/data/sp-tier-distribution/route.ts:102` | Cut from demo video Scene 5; replace with verifiable number ("8 production x402 routes live"). Re-render. |
| 5.3 | Demo video VO Scene 3 misattributes Coach model | **HIGH** | `skillbase-demo-video/src/lib/script.ts:25` says "all powered by Claude Haiku"; `packages/ai-coach/src/models.ts:26` says `claude-sonnet-4-6`; README.md:27 says Sonnet 4.6 | Edit line 25 of `script.ts`, regen `scene-aiPillars.mp3` via `npm run voiceover`, re-render. ~10 min if ElevenLabs key still works. |
| 5.4 | "30% platform fee auto-collected on-chain" misleading | MED | `apex.ts:73`; `withdrawFees` is owner-pull, not auto-split | Reword to "30% platform fee accumulated on-chain, withdrawn periodically by ops". |
| 5.5 | Thesis statement varies across 5 surfaces | MED | README "AI-powered infrastructure for skill gaming"; apex.ts "The data layer for gaming AI"; constants.ts (legacy) same; demo script.ts:9 "AI-powered infrastructure"; demo script.ts:14 "Infrastructure first. Games as the wedge. Data as the moat." | Pick one canonical line for YC. Recommended: "The data layer for gaming AI" — distinctive, aligns with Software-for-Agents RFS hook. |
| 5.6 | Adjacent file contradiction: legacy `constants.ts:179` says **80/20 dev-favorable**, live `apex.ts:64,134-135` says **70/30** | MED | Two files in same dir contradict | Delete `lib/constants.ts` (per CLAUDE.md "Legacy aliases deleted with components/sections/* at Gate 5") OR sync the numbers. |
| 5.7 | No `@skillos/sdk` package; SDK is aspirational; apex doesn't hedge | MED | `packages/` listing has no `sdk` subdir; `apex.ts:57` "Deploy any skill game via SDK"; legacy `constants.ts:201` correctly hedges "Public SDK ships in Phase 2" | Add Phase 2 hedge to apex actor card OR cut "Deploy via SDK" bullet. Mention existing internal packages as proto-SDK. |
| 5.8 | Live testnet uses `MockSanctionsOracle` | LOW | `contracts/src/MockSanctionsOracle.sol`; `ISanctionsOracle.sol:7-8` documents mainnet Chainalysis address | Disclose: "testnet mock; mainnet swap is one address change to Chainalysis". Don't claim Chainalysis is wired today. |
| 5.9 | "AI Reviewed Badge" framed as 4th AI pillar — actually a UX surface, not separate model | LOW | `lib/constants.ts:113-118` | Reframe as "transparency layer" if asked at interview, or accept as fair UX-side branding. |
| 5.10 | x402 has 0 lifetime calls on data endpoints | MED | `total_decisions_recorded: 0` | Either drive a few real calls via smoke script and report honestly, or frame as "infrastructure ready, traction Phase 2". Honesty > fiction. |
| 5.11 | Apex 5-actor cards lack Phase 2 hedges | MED | `apex.ts` removed legacy "Public SDK ships in Phase 2" hedge | Add a single "Phase 1 testnet" / "Phase 2" pill to each actor card, OR position Phases section above FiveActors. |
| 5.12 | No `DESIGN.md` in either repo | LOW | apex + MAS both lack docs/DESIGN.md | Optional: write 1-page DESIGN.md referencing `globals.css:21-84`. Not blocking. |
| 5.13 | Sweepstakes safety: PROVABLE on-chain | INFO/POSITIVE | TournamentPool.sol storage segregation + 3 named invariant tests + 2-min BaseScan walkthrough script (see Sweepstakes Verification appendix) | **Keep this prominent. The strongest part of the pitch.** |

### 5-actor architecture vs reality

| Actor | Pitch | Status |
|---|---|---|
| Players | Connect any wallet, no KYC, free entry or 1 USDC retry | **PROVABLE** — 6 game apps live; `RETRY_FEE = 1 USDC` (line 128) |
| Devs | Deploy via SDK, earn 70% of retry fees direct on-chain | **OVERSTATED** — no SDK package; 70% has no on-chain enforcement |
| SkillOS | No custody, no KYC, 30% platform fee, sweepstakes-safe by storage | **SOFT** — segregation is real; "30% auto-collected" is misleading |
| Sponsors | Permissionless funding, soulbound receipt, sanctions-gated | **PROVABLE** — SponsorshipModule + SBT + sponsor app all live |
| AI Labs | x402 endpoints, tier-classified decision data | **PROVABLE infra, ZERO traction** — endpoints work, 0 calls so far |

---

## Layer 6 — Submission Narrative Gap

### YC S26 form fields (from `/howtoapply` + S26 RFS docs; live form is behind login)

| Field | Hard cap | Reusable from |
|---|---|---|
| Company name | short text | "SkillOS" |
| Company URL | single field | https://skillbase.games |
| One-liner ("what your company does") | **50 chars** | Pick: "AI-powered infrastructure for skill gaming" (50 chars exactly?) or "The data layer for gaming AI" (29 chars). **CONTRADICTION 5.5 must be resolved before this field.** |
| What you're building | ~200 words | MAS README:34-39 has the 4-layer revenue narrative ready |
| Founder bios + impressive achievements | 1-2 sentences | Not on disk |
| Hacker story ("non-computer hack") | paragraph | Not on disk |
| Demo video URL | single | https://… (host the rendered MP4 or YouTube unlisted) |
| **1-min founder video URL** | exactly 60s | **Founder video exists at `~/Desktop/skillbase-founder-video.mp4` (3.3 MB, 27 Apr) but length/content NOT VERIFIED.** YC docs: must be founders-only, no demo content. |
| Free-text "anything else" | (informal) | Optionally: link to Claude Code session JSONLs converted to Markdown |

**S26-specific hook:** "Software for Agents" RFS (category 12 of 15) is the strongest fit — weave into "what you're building" answer. No dedicated RFS-tag field.

**Reusable drafts found:** None. No Devfolio draft, no YC draft anywhere on disk (`find ~ -iname "*yc*" -o -iname "*devfolio*"` empty outside the founder MP4).

### Founder video status

**EXISTS, UNVERIFIED.** `~/Desktop/skillbase-founder-video.mp4` (3.3 MB, 27 Apr 2026). Length + content not inspected. No script doc on disk.

**Action:** play it before Sunday EOD; time it; verify ≤60s, founders-only, no demo. If non-compliant, re-record.

### Demo video status

**RENDERED. 90 seconds @ 30 fps. 8.3 MB at `out/skillbase-demo-90s.mp4`.** All 6 scenes, all 6 ElevenLabs Sarah VO MP3s in `public/audio/`. **2 factual errors (5.2, 5.3) require re-record + re-render before submit.**

### Coding agent transcript

**NOT EXPORTED.** 19+ raw `.jsonl` session logs in `~/.claude/projects/-Users-inancayvaz/`, none formatted. **YC S26 has no public transcript field**, so this is optional. If attaching: pick 1-2 impressive sessions (sweepstakes-safe contract design, sponsor flow), convert to Markdown. ~30-60 min.

---

## Layer 7 — Risk Inventory

### Submission-day failure modes + mitigations

| # | Failure mode | Likelihood (3-day) | Severity | Mitigation present? |
|---|---|---|---|---|
| F1 | Vercel deploy fails on one game app | LOW | HIGH | YES — Vercel auto-rollback; per-app independence |
| F2 | Vercel deploy fails on apex | LOW | CRITICAL | YES — auto-rollback; clean apex repo |
| F3 | Base Sepolia public RPC flakes | MED | HIGH (silent) | **WEAK** — viem default transport, no retry, no fallback. **Option A 2-line fix queued in `paid_retry_broadcast_post_yc` memo — recommend ship pre-submit.** |
| F4 | Supabase outage | LOW | CRITICAL | OK — managed, 99.9% SLO |
| F5 | Contract revert during demo | LOW | MED | GOOD — settle-guard tripwire test, sponsor smoke, pre-tx SanctionsOracle |
| F6 | DNS / cert issue on `*.skillbase.games` | VERY LOW | CRITICAL | GOOD — Vercel-managed |
| F7 | Trusted signer ETH < gas floor | LOW | HIGH | OK at 0.0496 ETH; manual top-up cycle |
| F8 | Trusted signer USDC depleted by daily cron | LOW (currently 145.5 USDC) | HIGH | OK |
| F9 | Sponsor wallet ETH < gas floor | **MED** (currently 0.00999 ETH, ~5 tx headroom) | HIGH | **Top up 0.02 ETH from signer before any further demo activity** |
| F10 | OG image route 500s | LOW | MED | GOOD — recently shipped, regression-tested |
| F11 | Anthropic API rate limit / outage | LOW-MED | MED | OK — SDK retry built-in; Coach/Recap fail-soft to placeholder |

### Rollback plan for v2.1 migration (Saturday 2026-05-02)

| Step | Reversibility |
|---|---|
| addresses.ts revert | YES — flip env var override or constant |
| Vercel redeploy stale | YES — `git revert <commit> && git push` cascades to all 6 apps + sponsor |
| v2.0 settle path on-chain | YES — v2.0 contract immutable + active. **VERIFY pre-migration: no in-flight v2.0 tournaments orphaned by switching addresses; or settle them first.** |
| Sponsor app indexing | n/a — reads SponsorshipModule events directly; address-agnostic |
| Frontend cached state | RECOVERABLE — hard refresh |

**REQUIRED Saturday pre-flight (NEW from this audit):**

1. **Resolve v2.1 trustedSigner orphan (Layer 2 finding 2.1) BEFORE migration.** Owner tx: `setTrustedSigner(0xA24f9122…)` on v2.1 pool.
2. Verify no in-flight v2.0 tournaments would be orphaned by address switch.
3. Verify trustedSigner USDC balance covers ≥4 days × 6 games of cron `create-tournaments`.
4. Verify sponsor wallet ETH balance after top-up.

**REQUIRED Saturday post-flight smoke:**

5. Curl all 6 game subdomains for solo flow + tournament list.
6. Submit one solo run end-to-end on a v2.1 mirror tournament — verify on-chain `submitSoloScore` succeeds (this is what 2.1 fixes).
7. Verify Vercel error logs (manual dashboard pull, since CLI is broken).

### Submission window discipline (Mon 2026-05-04 evening)

| W# | Risk | Mitigation |
|---|---|---|
| W1 | Last-minute commit breaks production during 24-72h jury crawl | **Rule: NO pushes to MAS or apex `main` after submission timestamp until jury feedback returns.** (Memory note `skillbase_sprint_push_policy` currently authorizes direct-to-main for sprint; rule INVERTS post-submit.) |
| W2 | Apex `NEXT_PUBLIC_*` Tally + decisions-count vars unset → ugly fallback | Pre-submit: populate the 4 vars OR confirm fallback UI is presentable. |
| W3 | Juror tries paid-retry → silent broadcast fail (F3) → "submitted ✓" but BaseScan empty | **Ship Option A from `paid_retry_broadcast_post_yc` pre-submit** — 2-line viem transport config in `packages/lib-shared/src/rpc.ts`. |
| W4 | Saturday migration breaks subtly, surfaces Sunday/Monday | **Buffer Saturday for migration; Sunday for soak. NO commits Monday except submission link itself.** |
| W5 | Founder video missing → YC form blocks submit | Video EXISTS but unverified — play, time, decide before Sunday EOD. |
| W6 | Coding-agent transcript missing | Not required; optional. Skip is low-risk. |

---

## Sweepstakes Verification Appendix — 2-minute jury walkthrough

> *Use this in the YC application "anything else" field or interview prep.*

1. Open `https://sepolia.basescan.org/address/0x5CadD5557B7e5182216E4d7c50B35495D93aA9d1` (TournamentPool v2 — `lib/constants.ts:16`).
2. Click **Contract → Read Contract**. Two storage mappings make the segregation visible:
   - `feeCollected(bytes32 id)` — retry-fee atoms only
   - `getTournament(bytes32 id).prizePool` — sponsor-funded atoms only
3. Pick a real tournament id from the **Events** tab (filter `TournamentCreated` or `RetryFeePaid`).
4. Read both mappings. Values move under different events:
   - `RetryFeePaid` increments `feeCollected`
   - `PrizePoolFunded` increments `prizePool`
5. Click **Contract → Read Contract → withdrawFees** ABI: accepts only `(id, to)`, owner-gated. **The prize pool slot has no withdraw entry point.**
6. Result: retry fees and prize money live in different accumulators with disjoint write-paths. **The legal moat is on-chain, not policy.**

**Caveat for honesty:** the 70/30 dev split is NOT visible on-chain — that's an off-chain accounting concept. Frame it as such.

**Code references:**
- Storage: `contracts/src/TournamentPool.sol` L92 (`prizePool` in struct) vs L181 (`feeCollected` mapping)
- Tests: `contracts/test/TournamentPool.t.sol` L982, L1038, L1267 — three named invariant tests

---

## Final Action Plan (chronological)

### Friday 2026-05-01 (today, T-3 days)

1. **DECIDE on sponsor.skillbase.games disposition** — deploy or scrub. (P0)
2. **Fix v2.1 trustedSigner** — owner tx `setTrustedSigner(0xA24f9122…)` on v2.1 pool. (P0) ✓ **Closed 2026-05-02** — tx [`0xb5db…591e8`](https://sepolia.basescan.org/tx/0xb5db90eaeba5d78a921f68ab71238a0891dc1d4f5c167f82e164b874464591e8).
3. **Top up sponsor wallet** — 0.02 ETH from signer. (P0) ✓ **Closed 2026-05-02** — tx [`0x9d4b…4af7`](https://sepolia.basescan.org/tx/0x9d4bccb976f3942e01413cc0e53d1b80c729f8fd84aa175d270fea600d1d4af7).
4. **Verify contracts on Blockscout** — `forge verify-contract` × 4. (P1) ✓ **Closed 2026-05-02** — PR #9 (`eac44d3`); 4 contracts verified on Blockscout (links in PR).
5. **Reword 70/30 + 30% claims** in `apex.ts:58,64,73,134-135`. (P1) ✓ **Closed 2026-05-02** — apex PR #3 (`88206ed`); also closes Layer 5 items 5.1 + 5.4.
6. **Cut "1.2M+" from demo Scene 5; fix Haiku→Sonnet 4.6 in script.ts:25; re-record + re-render.** (P1)
7. **Pick canonical thesis line** + back-propagate to README + apex + demo. (P1)
8. **Sign apex farcaster.json `accountAssociation`** (or remove the manifest). (P1)
9. **Ship Option A retry transport fix** in `packages/lib-shared/src/rpc.ts`. (P1) ✓ **Closed 2026-05-02** — PR #14 (`4f83e5a`); also closes Layer 7 W3 + F3.
10. Optional: rewrite apex `README.md`, fix 2 react-hooks errors, drop apple-icon.png, add `useSwitchChain`. (P2)

### Saturday 2026-05-02 (T-2 days, MIGRATION DAY)

1. **Pre-flight:** confirm steps 1-3 above are done; verify no in-flight v2.0 tournaments orphaned.
2. **Migration:** flip `addresses.ts` consumers to v2.1; deploy to all 6 game apps + sponsor (if deployed).
3. **Post-flight smoke:** curl all 6 subdomains; submit one solo run on a v2.1 mirror tournament; pull Vercel error logs (manual dashboard).
4. **Local cleanup:** `rm -rf apps/sponsor/.next/`; verify `npm run typecheck` green; add `.eslintrc.json` per app to unblock lint.

### Sunday 2026-05-03 (T-1 day, SOAK)

1. **Play founder video.** Time it. Verify ≤60s + founders-only. Re-record if non-compliant.
2. **Optional:** export 1-2 Claude Code sessions to Markdown for "anything else" field.
3. **Apex `NEXT_PUBLIC_*` vars:** populate or confirm fallback UI is jury-presentable.
4. **No new commits.** Soak.

### Monday 2026-05-04 (T-0, SUBMIT)

1. Final smoke: curl all subdomains + apex.
2. Submit YC form by 8pm PT.
3. **No more pushes to `main` until jury feedback returns.**

---

*Generated by parallel ultrareview run 2026-05-01. 5 specialized agents covered Layers 1-6 in isolated context; Layer 7 synthesized from agent outputs + memory state + repo git log. No code modifications applied.*
