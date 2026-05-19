# Per-app frontend surface coverage

8 apps in scope: 6 games + 1 sponsor + 1 marketing (apex lives in companion repo `skillos-apex`).

## Inventory of all user-facing routes (per game app — uniform across 6)

```
/                        ModeChooser (shared @skillos/ui)
/tournament              Active daily + weekly leaderboards (live)
/tournament/[id]         Per-tournament detail (settled or active)
/tournament/solo         Pay-then-play state machine (primary surface)
/tournament/archive      Last 10 settled tournaments
/duel/*                  <DuelComingSoon /> placeholder (Phase 2 muted)
/leaderboard             Global SP+Level leaderboard (cross-game)
/profile/[address]       SP+Level + activity (duel/solo rows with verdict)
/dev/sdk-demo            Builder code + dataSuffix dev page (developer-visible)
/dev/game-test           Test harness
```

Sponsor app (`sponsor.skillos.games`):
```
/                        Cross-game active tournament list
/[tournamentId]          Sponsor flow: approve USDC → sponsorPool → SBT receipt
/dashboard               Connected wallet's contribution history
```

Orchestrator app: no public UI (`apps/orchestrator/src/app/page.tsx` is a static operator message).

API app (`apps/api/`): no UI surface — Hono service hosting `/v1/*` routes.

---

## apps/2048 (reference implementation)

**Current surface state**

