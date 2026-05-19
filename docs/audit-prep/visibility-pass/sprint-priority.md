# Sprint priority recommendation

Top 7 candidates ranked by (visibility value) ÷ (effort). Sprint codes are F-prefixed for new visibility work; "polish-Xnn" naming where the sprint enhances an existing X-sprint user surface.

## Ranked recommendations

### F1 — `polish-X14.0` — Tournament class pill on every card

**Scope**

- Add a colored pill on `/tournament`, `/tournament/[id]`, and `/tournament/solo` eyebrow: 🧑 **Human-only** (amber) · 🤖 **Agent-only** (purple) · 🔀 **Mixed** (neutral).
- `packages/ui/TournamentClassPill.tsx` — single shared component, render once, fan-out to 6 game apps.
- Pull legend tooltip from X14.0 SCOPING.md §1 wording (Phase 1 class-agnostic contracts, off-chain enforcement; copy is already locked).

**Effort**: 2–3h.

**Post-merge user sees**: "🧑 Human-only" pill above every solo-action area + on every tournament card. The X14 invariant becomes load-bearing in the UI for the first time.

**Visibility value rationale**: directly surfaces locked architectural invariant #3 ("agent participation is a class, not a feature flag"). One pill turns a hidden enum into a visible product position — investor-readable, jury-readable, blog-screenshotable.

**Dependencies**: none. X14.0 DTO already in place.

---

### F2 — `polish-X20.1` — Plausibility verdict surface

**Scope**

- On reject (HTTP 400 `f0_formula_implausible`): purpose-built panel "Run flagged for plausibility · reason: …" with neutral copy (no shaming), plus a "Phase 1 audit — appeal" link to a brief page explaining the AntiCheat program.
- On success: expand `<AIReviewedBadge>` hover/tap to reveal verdict + reviewedAt + ANTICHEAT model display (already exported from `@skillos/ui/models.ts`).
- Server: surface `verdict` + `reason` fields on `/api/tournaments/solo/[matchId]/plausibility` (already exists per AIReviewedBadge expectation — verify or extend).

**Effort**: 3–5h.

**Post-merge user sees**: instead of a generic red panel, a designed "Flagged · F0 plausibility" card with reason copy. Pass-through badge becomes a glanceable verdict + tap-to-detail interaction.

**Visibility value rationale**: AntiCheat is the safety thesis. Today it is shipped and silent; this PR makes it visibly load-bearing in every game session. Strong jury-readability.

**Dependencies**: should land *after* F1 — both touch result-card area; bundling avoids merge conflicts.

---

### F3 — `polish-X23` — Rating display surface (solo result + leaderboard + profile)

**Scope**

- Lift `RatingPill` and `RatingDelta` into `packages/ui` (rating + RD shown as `1432 ± 18`).
- Solo result: rating delta animation right of "+N SP" — `+12 (→ 1444)` or `−8 (→ 1424)`.
- Global leaderboard: add Rating column next to Level (per-game cycling toggle defers to a follow-up; v1 shows highest game rating).
- Profile: line chart sparkline over `/v1/ratings/history/[address]` (24-h decimation).
- Fetch via existing `apps/api/v1/ratings/*` endpoints; rate-limited `read` bucket; cursor pagination already in place.

**Effort**: 5–8h.

**Post-merge user sees**: every solo submission animates a rating delta; leaderboard sorts by Glicko rating in a tab toggle; profile page shows a sparkline.

**Visibility value rationale**: takes shipped-but-orphaned X23 work and converts it to a *category-defining* user surface — "chess-style ranked tournaments on Base." This is the single highest-leverage uplift in the audit.

**Dependencies**: F1 (shared pill pattern + per-app fan-out lessons). Apex sister-PR to add "Rated · Glicko-2" to public messaging.

---

### F4 — `polish-X10` — Builder code attribution badge

**Scope**

- "Built on SkillOS · `bc_o6szuvg1`" footer mark on the solo flow + tournament cards. Tap → mini explainer "What's a builder code? Each game on SkillOS earns developer attribution on-chain. Read more →".
- Lift hardcoded constant from each `app/layout.tsx` to a shared `BUILDER_CODES` map in `@skillos/sdk` (already exports `builderCodeToDataSuffix`).
- OG image attribution row.

**Effort**: 2–3h.

**Post-merge user sees**: small attribution mark on every game page; the "developer economy" thesis becomes visible product fabric instead of a roadmap promise.

**Visibility value rationale**: aligns with `[[project_builder_code_strategy]]` memory (5 distinct wallets, one per game, audit-bound). Today this is *only* visible at `/dev/sdk-demo` — a developer page, not a user page. Surface uplift completes the X10/X10b user surface.

**Dependencies**: none.

---

### F5 — `polish-X14.0b` — Exclusion reason tooltip

**Scope**

- Tournament leaderboard `excluded` column today is a dim text marker. Add `<ExclusionTooltip reason={row.excluded_reason}>`:
  - `anticheat_implausible` → "Flagged — implausible score"
  - `class_mismatch_settle_exclusion` → "Class mismatch (X14.0b)"
  - `pending_review` → "Under review"
