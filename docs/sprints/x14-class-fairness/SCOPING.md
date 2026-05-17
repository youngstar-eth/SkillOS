# Sprint X14 — Class-Aware Fairness X8 — Scoping Pass

**Status:** Scoping (Phase 1 wrap Cluster 1, pre-implementation)
**Branch:** `sprint/x14-scoping-pass1`
**Date:** 2026-05-17
**Scope:** Sub-sprint breakdown + paste-ready Claude Code prompts for the
class-aware fairness sprint listed in architecture supplement v1.3 §2.5,
v1.4 §3.13, and CR1 SYNTHESIS §6.1.
**Method:** Read-only investigation + planning. NO production code changes,
NO migrations, NO contract edits.
**VTP pre-flight:** Performed at top of this doc — see §1 (current state
baseline cites exact file paths + line numbers).
**Constraints honored:** CLAUDE.md invariants (1, 3, 4, 6), domain neutrality
(§2.4), memory-as-spec drift invariant (§2.6), audit-prep packet
(CR1 R3 §9, R4 §9.1, R4 §9.2, T5-3 verification).

---

## TL;DR

**Class-aware fairness today = absent at every layer.** No `is_agent` /
`class_tag` column anywhere; no tournament-level `class` declaration; no
extension whitelist; no AI-browser detection; no behavioral biometric capture;
no dishonor SBT contract. Class-neutral-by-absence rather than class-neutral
by enforcement. CLAUDE.md invariant #3 ("agent participation is a class, not
a feature flag") is *narratively* held but not enforced anywhere.

**Six sub-sprints** scoped (X14.0 through X14.5). X14.0 (schema + tournament
class declaration) is foundational; X14.1–X14.4 layer enforcement primitives
on top; X14.5 is integration-test + regression-suite closure.

**Effort range (founder velocity calibration applied):** ~7–14 days total
across the six sub-sprints. Three of the six can run in parallel with X20
(AntiCheat rebuild) after X14.0 lands.

**Open questions queued:** 12 founder decisions surfaced. See §6.

---

## 1. Current state baseline (VTP verification, 2026-05-17)

Cited paths verified on `sprint/x14-scoping-pass1` worktree HEAD
(origin/main 94db436).

### 1.1 Schema layer — zero class columns

| Table | File | Class columns present? |
|---|---|---|
| `v2_tournaments` | `supabase/migrations/v2_20260422_tournaments.sql:25-46` | **None.** `cycle_type` (daily/weekly) + `game` + sponsor fields only. No `tournament_class`, no `class_declaration`. |
| `v2_tournament_entries` | `supabase/migrations/v2_20260422_tournaments.sql:50-65+` | **None.** `player_address`, `best_score`, `match_count`, `excluded`, `source_duel_ids` — class-agnostic by absence. |
| `v2_duels` | `supabase/migrations/v2_20260421_duels.sql:11-38` | **None.** `player1_address` / `player2_address` only. No `player1_class` / `player2_class`. |
| `v2_tournament_solo_runs` | `supabase/migrations/v2_20260423_tournament_solo.sql:45-67` | **None.** `player_address`, `score`, `is_paid_retry`, `plausibility_check` — no `is_agent`, no `class_tag`. |

Cross-reference: CR1 R4 §9.1, §9.2 (IM-48) flagged this gap. Confirmed.

### 1.2 Contract layer — class-agnostic by design (no enforcement primitives)

| Contract | Path | Class-related symbols |
|---|---|---|
| `TournamentPool` | `contracts/src/TournamentPool.sol` | `grep class\|fair\|human\|agent\|dishonor\|sbt` → **only one hit** (comment at L276 for sponsor SBT mint, unrelated). |
| `ChallengeEscrow` | `contracts/src/ChallengeEscrow.sol` | Class-agnostic. `challenges[id]` has `playerA` + `playerB` + `submittedScoreA/B` + `excluded[id][player]` (set by `flagScore`). |
| `SponsorReceiptSBT` | `contracts/src/SponsorReceiptSBT.sol` | Sponsor receipt token only — NOT a dishonor SBT. ERC-5192 dishonor receipt is a NEW contract (X14.4 deliverable). |

CLAUDE.md invariant #3 is honored at the contract level: "Players field
includes both human and agent participants on the same arena." This is the
explicit anti-feature-flag stance. X14 must preserve this — class enforcement
goes *above* the contract, not inside it.

### 1.3 Backend layer — class derivable from auth surface but not persisted

- `apps/api/src/middleware/agent-auth.ts:38-45` — `requireSiwaAuth()` middleware
  sets `c.var.agent = { address, agentId, signerType, ... }`. SIWA auth ⇒
  agent class is mechanically derivable at request time.
- SIWB auth (human) is at `apps/api/src/lib/siwe.ts` + `siwa.ts` siblings;
  human-class derivation is symmetric (SIWB session ⇒ human class).
- **No code persists this distinction.** Submit handlers
  (`packages/duel-backend/src/duel/handlers.ts`, `apps/api/src/routes/scores.ts`,
  `tournaments/solo.ts`) write `player_address` without a `class` tag.
- **`/v1/scores` returns 501 for T1+** (per memory
  `project_phase2_mainnet_blocker_plausibility.md`). T1+ plausibility lift is
  scoped jointly with X14.0 (see §3 sub-sprint table; MB-9 from CR1 SYNTHESIS
  §5.1).

### 1.4 Frontend layer — no extension whitelist, no AI-browser detect, no biometrics

- Wallet integration: `wagmi` + Base Account (CR1 R1 §2.1). No extension
  fingerprint check before SIWB sign-in.
- Browser detection: zero hits for `comet`, `atlas`, `antigravity`, `claude-in-chrome`
  across `apps/`.
- Behavioral biometrics: zero capture surface (no pointermove/keydown
  capture, no client-side aggregation, no submit-side biometric blob field).
- Six game apps are duel-comingsoon (verified at `apps/{2048,clicker,
  match3,...}/src/app/duel/**/page.tsx`). Duel reactivation is **not** an X14
  pre-req — X14 must work on solo path first and integrate with duel when
  CR1 SYNTHESIS §6.1 duel reactivation sub-sprint lands.

### 1.5 What does exist — non-class anti-cheat primitives (X20 territory)

Per `docs/audit-prep/t5-3-anticheat-verification.md`:

