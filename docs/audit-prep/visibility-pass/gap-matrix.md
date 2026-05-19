# Backend ↔ Frontend gap matrix

Sorted descending by **visibility value ÷ effort** ratio. Effort in agent-velocity hours (one focused worktree session). Visibility value: Low / Medium / High — weighted for investor pitch + marketing impact + jury-readability.

| # | Backend capability shipped | Sprint / PR | Frontend surface today | Surface uplift opportunity | Effort (h) | Visibility value |
|--:|---|---|---|---|---:|---|
| R1 | Glicko-2 rating system end-to-end (compute, store, history, leaderboard API) | X23.1/2/3 — #137, #139, #141 | **None** — no UI consumer; `/v1/ratings/*` endpoints orphaned | Rating + RD pill on solo result, rating delta animation (+12 / −8), rating column on global leaderboard, mini sparkline on profile | 5–8 | **High** — "skill rating like chess" is the cleanest pitch story shippable today |
| R2 | Tournament class declaration (`human-only` / `agent-only` / `mixed-declared`) | X14.0 — #130 | DTO populated, only used to gate X14.1 modal — no visible pill anywhere | "Human-only" / "Agent-only" / "Mixed" pill on tournament card on `/tournament`, `/tournament/[id]`, and as eyebrow on `/tournament/solo` | 2–3 | **High** — investor narrative: "agent participation is a class, not a feature flag" (locked invariant #3) — pill makes it visible |
| R3 | AntiCheat F0 plausibility verdict (verdict + reason on every solo run) | X20.0b + X20.1 — #142, #146 | Reject: generic red panel with raw server string; success: vague "AI Reviewed ✓" badge with no detail | "Why was this flagged?" inline reason on reject; "Reviewed — plausible" detail on hover/expand of badge; admin verdict drill-down for jury / blog screenshots | 3–5 | **High** — anti-cheat thesis is core to the safety story; user-visible verdict converts it from invisible to load-bearing |
| R4 | Builder code attribution (per-game `bc_*` codes wired into `dataSuffix`) | X10 / X10b — #71, #73, #74 | Hardcoded constant in each `app/layout.tsx`; only visible on `/dev/sdk-demo` | "Built on SkillOS · `bc_xxx`" footer mark on `/tournament/solo`, OG image attribution row, `/profile` row "Attributed runs: N" | 2–3 | **Medium** — devx pitch artifact; live-attribution on every game is a developer-story win at low effort |
| R5 | DevAttributionNFT soulbound (mint on first attributed run + audit-prep invariants) | X11.4 — #143 (audit-prep), earlier mint sprint | Zero — no "you minted a DEV SBT" surface | "Your DEV SBT" card on `/profile` (NFT image + tokenId + Basescan link); badge on `/dev/sdk-demo` | 3–4 | **Medium** — supports the "developer economy" thesis; sticky for builder onboarding |
| R6 | Sponsor SBT receipt visualization (ERC-5192 soulbound, on-chain JSON metadata) | sponsor flow + earlier | Plain text `Receipt #${id}` only | NFT image render (`tokenURI` JSON parse), "View on Basescan" link, share card "I sponsored 50 USDC of Pool X" | 3–4 | **Medium** — sponsor stickiness + Twitter share artifact |
| R7 | Class-mismatch settle exclusion (defense-in-depth cron) | X14.0b — #147 | Exclusion happens silently; user sees `excluded=true` flag on their leaderboard row but no reason copy | "Excluded — class mismatch" hover tooltip on the leaderboard `excluded` indicator; on `/profile` activity rows surface exclusion reason | 1–2 | **Medium** — closes the "why is my row dimmed?" gap |
| R8 | Cross-game total prize pool / platform stats | aggregate (always-available DB) | Each game shows its own; no platform-wide stat displayed | Apex hero metric ("$X distributed across N tournaments to M players") + sponsor app cross-game total | 1–2 | **Medium** — pure pitch fuel |
| R9 | Cron health / Discord alert visibility (PR #145) | alerting infra — #145 | None — operator-only | Optional `/admin/cron-health` jury-viewable page rendering recent `v2_cron_runs` + `alert_history` (gated by env-flag or admin signature) | 3–5 | **Low–Medium** — useful for due diligence demos, not for end users |
| R10 | Rate limiter 429 (X15.5 Upstash) | X15.5 — #151 | HTTP code only; no UI affordance for "too many requests" | Friendly retry-after toast on x402 / submit / read endpoints | 1–2 | **Low** — edge case in normal use |
| R11 | Replay data path (T2 tier `/v1/data/match-replay/:id`, MCP-callable) | data-economy x402 endpoint, stubbed payload | API + MCP only, deterministic stubs | UI replay viewer at `/replay/[id]` that hits the paywalled endpoint via x402 (or a dev-mode free path) and animates seed + moves; per-game viewer (2048 / wordle / minesweeper). Stub-aware fallback "Replay preview — Phase 2 unlocks full move set" | 8–14 (per game; one-game pilot 6–8) | **High** — single biggest investor/jury "skill verifiable" demo artifact; also closes founder's flagged item |
| R12 | Tournament invite share (`TournamentInvite` shared component exists) | earlier sprint | Present in components but worth surfacing more visibly | Float "Invite + earn share" CTA on `/tournament` after a submit, with deep-link preview card | 1–2 | **Low** — incremental |
| R13 | SP-tier distribution (paid `/api/public/data/sp-tier-distribution`) | x402 data tier | API only, paywalled | Free read-only histogram widget on apex `/data` page + each game's `/leaderboard` footer | 2–3 | **Low–Medium** — proof-of-data-tier; nice marketing detail |
| R14 | Extension warning audit log (server-side `X-Extension-Profile` capture) | X14.1 — #152 | Soft-warning modal is live (the only #143–154 UI surface) | Admin "extension audit feed" view (mirrors `flags` admin route), one-line counts per connector | 2 | **Low** — operator-only payoff |

## Ratio shortlist (visibility ÷ effort)

| Item | Effort | Value | Crude ratio |
|---|---:|---|---|
| R2 (class pill) | 2.5 | High | **highest** |
| R8 (cross-game stat) | 1.5 | Medium | high |
| R7 (exclusion tooltip) | 1.5 | Medium | high |
| R4 (builder mark) | 2.5 | Medium | high |
| R1 (rating pill + sparkline) | 6 | High | high |
| R3 (F0 reason surface) | 4 | High | high |
| R10 (rate limit toast) | 1.5 | Low | medium |
| R6 (sponsor SBT image) | 3.5 | Medium | medium |
| R5 (DEV SBT card) | 3.5 | Medium | medium |
| R11 (replay viewer pilot 1 game) | 7 | High | medium (high under cost) |
| R12 (invite CTA) | 1.5 | Low | low |
| R9 (admin cron-health UI) | 4 | Low–Med | low |
| R13 (sp-tier widget) | 2.5 | Low–Med | low |
| R14 (extension audit feed) | 2 | Low | low |

## Cross-cutting constraints noted during synthesis

- **Per-game duplication tax**: AICoach, AIRecap, AIReviewedBadge, SPEarnedCard are cloned across 6 game apps (per the explicit comment in `apps/2048/src/components/SPEarnedCard.tsx`). Any "show rating" or "show class pill" addition that lives in those four files is a 6× templated edit. Estimates above assume that pattern. A pre-flight "lift to packages/ui" sprint (post-submission backlog item) would amortize all of R1/R3 cheaper next time.
- **`ModeChooser` and `Header` are already lifted**: pill additions to the homepage card or top bar are 1-edit fan-out across 6 apps.
- **Apex propagation**: any change that touches public messaging (the cross-game stat in R8, the "rated skill platform" framing in R1) needs an apex repo update — those estimates assume on-disk change only and add ~30 min for apex sister-PR.