- `/profile/[address]` activity rows mirror the same.

**Effort**: 1.5–2h.

**Post-merge user sees**: hover-tooltip on every excluded row across leaderboard + profile, replacing "why is this row dimmed?" with explicit copy.

**Visibility value rationale**: closes the defense-in-depth UX gap from X14.0b (#147). Small but eliminates user-side confusion.

**Dependencies**: none.

---

### F6 — `feat-replay-viewer-2048-pilot` — Replay viewer pilot (2048 only)

**Scope**

- New route `/replay/[id]` on `apps/2048` only. Free local dev path + paywalled prod path (x402 dataSuffix preserved).
- Walks the move list from the seeded RNG-deterministic engine in `apps/api/src/lib/duel/game-2048.ts` — already comment-blessed for "Replay verification (T2 tier, post-Phase-2)".
- Renders the board frame-by-frame with scrubber (start → end), shows final score + verdict + AntiCheat model row.
- Phase-1 stub awareness: when payload is the deterministic stub from `data.ts`, banner says "Replay preview — Phase 2 unlocks full move set."
- Deferred: per-game viewer fan-out (wordle / minesweeper) and full Phase-2 replay verification on-chain anchoring.

**Effort**: 6–8h (single-game pilot).

**Post-merge user sees**: shareable URL → animated replay of any settled tournament run. Demoable in a tweet, screenshotable for the pitch deck.

**Visibility value rationale**: this is the highest-quality "skill verifiable" demo artifact the platform can ship. Single biggest investor wow-factor in the audit. Also closes founder's flagged item ("locate current implementation, document scope") — the answer is "no viewer exists, this is the proposal."

**Dependencies**: x402 dev-mode bypass for free local viewing (already standard pattern in `apps/api/src/lib/x402.ts`).

---

### F7 — `feat-platform-stats-banner` — Apex + sponsor cross-game stat surface

**Scope**

- Apex hero subheading: "$X distributed across N tournaments to M players" (live via `/api/public/platform-stats`, refetch 5 min).
- Sponsor app `/` adds a single banner row: "Total platform contributions: $Y across N pools."
- Backend: add aggregate read to `packages/duel-backend` (existing `v2_sponsor_contributions` + `v2_tournaments` + `v2_user_stats` rows). Free read; no x402 gating.

**Effort**: 1.5–2h.

**Post-merge user sees**: instantly more impressive landing pages — exact distributed-USDC count instead of vague "live tournaments."

**Visibility value rationale**: pure pitch fuel; converts shipped on-chain activity into a marketing artifact. Cheap.

**Dependencies**: apex repo sister-PR.

---

## Categories

### Quick wins (under 4 hours, immediate visibility uplift)

1. **F1** — class pill (2–3h)
2. **F5** — exclusion reason tooltip (1.5–2h)
3. **F4** — builder code attribution (2–3h)
4. **F7** — cross-game platform stat banner (1.5–2h)

Each is shippable inside a single sprint window. F1 + F5 + F4 can all bundle into one PR (`polish-x14-and-x10-surfaces`) at ~5h total — three locked sprints get user surface in one pass.

### Demo material (pitch deck screenshots / Twitter posts)

1. **F6** — replay viewer pilot — single most demoable artifact; produces a sharable URL.
2. **F3** — rating delta animation on solo result + sparkline on profile — "chess-style skill on Base."
3. **F1** — Human-only / Agent-only / Mixed pills on tournament cards — visualizes the agent-class invariant.
4. **F2** — "AI Reviewed ✓" expanded verdict card — visualizes the AntiCheat thesis.

### UX completion (close incomplete sprint user surfaces)

1. **F1** completes X14.0 — `tournamentClass` ships but no UI rendering.
2. **F2** completes X20.1 — F0 rejects bubble up as raw error strings only.
3. **F3** completes X23.1/2/3 — entire Glicko-2 sprint has zero UI consumer.
4. **F4** completes X10/X10b — builder codes visible only in `/dev/sdk-demo`.
5. **F5** completes X14.0b — defense-in-depth exclusion silent to users.
6. **F6** completes the replay capability hinted at by `data.ts` + `mcp/fetch_match_replay.ts` headers ("Replay verification (T2 tier, post-Phase-2)").

---

## Recommended dispatch order

If founder picks **one sprint** to ship next:
- **Visibility-maximizer**: F3 (rating display) — closes the largest backend↔frontend gap in the audit; converts an entire orphaned sprint into a category-defining surface.
- **Speed-maximizer**: bundled F1 + F5 + F4 — three locked sprints get user-visible polish in ~5h.
- **Demo-maximizer**: F6 (replay viewer pilot) — single most demoable artifact for the pitch.

A reasonable two-PR rhythm: ship the **bundled F1+F5+F4 quick-wins PR** first (5h, lots of visible polish), then ship **F3 rating surface** as a focused second PR (5–8h, the headline). F6 (replay viewer) and F2 (verdict surface) can follow after founder calibration on which thesis to lean harder on next: skill-rating or anti-cheat.