| Gate | Path | Class-aware? |
|---|---|---|
| Duel submit: integer + range (0, 50_000) | `handlers.ts:385-394` | No. Hard-bound only. |
| Duel submit: play-window check | `handlers.ts:417` | No. |
| Solo submit: non-negative + duration ≤ 86_400s | `tournaments/solo.ts:292-336` | No. |
| Haiku AntiCheat verdict | `packages/ai-coach/src/anticheat/generate.ts` + `cron/tournaments.ts:892-944` | No. Verdict applies same threshold regardless of class. |

X14 sits **orthogonal** to X20: X14 introduces *who is allowed in this
tournament* and *how do we tell humans from agents*; X20 introduces *deterministic
formula plausibility per submission*. Both feed into mainnet AntiCheat per
v1.4 §3.13 strategic lock.

### 1.6 Substrate posture — domain neutrality preserved

Per supplement v1.2 §2.4: substrate primitives stay task-agnostic
(`submitScore`, `tournament`, `participant`, `submission`). X14's new columns
+ enums must keep this discipline. **Sub-sprint scope freezes (§3) explicitly
forbid `gamer-only` semantics in new schema.**

---

## 2. Architectural goals

Derived from supplement v1.3 §2.5 + v1.4 §3.13 + CR1 SYNTHESIS §6.1.

### 2.1 The 5-component X8 framework (canonical, v1.3 §2.5)

1. **Tournament-level class declaration** — sponsor selects one of:
   `human-only` / `agent-only` / `mixed-declared`.
2. **Extension whitelist** — on `human-only` tournaments, only Web3 wallet
   extensions (Base Account, MetaMask, Rabby, Coinbase Wallet) are tolerated;
   detect+reject AI-augmented extensions.
3. **AI browser detection** — Comet (Perplexity), Atlas (TBC), Antigravity
   (TBC), Claude-in-Chrome — fingerprint at SIWB sign-in time.
4. **Behavioral biometrics** — mouse + keyboard cadence signal, opt-in,
   tournament-scoped; surface as plausibility input not as absolute gate.
5. **Dishonor SBT (ERC-5192)** — soulbound invalidation receipt minted to
   wallets caught violating class declaration. Audit trail for repeat
   offenders.

### 2.2 Strategic lock from v1.4 §3.13 (Option F)

> *"Mainnet AntiCheat = deterministic formula plausibility (primary) + class
> enforcement (X14), with Haiku as off-chain advisory queue only. NO
> irreversible LLM verdicts on-chain."*

Implication for X14: class enforcement is **deterministic + auditable**.
No AI heuristics in the X14 gate (AI browser fingerprint is a deterministic
HTTP/JS signal, not a model call). Behavioral biometrics signal is *advisory*
(input to plausibility queue, not direct on-chain flag).

### 2.3 CLAUDE.md invariant #3 preserved

> *"Agent participation is a class, not a feature flag. Players field
> includes both human and agent participants on the same arena. SP-tier-classified
> data flows uniformly across classes."*

X14 enforces *honest declaration* + *cross-class auditability* without
changing the substrate's class-agnostic primitives. Sponsors who want a pure
human-only competition declare it; sponsors who want agents declare it;
mixed-declared is the default for class-agnostic tournaments. No feature flag,
no schema bifurcation — just a `tournament_class` enum.

### 2.4 Audit-firm framing (disclosure-ready)

Per v1.4 §3.13 disclosure paragraph:

> *"Class enforcement pending X14 sprint. Pre-mainnet rebuild architectural
> per X20 sub-sprints F0-F4: deterministic formula primary + class enforcement
> + Haiku off-chain advisory queue only."*

This phrasing locks X14 + X20 as joint pre-mainnet pre-reqs. Audit firm
packet (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin) will receive both
sprint closeouts together.

### 2.5 Cross-sprint adjacencies

| Sprint | Relationship to X14 |
|---|---|
| X20 (AntiCheat rebuild) | **Parallel.** X14 = declared class + identity primitives; X20 = deterministic formula + Haiku-as-advisory. X14.0 must land before X20.0 (formula bounds differ per class). |
| X10b (Human dataSuffix) | **Independent.** No coupling. |
| Duel reactivation | **Sequential.** X14 ships solo path first; duel path enforcement added as second wave once `settle-guard.integration.test.ts` un-skipped (sequential after X14 + X20 per SYNTHESIS §6.1). |
| Upstash nonce store unification | **Adjacent.** SIWB/SIWA nonce tables are unified in P2-Pre-B; X14 should land before that refactor to avoid double-touching the same auth surface. |
| Staging Supabase project | **Blocked-by.** X14 migrations apply directly to prod today (single-project per memory `project_skillos_no_staging_supabase`). Each X14 sub-sprint must repeat the X19 single-project apply discipline. |

---

## 3. Sub-sprint breakdown

| Sub-sprint | Title | Effort (founder velocity) | Mainnet pre-req? | Parallel-able? | Depends on |
|---|---|---|---|---|---|
| **X14.0** | Tournament-level class declaration + schema + T1+ plausibility lift | 2–3 days | ✓ | — (foundational) | nothing |
| **X14.1** | Extension whitelist (Web3 wallets only on `human-only`) | 1–2 days | ✓ | with X14.2, X14.3 | X14.0 |
| **X14.2** | AI browser detection (Comet / Atlas / Antigravity / Claude-in-Chrome) | 1–2 days | ✓ | with X14.1, X14.3 | X14.0 |
| **X14.3** | Behavioral biometrics capture (opt-in advisory signal) | 2 days | △ (advisory not gate) | with X14.1, X14.2 | X14.0 |
| **X14.4** | Dishonor SBT (ERC-5192 invalidation receipt) | 1–2 days | △ (audit-narrative pre-req, not blocking) | with X14.1, X14.2, X14.3 | X14.0 |
| **X14.5** | Class boundary regression suite + integration tests | 1–2 days | ✓ | — (closure) | X14.0–X14.4 |

**Total: ~7–14 days.** Lower bound assumes X14.1+X14.2+X14.3+X14.4 run in
parallel after X14.0. Upper bound assumes serial execution.

Velocity calibration: applies the parallel-agent + founder-direction
multiplier per CR1 SYNTHESIS §6.5 (binding). Traditional team estimate would
be 2–3× longer = ~15–35 days. For founder review.

---

## 4. Per-sub-sprint scope + lock + paste-ready prompts