- Solo flow: pay-then-play with `useSoloRetry` state machine; SoloResultCard renders 4 AI slot components (AIReviewedBadge, SPEarnedCard, AIRecap, AICoach) post-submission.
- Tournament page renders sponsor name + logo on tournament card, daily/weekly prize-pool curve preview, live 5s leaderboard refetch.
- Leaderboard column shows player `Level` pill (Lx) from `v2_user_stats`.
- ExtensionWarningModal renders inline above action area on `human-only` tournaments when connector is non-whitelisted (X14.1 — PR #152).
- Profile page: SP + Level + activity (duel + solo with `verdict: plausible | suspicious | implausible`).
- Anti-cheat audit badge: "Reviewing…" pill → "AI Reviewed ✓" pill after Haiku settles (~5s poll, max 1 retry).

**Last user-visible change**

`0bc2865 feat(x14.1): extension whitelist soft-warning + server audit log` (#152, 2026-05-19) — one shared modal across 6 apps + 6 solo page edits.

Prior visible change: `6564cc1 feat(x20.0a): moves instrumentation plumbing` (#128) — pure plumbing, zero pixel diff. The most recent **pixel-affecting** change before #152 was 2026-04-23 (PR #75/74-era brand cutover).

**Backend capabilities not yet surfaced in UI**

| Capability | Status |
|---|---|
| Tournament class declaration (X14.0) | `tournamentClass` reaches the page as a JS string but no visible pill on any tournament card; only used to gate the X14.1 extension modal |
| AntiCheat F0 verdict on reject (X20.1) | Generic `<Panel tone="error">` shows `error ?? "Something went wrong."` — the server reason `f0_formula_implausible` reaches the page but there is no purpose-built "rejected for plausibility" treatment |
| Builder code attribution (X10/X10b) | Hardcoded in `app/layout.tsx` (`builderCode: "bc_o6szuvg1"`) — invisible to the user. Only `/dev/sdk-demo` shows the dataSuffix |
| Glicko-2 rating (X23.1/2/3) | API endpoints exist (`/v1/ratings/*` on `apps/api`) but **no rating displayed anywhere in the game UI** — not on leaderboard, not on profile, not in solo result. The whole rating surface is API-only |
| DevAttributionNFT (X11.4 + earlier) | No mention of "you minted a DEV SBT" or any builder NFT in the UI |
| Cron alerting / health (PR #145) | Discord-only; no `/admin/cron-health` page |
| Rate limiter 429 (X15.5) | Returned as HTTP code; no friendly UI affordance |
| Sponsor logo on solo flow | `sponsorLogoUrl` reaches tournament/page.tsx but **not** the solo-flow eyebrow ("sponsored by Acme") |

---

## apps/wordle, apps/sudoku, apps/minesweeper, apps/clicker, apps/match3

**Identical surface to apps/2048** — same 5-file `components/` shape (`Game{X}.tsx`, AICoach, AIRecap, AIReviewedBadge, SPEarnedCard, TournamentInvite), same route tree, same `ModeChooser` homepage.

Solo page is per-game-templated but the visible state diffs only by tile name and a hard-coded subhead. Same X14.0 / X14.1 / X20.0a / X20.1 surfaces (or lack of) as 2048.

**Templating drift class**: AICoach + AIRecap + AIReviewedBadge + SPEarnedCard are duplicated 6× (per `apps/2048/src/components/SPEarnedCard.tsx` header comment: "Per-app duplication: this file is cloned to 5 other apps … Lift to packages/ui is post-submission backlog"). Any "show rating", "show class pill", "show plausibility reason" change is a 6× edit until lifted.

**Last user-visible change** — identical to 2048: #152 (X14.1).

---

## apps/sponsor (`sponsor.skillos.games`)

**Current surface state**

- `/` lists cross-game active tournaments sorted by `endsAt` ASC with prize pool + sponsor count + `[Sponsor a Pool]` CTA; 5-min refetch.
- `/[tournamentId]` runs the sponsor flow: balance + allowance → approve USDC → `SponsorshipModule.sponsorPool()` → on settle shows tx hash + dashboard CTA. Sanctions-revert is decoded as a dedicated message (not "tx failed").
- `/dashboard` lists connected wallet's contributions: tournament id, amount, `Receipt #${receiptTokenId}`, tx hash, relative time. 1-min refetch.

**Last user-visible change**

`06da970 feat(meta): add twitter.site + twitter.creator handles` (#75, 2026-04-23) — meta only. No functional pixel diff in **27 days**.

Last *functional* change: PR #74 `feat(attribution): wire dataSuffix on solo-retry + sponsor flows (X8)` and PR #57+#58 brand cutover.

**Backend capabilities not yet surfaced**

| Capability | Status |
|---|---|
| Soulbound receipt visualization (SBT image) | Shown as `Receipt #${id}` text only; no NFT preview, no Basescan link, no on-chain JSON metadata render |
| Cross-game sponsor leaderboard / total platform contributions | Not displayed anywhere |
| Per-pool sponsor list ("backed by …") | Sponsor count is shown, but individual sponsor addresses/SBT holders are not surfaced |
| Sponsor flow analytics (your pools won / your payout impact) | Not surfaced |
| Brand-verified pill (sponsor-flow.md ToL claim) | Not rendered on the tournament list |

---

## apps/apex (marketing site — companion repo `skillos-apex`)

Not in this monorepo. Tracked separately per [CLAUDE.md companion-repo](../../../CLAUDE.md) section. **Out of scope** for this audit's file inventory, but in-scope for visibility-value rationale — the apex repo is the public messaging surface (apex tagline, hero, OG, 4-phase public roadmap). Surface uplift items that change *public messaging* must propagate by hand to apex.

---

## apps/orchestrator + apps/api

- Orchestrator: cron-only, page is a static text explainer.
- API: no UI surface (`@hono/zod-openapi` service).

Neither has a frontend uplift opportunity in this audit's scope. The visibility-value angle for the API is: the `/v1/ratings/*` endpoints (X23.3) exist with zero UI consumer in any game app — a classic "shipped backend with no user". See gap-matrix.md row R1.

---

## Replay viewer — current state (founder flagged for explicit location)

**Search outcome**: there is **no frontend replay viewer / visualizer** anywhere in `apps/*/src/` or `packages/ui/src/`. The string "replay" surfaces in:

1. `apps/api/src/routes/data.ts` + `apps/api/src/schemas/data.ts` — `GET /v1/data/match-replay/:id` x402-paywalled T2-tier endpoint ($0.01 USDC on Base Sepolia). The header comment explicitly notes "**Phase 1 returns deterministic stubbed samples**; payload shape is the long-term contract."
2. `packages/mcp/src/tools/fetch_match_replay.ts` — MCP tool that pays via x402 and returns the JSON to an AI agent.
3. `apps/api/src/lib/duel/game-2048.ts` — server-side mirror of the 2048 engine. Header comment: "**Replay verification (T2 tier, post-Phase-2)** walks the move list and re-derives boards from seed + moves. Any divergence and replay fails." This is the *deterministic-verification scaffolding* for a future replay viewer, not a viewer.
4. `packages/ui/src/useSoloRetry.ts` + `SoloResultCard.tsx` — "replay" used in the sense of *localStorage-buffered submit replay* (network-failure recovery), unrelated to match playback.

**Founder memory check**: there's nothing to "locate" — the replay capability is *deterministic-verifiable data* (seed + moves + score, paywalled x402 endpoint, MCP-consumed). No browser-based playback UI exists. If the founder's mental model includes a shipped replay viewer, that's memory drift.

**This is not a blocker** per agent-gate guidance — the *data path* is shipped, just not the *visualization*. The audit treats "build a UI replay viewer" as a candidate sprint (see sprint-priority.md F1) rather than a STOP-flag, because the founder's exact words ("locate current implementation, document scope") admit an outcome of "none exists yet, here's what's needed."

---

## What changes if you walk a user through the product today

Going `2048.skillos.games` → connect → "Play" → game-over → submit:

1. ModeChooser → solo card flagged "Live · Daily ranked" (good).
2. Solo page loads; **no visual mention** of class type (human/agent/mixed), no rating, no anti-cheat indicator until *after* submit.
3. If extension is non-whitelisted on a `human-only` tournament: amber modal appears above the action button (X14.1, only visible signal of the X14 fairness sprint).
4. Pay-then-play 2-tx chain (approve + chargeRetryFee).
5. Game plays.
6. Submit: success → `SoloResultCard` (good — best score, rank, NEW BEST badge, 4 AI slots). Failure on F0 plausibility → generic red panel with raw server text.
7. Result card shows: AIReviewedBadge ("Reviewing…" → "AI Reviewed ✓"), SPEarnedCard ("+N SP" + Level bar), AIRecap (narrative + share), AICoach (tone + advice).
8. Profile page → SP + Level + activity. Rank shown.
9. **At no point is the user told their Glicko rating, their tournament class match, the AntiCheat verdict reason, or the builder-code attribution.** Of the past 10 days of work, only the X14.1 modal (#152) is on this path.