Each sub-sprint follows the VTP discipline pattern (v1.4 §3.14): pre-flight
verification gates, explicit scope freeze, lock criteria, and dependency
statement. Prompts are paste-ready into a fresh Claude Code session.

---

### 4.1 X14.0 — Tournament class declaration + schema + T1+ plausibility lift

**Scope freeze:**
- Forward migration adds `tournament_class` enum + columns to
  `v2_tournaments` (declared at create time by sponsor) and `is_agent` /
  `class_tag` to `v2_tournament_entries` + `v2_tournament_solo_runs` +
  `v2_duels`.
- Sponsor-app UI exposes the class declaration as a required field on
  create-tournament form (default = `mixed-declared` to preserve current
  behavior).
- Backend submit handlers read auth surface (SIWA ⇒ `is_agent=true`, SIWB ⇒
  `is_agent=false`) and persist `class_tag` on every submission.
- `/v1/scores` T1+ returns 200 (not 501) for SIWA-authed agent submissions
  on `agent-only` + `mixed-declared` tournaments; returns 403 with
  `class_mismatch` on `human-only` tournaments.
- Cron settle reads `class_tag` from entries and excludes class-mismatched
  rows from rank calculation (does NOT call `flagScore` on the contract —
  exclusion stays off-chain, audit-trail in `excluded_reason='class_mismatch'`).
- Class-mismatch is **deterministic** (auth surface + tournament declaration);
  no model call, no biometric.

**Lock criteria:**
- Migration applied to `clizuqvtkekzxiflbsyr` (single-project per memory).
- New columns reflected in `packages/duel-backend` type definitions.
- Sponsor-app create flow E2E-tested for all three class declarations.
- `/v1/scores` T1+ contract test: SIWA submit on `agent-only` → 200; SIWA
  submit on `human-only` → 403 `class_mismatch`.
- Cron settle excludes class-mismatched entries on staging fixture.
- Domain neutrality preserved: no `gamer-only` semantics; all new identifiers
  use `participant` / `class` / `submission` per §2.4.

**Effort:** 2–3 days (founder velocity).

**Dependencies:** none (foundational).

**Paste-ready prompt:**

```markdown
# X14.0 — Tournament class declaration + schema + T1+ plausibility lift

You are running X14 sub-sprint 0. Implementation sprint per Phase 1 wrap
Cluster 1.

## Pre-flight verification (mandatory — VTP per v1.4 §3.14)

Assumptions this prompt makes (verify before action):
1. `v2_tournaments` has no `tournament_class` column on prod
   (clizuqvtkekzxiflbsyr) — verify via Supabase MCP `list_tables` or
   `select column_name from information_schema.columns where table_name =
   'v2_tournaments'`.
2. `v2_tournament_entries` / `v2_tournament_solo_runs` / `v2_duels` have
   no `is_agent` / `class_tag` columns — same verification command.
3. `/v1/scores` T1+ returns 501 today (per memory
   `project_phase2_mainnet_blocker_plausibility.md`) — verify via
   `curl -X POST https://api.skillos.network/v1/scores ...`.
4. CR1 R4 §9.1, §9.2 still flag IM-48 as open — verify
   `docs/codebase-reality-pass1/SYNTHESIS.md` is unchanged on origin/main.
5. Single Supabase project — no staging — per memory
   `project_skillos_no_staging_supabase`. Verify via `vercel env ls` on
   apps/api or the canonical apex env list.

If any verify fails → STOP and surface mismatch.

## Worktree setup

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x14-0 -b sprint/x14-0-tournament-class origin/main
cd ../MAS-x14-0

## Scope freeze (do not exceed)

DO:
1. Write forward migration `supabase/migrations/v2_<DATE>_x14_class.sql`:
   - `v2_tournaments`: add `tournament_class text not null default
     'mixed-declared' check (tournament_class in ('human-only', 'agent-only',
     'mixed-declared'))`.
   - `v2_tournament_entries`: add `is_agent boolean not null default false`
     + `class_tag text` (NULL allowed for legacy rows).
   - `v2_tournament_solo_runs`: same two columns.
   - `v2_duels`: add `player1_class text` + `player2_class text` (both
     nullable for legacy).
   - Forward-only, idempotent (IF NOT EXISTS pattern matching existing
     migrations).
   - No backfill of historical rows — `class_tag IS NULL` means "Phase 1
     pre-X14, treat as `mixed-declared`".
2. Update `packages/duel-backend` + `apps/api` Supabase type generation
   (`generate-types` script or equivalent — if circular dep with `packages/sdk`
   per memory `project_packages_sdk_circular_build_dep`, scope this to a
   typecheck-only update and queue a follow-up issue for the codegen fix).
3. Update sponsor-app create-tournament UI:
   - Required radio-group: human-only / agent-only / mixed-declared.
   - Default selection = mixed-declared.
   - Copy: "Class enforcement preview. Agent participation is a class, not a
     feature flag — declared class is the substrate's honesty layer."
4. Update backend submit handlers:
   - `apps/api/src/routes/scores.ts` (T1+ branch): read SIWA auth → set
     `is_agent=true`, `class_tag='agent'`; read tournament's
     `tournament_class`; if mismatch → 403 `class_mismatch`.
   - `packages/duel-backend/src/api/tournaments/solo.ts`: same logic for
     human SIWB session path → `is_agent=false`, `class_tag='human'`.
   - `packages/duel-backend/src/duel/handlers.ts`: derive class from each
     submitter's auth surface and persist `playerN_class`.
5. Update `packages/duel-backend/src/cron/tournaments.ts` settle path:
   - Skip ranking contribution from entries where
     `tournament_class='human-only' AND is_agent=true` (or symmetric for
     agent-only). Set `excluded=true, excluded_reason='class_mismatch'`.
   - Do NOT call `flagScore` for class-mismatch — exclusion is off-chain
     audit only (preserves CLAUDE.md invariant #3 + v1.4 §3.13 "no
     irreversible LLM verdicts on-chain" extended to "no irreversible
     class verdicts on-chain via flagScore"; class is declared, not LLM).
6. Lift `/v1/scores` T1+ to 200 for `agent-only`/`mixed-declared` SIWA
   submits. Keep 403 `class_mismatch` for human-only.

DON'T:
- Touch contract layer (X14 stays off-chain enforcement; X11 owns v2.2
  contract work).
- Backfill historical rows (forward-only).
- Add extension whitelist, AI browser detect, biometrics, or dishonor SBT
  (X14.1–X14.4 own those scopes).
- Use `gamer-only` semantics anywhere — preserve §2.4 neutrality.

## Lock criteria

- [ ] Migration applied to clizuqvtkekzxiflbsyr; `list_migrations`
      reflects new file.
- [ ] All four tables have the new columns (verified via REST API
      column query + `information_schema`).
- [ ] Sponsor-app create flow E2E tested on staging deploy URL.
- [ ] `/v1/scores` T1+ contract test: SIWA on agent-only → 200; SIWA on
      human-only → 403 with `code: 'class_mismatch'`.
- [ ] Cron settle excludes mismatched entries on fixture row (assert via
      unit test on `runSettleTournaments`).
- [ ] Pre-push CI-parity check (per memory
      `reference_pre_push_ci_parity_check`): nuke + npm ci + lint +
      typecheck + test-ts all green.
- [ ] PR description references this scoping doc + CR1 IM-48, MB-9.
- [ ] Memory updated: project_x14_0_class_schema (canonical column names,
      migration date, T1+ lift confirmation).

## Effort

2–3 days founder velocity calibrated. STOP at any blocker rather than
push partial.

## Dependencies

None (foundational).
```

---

### 4.2 X14.1 — Extension whitelist (Web3 wallets only on human-only)

**Scope freeze:**
- Client-side: at SIWB sign-in time on `human-only` tournaments, fingerprint
  the browser's installed extensions via `navigator.userAgentData` + the
  detectable subset of `window.ethereum.providers` and known extension global
  hooks.
- Whitelist: Base Account, MetaMask, Rabby, Coinbase Wallet (founder-locked
  list; see open question Q-3).
- Block list (advisory only): any extension exposing a window-level helper
  named like AI-augmented browsers — see X14.2 for the model detection.
- Behavior: if non-whitelisted extension detected on a `human-only` tournament,
  show a soft warning modal + tournament participation is gated until
  acknowledged or extension disabled.
- Server-side: SIWB sign-in includes a self-attestation header
  `X-Extension-Profile: <hash>`; server logs but does not enforce (Phase 1
  advisory only).

**Lock criteria:**
- Client whitelist hardcoded in `packages/lib-shared/src/extension-whitelist.ts`.
- Sponsor-app create flow renders the whitelist for sponsor preview.
- Soft warning modal E2E-tested on `human-only` tournament + non-whitelisted
  extension installed.
- Server log surface visible via Supabase log query.
- Domain neutrality preserved: copy uses "participants" / "session" framing.

**Effort:** 1–2 days.

**Dependencies:** X14.0 (`tournament_class` column readable client-side).

**Paste-ready prompt:**

```markdown
# X14.1 — Extension whitelist (Web3 wallets only on human-only tournaments)

You are running X14 sub-sprint 1. Implementation sprint per Phase 1 wrap
Cluster 1.

## Pre-flight verification (mandatory — VTP per v1.4 §3.14)

1. X14.0 is merged + deployed — verify via `vercel ls | head -3` for
   apps/api + sponsor + main game subdomains; verify migration via
   Supabase MCP `list_migrations`.
2. `tournament_class` column is readable from client via tournament
   metadata endpoint — verify via `curl /api/tournaments/<id>` from
   one of the six game apps.
3. No extension whitelist exists yet — verify
   `grep -rn 'extension.whitelist\|extensionAllowlist' apps/ packages/
   --include='*.ts' --include='*.tsx'` returns nothing.

If any verify fails → STOP.

## Worktree setup

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x14-1 -b sprint/x14-1-extension-whitelist origin/main
cd ../MAS-x14-1

## Scope freeze

DO:
1. Add `packages/lib-shared/src/extension-whitelist.ts`:
   - Exports `WEB3_EXTENSION_WHITELIST` (Base Account, MetaMask, Rabby,
     Coinbase Wallet) — founder-locked, see scoping doc Q-3.
   - Exports `detectInstalledExtensions(): { name, fingerprint, whitelisted }[]`.
   - Detection methods: `window.ethereum.providers[]` (EIP-6963), known
     extension global hooks (MetaMask, Rabby), userAgentData entropy.
2. Update SIWB sign-in flow in each game app + apps/api:
   - On `human-only` tournament, run `detectInstalledExtensions()` before
     SIWB sign call.
   - If non-whitelisted detected, show `<ExtensionWarningModal />` (new in
     `packages/ui/src/`).
   - User can dismiss → submit `X-Extension-Profile` header
     (sha256(JSON.stringify(detected))) with sign-in request.
3. Backend logs the header for audit but does not enforce in X14.1
   (advisory only; enforcement deferred to post-mainnet review based on
   data collected).
4. Sponsor-app create-tournament page renders the current whitelist (read
   from same constant) so sponsors know what their `human-only` declaration
   gates.

DON'T:
- Block submission on extension detection — soft warning only (per
  founder discussion, see Q-7 in scoping doc).
- Add AI-browser detection here (X14.2 owns that).
- Add server-side enforcement gate — log only.
- Use `wallet-only` semantics in copy (§2.4: use "extension" or
  "browser-extension").

## Lock criteria

- [ ] Whitelist constant exported + consumed in both game-app SIWB flow +
      sponsor-app preview.
- [ ] `<ExtensionWarningModal />` E2E-tested on a `human-only` fixture
      tournament.
- [ ] `X-Extension-Profile` header visible in Supabase log query for at
      least one test sign-in.
- [ ] Sponsor-app preview shows current whitelist (matches constant).
- [ ] Pre-push CI-parity check green.
- [ ] PR references this scoping doc + Q-3 founder decision.
- [ ] Memory updated: project_x14_1_extension_whitelist (canonical list,
      detection method, advisory-only status).

## Effort

1–2 days.

## Dependencies

X14.0 (`tournament_class` readable from tournament endpoint).
```

---

### 4.3 X14.2 — AI browser detection (Comet / Atlas / Antigravity / Claude-in-Chrome)

**Scope freeze:**
- Detect AI-augmented browsers via combination of `navigator.userAgent`,
  `userAgentData`, and known JS-level fingerprints (e.g. Comet exposes a
  specific window-level identifier; Claude-in-Chrome publishes a manifest
  signature).
- Detection runs at the same point as X14.1 (SIWB sign-in).
- Behavior on `human-only` tournament + AI browser detected: hard-block
  with explanation modal (these are deterministic browser-level signals,
  not behavioral inference, so hard-block is defensible).
- Behavior on `agent-only` tournament + AI browser detected: allow with
  log (this is the intended path for agents using browser-augmented
  surfaces).
- Behavior on `mixed-declared`: allow, log only.
- Maintain detection signatures in `packages/lib-shared/src/ai-browser-detect.ts`
  as a versioned constant — founder can extend the list without sprint
  rerun.

**Lock criteria:**
- Detection signatures committed for Comet (v0+), Atlas (researched + TBC),
  Antigravity (researched + TBC), Claude-in-Chrome (manifest fingerprint).
- Hard-block E2E-tested on `human-only` tournament when one of the four
  is detected.
- Allow-with-log E2E-tested on `agent-only` tournament with same browser.
- Detection signature update process documented in
  `docs/runbooks/x14-ai-browser-signatures.md`.
- Domain neutrality preserved.

**Effort:** 1–2 days.

**Dependencies:** X14.0.

**Paste-ready prompt:**

```markdown
# X14.2 — AI browser detection (Comet / Atlas / Antigravity / Claude-in-Chrome)

You are running X14 sub-sprint 2. Implementation sprint per Phase 1 wrap
Cluster 1.

## Pre-flight verification (mandatory — VTP per v1.4 §3.14)

1. X14.0 merged + deployed. Verify per X14.1 pre-flight pattern.
2. No AI browser detection exists — verify
   `grep -in 'comet\|atlas\|antigravity\|claude-in-chrome' apps/ packages/
   --include='*.ts' --include='*.tsx'` returns nothing (excluding the wordle
   answer list which contains 'comet' / 'atlas' as legitimate 5-letter
   words — exclude `apps/wordle/src/lib/wordle/data/`).
3. Reference signature inventory (founder-supplied or research-derived):
   confirm via Q-5 founder decision in scoping doc whether to use
   research-derived signatures or wait for founder-supplied list.

If any verify fails → STOP.

## Worktree setup

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x14-2 -b sprint/x14-2-ai-browser-detect origin/main
cd ../MAS-x14-2

## Scope freeze

DO:
1. `packages/lib-shared/src/ai-browser-detect.ts`:
   - Exports `AI_BROWSER_SIGNATURES` (versioned constant with name +
     detection method per browser).
   - Exports `detectAIBrowser(): { name, signature, confidence } | null`.
   - Detection: combine userAgent regex + window-global probe + (where
     available) WebExtension manifest fingerprint.
2. SIWB sign-in flow integration (parallel hook to X14.1's
   `detectInstalledExtensions`):
   - On `human-only` tournament + AI browser detected → hard block,
     `<AIBrowserBlockModal />` explains class declaration + suggests
     `agent-only` or `mixed-declared` tournaments where appropriate.
   - On `agent-only` tournament + AI browser detected → allow, log.
   - On `mixed-declared` → allow, log.
3. Server-side: backend logs detection result but does not redundantly
   enforce (client-side hard-block on `human-only` is sufficient for X14.2;
   server-side double-check deferred to X14.5 regression suite).
4. `docs/runbooks/x14-ai-browser-signatures.md`:
   - Documents how to add a new AI browser to the detection list.
   - Documents the founder-decision process for adding a browser to
     "hard-block on human-only" vs "allow with log".

DON'T:
- Block on `mixed-declared` or `agent-only` — those are valid paths.
- Use AI heuristics to detect AI browsers (must stay deterministic per
  v1.4 §3.13 Option F).
- Bundle behavioral biometrics here (X14.3).

## Lock criteria

- [ ] Detection signatures committed for all four browsers (researched
      or founder-supplied per Q-5).
- [ ] Hard-block + allow-with-log paths E2E-tested.
- [ ] Runbook page committed.
- [ ] Pre-push CI-parity green.
- [ ] Memory updated: project_x14_2_ai_browser_detect (signature list
      version, detection method, hard-block scope).

## Effort

1–2 days.

## Dependencies

X14.0.
```

---

### 4.4 X14.3 — Behavioral biometrics capture (opt-in advisory signal)

**Scope freeze:**
- Client capture: pointermove cadence + keydown timing aggregated into a
  ~256-byte fingerprint blob during gameplay.
- Storage: blob persisted to `v2_tournament_solo_runs.biometric_blob`
  (new bytea column) and `v2_duels.player1_biometric_blob` /
  `player2_biometric_blob`.
- Opt-in: tournament-scoped (sponsor opts in at create time on `human-only`
  / `mixed-declared`). Default = off.
- Advisory only: blob is collected for offline analysis + plausibility
  input. NO online gate (per v1.4 §3.13 "deterministic primary").
- Privacy: blob is one-way; no re-identification across tournaments
  without server-side join (which itself is gated behind founder/dev tool
  access).

**Lock criteria:**
- Schema migration applied with new columns + opt-in flag on
  `v2_tournaments.collect_biometrics`.
- Client capture wired in 2048 + one other game app (proof-of-pattern;
  remaining apps inherit in X14.5).
- Blob aggregation E2E-tested in dev tools query.
- Privacy disclosure visible in sponsor-app create flow + game-app
  tournament join modal.

**Effort:** 2 days.

**Dependencies:** X14.0.

**Paste-ready prompt:**

```markdown
# X14.3 — Behavioral biometrics capture (opt-in advisory signal)

You are running X14 sub-sprint 3. Implementation sprint per Phase 1 wrap
Cluster 1.

## Pre-flight verification (mandatory — VTP per v1.4 §3.14)

1. X14.0 merged + deployed.
2. No biometric capture exists — verify
   `grep -rn 'biometric\|pointermove\|keydown.*cadence' apps/ packages/
   --include='*.ts' --include='*.tsx'` returns nothing relevant.
3. Privacy disclosure boilerplate decision is made (Q-9 in scoping doc).

If any verify fails → STOP.

## Worktree setup

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x14-3 -b sprint/x14-3-biometrics origin/main
cd ../MAS-x14-3

## Scope freeze

DO:
1. Migration `supabase/migrations/v2_<DATE>_x14_biometrics.sql`:
   - `v2_tournaments`: add `collect_biometrics boolean not null default false`.
   - `v2_tournament_solo_runs`: add `biometric_blob bytea`.
   - `v2_duels`: add `player1_biometric_blob bytea` + `player2_biometric_blob
     bytea`.
   - All forward-only.
2. `packages/lib-shared/src/biometric-capture.ts`:
   - Hook `useBiometricCapture(enabled: boolean): { blob: Uint8Array | null }`.
   - Captures pointermove cadence + keydown timing.
   - Aggregates to fixed-size (≤ 256 bytes) blob using deterministic
     summary (histograms, percentiles).
   - Tournament-scoped: clears on tournament transition.
3. Wire into 2048 + ONE other game (founder picks via Q-10; default =
   wordle to maximize keyboard signal coverage).
4. Sponsor-app create flow: opt-in checkbox + privacy-disclosure copy.
5. Tournament join modal in game apps: privacy notice if `collect_biometrics`
   is on (user can decline → blob stays null, submission still allowed).

DON'T:
- Wire all six game apps in X14.3 — that's X14.5 closure.
- Re-identify users across tournaments (no cross-tournament join in
  X14.3; gated dev-tool query only).
- Use blob as direct gate — advisory only (v1.4 §3.13 lock).

## Lock criteria

- [ ] Migration applied.
- [ ] Schema columns visible.
- [ ] Capture wired in 2048 + 1 other game; blobs present in
      `v2_tournament_solo_runs` after E2E submit.
- [ ] Privacy disclosure visible in sponsor + game-app modals.
- [ ] Pre-push CI-parity green.
- [ ] Memory updated: project_x14_3_biometrics (blob size, capture
      vectors, opt-in scope, advisory status).

## Effort

2 days.

## Dependencies

X14.0.
```

---

### 4.5 X14.4 — Dishonor SBT (ERC-5192 invalidation receipt)

**Scope freeze:**
- New contract `DishonorSBT.sol` implementing ERC-5192 (soulbound, non-
  transferable token).
- Minted by `STUDIO_PRIVATE_KEY` cron broadcaster to wallets where settle
  excluded them with `excluded_reason='class_mismatch'`.
- Metadata: tournament_id (off-chain id, not on-chain bytes32), violation
  type (`class_mismatch` / `extension_violation` / `ai_browser_on_human_only`),
  timestamp.
- Read-only audit trail. No protocol logic depends on dishonor SBT count
  (Phase 1; future sprint could gate participation behind threshold).
- ERC-8021 attribution receipt encoder reused per memory
  `project_erc8021_encoder_spec_compliance` if applicable; otherwise minimal
  metadata.

**Lock criteria:**
- Contract deployed to Base Sepolia + verified on Blockscout.
- Cron settle path mints on class-mismatch exclusion.
- Existing tournament fixture exercises the mint path E2E.
- Audit trail visible via Etherscan / Blockscout token holder query.
- Memory `reference_skillos_provider_per_app_pattern` checked for any
  per-app integration touchpoint (likely none — dishonor SBT is read-only).

**Effort:** 1–2 days.

**Dependencies:** X14.0 (`excluded_reason='class_mismatch'` populated by
cron) + Foundry dual-profile awareness (X19a.2; pick `[profile.default]`
since this is Phase 2 contract per memory).

**Paste-ready prompt:**

```markdown
# X14.4 — Dishonor SBT (ERC-5192 invalidation receipt)

You are running X14 sub-sprint 4. Implementation sprint per Phase 1 wrap
Cluster 1.

## Pre-flight verification (mandatory — VTP per v1.4 §3.14)

1. X14.0 merged + deployed; cron settle is excluding class-mismatched
   entries — verify by running a fixture tournament with mixed class on
   staging.
2. Foundry dual-profile per ADR-0002 (memory
   `project_foundry_dual_profile_phase1_legacy`): X14.4 contract is Phase
   2 lineage → use `[profile.default]` (via_ir=true).
3. STUDIO_PRIVATE_KEY broadcaster role per memory
   `project_x15_agent_wallet_split` — adding mint authority does NOT
   require separate wallet (read-only audit SBT, no value-transfer risk).
4. ERC-5192 reference: https://eips.ethereum.org/EIPS/eip-5192 (soulbound,
   non-transferable).

If any verify fails → STOP.

## Worktree setup

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x14-4 -b sprint/x14-4-dishonor-sbt origin/main
cd ../MAS-x14-4

## Scope freeze

DO:
1. `contracts/src/DishonorSBT.sol`:
   - ERC-5192 minimal implementation (ERC-721 base + locked transfer).
   - Mint owner: STUDIO_PRIVATE_KEY (matches existing cron broadcaster
     pattern per CLAUDE.md invariant #6).
   - Metadata struct: `{ tournamentId, violationType, timestamp }`.
   - Foundry tests covering: mint, locked (non-transferable), metadata
     read.
2. Deploy script `contracts/script/DeployDishonorSBT.s.sol`:
   - Deploys + writes address to `contracts/deployments/base-sepolia.json`.
   - Records canonical address in `deployments/wallets-base-sepolia.md`
     per memory `project_x19b_fee_vault_separated` pattern.
3. Verify on Blockscout (Foundry dual-profile per X19a.2):
   - Use `[profile.default]` with via_ir=true.
   - `compiler_settings` check per memory
     `reference_blockscout_verify_diagnosis_playbook`.
4. Update `packages/contracts/src/abi.ts` to export `DishonorSBT` ABI +
   address.
5. Update `packages/duel-backend/src/cron/tournaments.ts`:
   - After setting `excluded=true, excluded_reason='class_mismatch'`,
     `writeContract({ functionName: 'mint', args: [playerAddress,
     violationType, ...] })`.
   - Failure is non-fatal (log only) — dishonor mint is advisory, not a
     settle blocker.

DON'T:
- Mint dishonor for `excluded_reason` other than `class_mismatch` in X14.4
  (extension_violation + ai_browser_on_human_only are X14.5 wave 2).
- Add token-gated participation logic (Phase 1; future sprint).
- Use ERC-8021 encoder unless Q-11 founder decision is YES.

## Lock criteria

- [ ] Contract deployed + verified on Blockscout.
- [ ] Foundry tests green on `[profile.default]`.
- [ ] Address recorded in deployments/wallets-base-sepolia.md.
- [ ] Cron settle mints dishonor on a fixture class-mismatch exclusion
      (verified via Blockscout token holder query).
- [ ] Pre-push CI-parity green.
- [ ] Memory updated: project_x14_4_dishonor_sbt (contract address,
      lineage = Phase 2 default profile, mint authority = STUDIO).

## Effort

1–2 days.

## Dependencies

X14.0 (`class_mismatch` exclusion populated).
```

---

### 4.6 X14.5 — Class boundary regression suite + integration tests

**Scope freeze:**
- Un-skip + extend `settle-guard.integration.test.ts` to cover class
  boundary invariants (mainnet readiness gate).
- Add new integration tests for each sub-sprint deliverable: schema
  invariants (X14.0), extension whitelist soft-warn (X14.1), AI browser
  hard-block (X14.2), biometric capture opt-in (X14.3), dishonor SBT
  mint (X14.4).
- Wire biometric capture into the remaining four game apps (closure of
  X14.3's "2 of 6 games" partial scope).
- Document the X14 audit-firm packet:
  `docs/audit-prep/x14-class-fairness-summary.md` aligned with v1.4
  §3.13 disclosure paragraph.

**Lock criteria:**
- `settle-guard.integration.test.ts` un-skipped + extended; passes locally
  + in CI (CI gate added per CLAUDE.md Phase 2 transition discipline).
- Per-sub-sprint integration test added; all green.
- Biometric capture present in all 6 game apps + sponsor (sponsor has no
  gameplay → only consent UI).
- Audit-firm packet doc committed.

**Effort:** 1–2 days.

**Dependencies:** X14.0–X14.4 all merged.

**Paste-ready prompt:**

```markdown
# X14.5 — Class boundary regression suite + integration tests

You are running X14 sub-sprint 5. Implementation sprint per Phase 1 wrap
Cluster 1 closure.

## Pre-flight verification (mandatory — VTP per v1.4 §3.14)

1. X14.0 through X14.4 all merged to origin/main + deployed — verify each
   via `git log --oneline origin/main | head -20` looking for sub-sprint
   PR squash commits.
2. `settle-guard.integration.test.ts` is currently skipped — verify
   `grep -n 'it.skip\|describe.skip' packages/duel-backend/src/**/*.test.ts`.
3. CI workflow exists (or is added in P2-Pre transition) — verify
   `.github/workflows/` directory state per memory
   `project_claudemd_nextjs_version_stale` Phase 2 transition.

If any verify fails → STOP.

## Worktree setup

cd /Users/inancayvaz/MAS
git fetch origin
git worktree add ../MAS-x14-5 -b sprint/x14-5-regression-suite origin/main
cd ../MAS-x14-5

## Scope freeze

DO:
1. Un-skip + extend `settle-guard.integration.test.ts`:
   - Cover class boundary: human-only with agent submit → 403 +
     dishonor mint.
   - Cover agent-only with human submit → 403 + dishonor mint.
   - Cover mixed-declared with both classes → both ranked, no dishonor.
2. Add per-sub-sprint integration tests:
   - `tests/integration/x14-0-class-schema.test.ts`
   - `tests/integration/x14-1-extension-whitelist.test.ts`
   - `tests/integration/x14-2-ai-browser-detect.test.ts`
   - `tests/integration/x14-3-biometrics-capture.test.ts`
   - `tests/integration/x14-4-dishonor-sbt.test.ts`
3. Wire biometric capture into remaining game apps (the 4 not covered by
   X14.3) following the X14.3 pattern.
4. Document audit-firm packet:
   `docs/audit-prep/x14-class-fairness-summary.md`:
   - One-paragraph summary aligned with v1.4 §3.13 disclosure.
   - Sub-sprint table (X14.0–X14.4) with PR numbers + commit SHAs.
   - Migration list + canonical addresses (dishonor SBT, etc).
   - Known limitations (e.g. behavioral biometrics advisory only; AI
     browser signature list is versioned + extensible).

DON'T:
- Add new product features (closure only).
- Touch contract layer (X14.4 is the only contract; X14.5 tests it,
  doesn't extend it).

## Lock criteria

- [ ] All integration tests green locally + CI.
- [ ] All six game apps + sponsor have biometric consent UI.
- [ ] Audit-firm packet doc committed + reviewed by founder.
- [ ] Pre-push CI-parity green.
- [ ] X14 sprint closeout memo committed:
      `docs/sprints/x14-class-fairness/CLOSEOUT.md`.
- [ ] Memory updated: project_x14_complete (six sub-sprint PRs, total
      effort vs estimate, audit-firm packet reference).

## Effort

1–2 days.

## Dependencies

X14.0–X14.4 all merged.
```

---

## 5. Cross-sub-sprint scheduling

```
                     │ Day 0 │ Day 1 │ Day 2 │ Day 3 │ Day 4 │ Day 5 │ Day 6 │ Day 7-14
─────────────────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┼───────────
X14.0 (schema+lift)  │ ███   │ ███   │ ███   │       │       │       │       │
X14.1 (whitelist)    │       │       │       │ ███   │ ███   │       │       │
X14.2 (AI browser)   │       │       │       │ ███   │ ███   │       │       │
X14.3 (biometrics)   │       │       │       │ ███   │ ███   │ ███   │       │
X14.4 (dishonor SBT) │       │       │       │ ███   │ ███   │       │       │
X14.5 (regression)   │       │       │       │       │       │       │ ███   │ ███
```

Best-case parallel (X14.1+X14.2+X14.3+X14.4 simultaneous after X14.0):
~7 days. Serial: ~14 days. Founder calibration choice on parallelism
depends on agent-bandwidth availability (Q-12).

Cross-cluster: X14 runs parallel with X20 AntiCheat rebuild (per CR1
SYNTHESIS §6.1). X14.0 must land before X20.0 (formula bounds differ per
class).

---

## 6. Open questions (founder decisions queued)

Each marks a real decision that materially shapes scope. Surfaced rather
than pre-resolved per scoping-only constraint.

| # | Decision | Context | Default if no decision | Affects |
|---|---|---|---|---|
| Q-1 | `mixed-declared` default behavior — treat as opt-in for agents (sponsors must change to `agent-only` for explicit agent participation) OR opt-out (agents always allowed unless sponsor picks `human-only`)? | CLAUDE.md invariant #3 says "agent participation is a class, not a feature flag" — suggests opt-out. v1.3 §2.5 framing of "honest declaration" suggests opt-in. | Opt-out (CLAUDE.md invariant prevails) | X14.0 sponsor UI default copy |
| Q-2 | `class_tag` column granularity — boolean `is_agent` only, OR text enum `human` / `agent` / `agent-paired` / `human-assisted`? | Founder lock per v1.4 §3.13 says "class enforcement" — granularity is open. Mixed-declared tournaments may want to distinguish "agent with human pair-prog" later. | Boolean `is_agent` + text `class_tag` (both for forward optionality) | X14.0 schema + downstream filters |
| Q-3 | Extension whitelist canonical list — Base Account / MetaMask / Rabby / Coinbase Wallet, OR broader (Brave Wallet, Trust Wallet, Phantom-EVM)? | Whitelist locks who is allowed on `human-only`. Trade-off: tighter list = fewer false negatives; broader list = better UX. | Tighter four (per X14.1 default) | X14.1 client lib |
| Q-4 | Extension-violation behavior on `human-only` — soft warning (X14.1 default) OR hard block? | v1.3 §2.5 doesn't specify. Soft warning is safer for false positives (legitimate wallets misdetected). Hard block is more defensible. | Soft warning + log (advisory) | X14.1 modal UX |
| Q-5 | AI browser signature source — research-derived (X14.2 prompt does the research) OR founder-supplied? | Founder may have explicit fingerprint list from internal research; otherwise X14.2 dispatches a research sub-task. | Research-derived (X14.2 self-resolves) | X14.2 detection signatures |
| Q-6 | AI browsers on `mixed-declared` — allow with log (X14.2 default) OR block with override? | Default treats `mixed-declared` as agent-permissive; AI browsers fit there. Override path adds UX friction. | Allow with log | X14.2 mixed-declared UX |
| Q-7 | Sponsor-side opt-in for biometrics — sponsors can DEMAND biometrics on `human-only` tournaments (default off), OR demand stays disabled in Phase 1? | Privacy posture: demand introduces tracking that sponsors gain visibility into; disabled keeps Phase 1 minimal. | Disabled in Phase 1 (sponsors opt in only on their own tournaments) | X14.3 sponsor UI |
| Q-8 | Biometric blob retention period — keep forever (audit trail), OR 30/90-day cycle? | GDPR / privacy: forever may violate user expectations even with consent. Cycle limits forensic depth. | 90-day rolling cycle | X14.3 storage policy + retention migration |
| Q-9 | Privacy disclosure copy — long-form (full description) OR short-form (one sentence + link to policy)? | Sponsor + game-app modals each need consent UX. Long-form is friction; short-form may not meet GDPR/CCPA requirements. | Short-form + link to policy page (apex site or skillos.network/privacy) | X14.3 consent UX |
| Q-10 | Second game-app for X14.3 biometric pilot — wordle (default, keyboard signal) OR sudoku (pointermove + tap signal mix)? | X14.3 pilot needs 2 games to test cross-input-type capture. Default = wordle for keyboard coverage. | Wordle | X14.3 pilot scope |
| Q-11 | Dishonor SBT — use ERC-8021 attribution receipt encoder per memory `project_erc8021_encoder_spec_compliance` OR minimal metadata? | ERC-8021 is partial-spec today (memory). Reusing keeps consistency; minimal metadata avoids the encoder's lenient/strict gap. | Minimal metadata (defer ERC-8021 reuse) | X14.4 contract metadata |
| Q-12 | Sub-sprint parallelism — run X14.1 + X14.2 + X14.3 + X14.4 in parallel (best-case 7d), OR serialize (14d) for solo-founder bandwidth? | Velocity vs review-quality trade. Parallel agents = faster but more review surface. Serial = slower but each sub-sprint gets full attention. | Two-at-a-time (X14.1+X14.2 wave, then X14.3+X14.4 wave) | Sprint timeline + memory candidate count |

---

## 7. Cross-references

- Architecture supplement v1.3 §2.5 — Mainnet pre-req checklist (canonical
  5-component list)
- Architecture supplement v1.4 §3.13 — X20 AntiCheat rebuild scope (strategic
  lock: deterministic primary + class enforcement; Haiku off-chain advisory)
- Architecture supplement v1.4 §3.14 — VTP discipline methodology
  (operationalizes pre-flight pattern used in each sub-sprint prompt above)
- Architecture supplement v1.2 §2.4 — Domain Neutrality Invariant
- CR1 SYNTHESIS §6.1 — Cluster 1 Phase 1 wrap sprint placement
- CR1 R4 §9.1, §9.2 — IM-48 column-absence finding
- CR1 R3 §9, §10 — class-fairness invariant encoded at contract layer
  but no live monitoring (IM-47 + IM-48)
- T5-3 verification — `docs/audit-prep/t5-3-anticheat-verification.md`
  (current AntiCheat state baseline)
- CLAUDE.md invariant #3 — "agent participation is a class, not a feature
  flag"
- Memory `project_phase2_mainnet_blocker_plausibility.md` — T1+ plausibility
  lift coupled to X14.0
- Memory `project_skillos_no_staging_supabase.md` — single-project
  migration discipline applies to each X14 sub-sprint
- Memory `reference_pre_push_ci_parity_check.md` — pre-push gate pattern
  baked into every sub-sprint lock criteria
- Memory `project_foundry_dual_profile_phase1_legacy.md` — X14.4 lineage
  = `[profile.default]` (Phase 2)
- Memory `project_x19b_fee_vault_separated.md` — canonical address
  registry pattern for X14.4 dishonor SBT deployment

---

## 8. Scope-only constraints honored

- **No implementation code.** All code samples in this doc are scoped
  prompts for future sub-sprint execution.
- **No production state changes.** Worktree was created on
  `sprint/x14-scoping-pass1` against origin/main; no migrations applied,
  no contracts deployed, no Vercel env changes.
- **VTP pre-flight gates** baked into each sub-sprint prompt.
- **Memory canonicals respected.** Every cross-reference cites an existing
  memory entry; no new canonicals invented in this scoping pass.
- **Domain neutrality preserved.** All new identifiers use `participant`,
  `class`, `submission`, `tournament_class` — no `gamer-only` semantics.
- **Open questions surfaced for founder.** 12 decisions queued in §6;
  none pre-resolved unilaterally.

---

## 9. Next step

Founder reviews this scoping doc + the 12 open questions in §6, then
dispatches X14.0 implementation via the paste-ready prompt in §4.1. X14.1
through X14.4 dispatch after X14.0 merges (parallel-able per §5 + Q-12
decision). X14.5 dispatches after the four parallel sub-sprints close.

Per CR1 SYNTHESIS §6.1 Cluster 1: X14 runs parallel with X20 AntiCheat
rebuild; both clusters close before Phase 2 entry.
