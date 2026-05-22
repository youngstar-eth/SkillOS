# Pitch Deck Refresh — Blueprint v1

**Purpose.** Slide-by-slide blueprint for the funding pitch deck refresh, aligned with the layered-positioning narrative pivot (PR #163 / commit `885619d`). This is a **transfer template** — the founder copies each slide's content + asset notes into Google Slides during the Day 6-7 Alliance DAO application package finalization.

**Status.** Internal / funding-surface only. The repo is private. This document is not public marketing.

**Narrative source-of-truth (canonical, on-disk after PR #163):**
- [`README.md`](../README.md) → `## Layered positioning` (Layer 1 / Layer 2 / Discipline)
- [`CLAUDE.md`](../CLAUDE.md) → architectural invariant #8 (self-evolving narrative restraint)
- [`docs/architecture/developer-surface.md`](architecture/developer-surface.md) → §2.4 (L1 tagline amended, L2 named category, L3 vertical expansion internal-only)
- claude.ai Project Knowledge → *Strategic Memory (May 2026, Pivot)* (founder-held; not retrievable from this repo)

---

## Discipline guardrails (apply to EVERY slide)

These are non-negotiable and were checked against each slide below:

- [ ] **No token-economic claims** — no token price, supply, buyback, yield, or "holders benefit" language anywhere.
- [ ] **No valuation language** — no implied or projected company/token valuation.
- [ ] **No fixed dates for Phase 3+** — Phase 1 (done) and Phase 2 (Q3 2026 target) may carry dates; Phase 3, 4, 5 are achievement-gated, **no concrete dates**.
- [ ] **"Self-evolving" = utility framing** — describe *what the measurement infrastructure enables*, never an investment thesis.
- [ ] **Token + governance = achievement-gated optionality** — "optional, not promised," never a roadmap commitment.
- [ ] **No public future-verticals list** (§2.4 L3) — vertical expansion (coding/research/decision) is internal-only narrative; permitted in this funding deck as *optionality framing*, never as a product roadmap. Skill gaming stays the explicitly named category.
- [ ] **Skillz/Papaya = funding-pitch only** — retained in this deck; dropped from public marketing May 19, 2026. Annotate slides that use it.

---

## Slide 1 — Title

**Purpose:** Establish identity + the pivoted tagline in one breath.

**Content:**
- SkillOS logo (lockup)
- Tagline: **"Skill economy infrastructure for self-evolving agents"**
- Founder: İnanç Ayvaz (Youngstar) · Simpl3 Inc.
- Optional sub-line: Phase 1 live on Base Sepolia

**Visual/asset notes:** Clean logo lockup on dark or brand-neutral background. Tagline as the dominant text. No bullet clutter.

---

## Slide 2 — Problem

**Purpose:** Open on the trust deficit in skill measurement, using the largest fair-play fraud verdict in US history.

**Content:**
- Hook: **Skillz vs Papaya — $420M Lanham Act verdict** (April 23, 2026; largest in US history)
- The pattern: ~$4.7B in alleged fraud enabled by **operator opacity** — players couldn't verify fairness
- The industry just learned a billion-dollar lesson about **unverifiable fairness**
- Generalize: skill-measurement platforms carry a **trust deficit at the operator layer** — for humans today, for agents next

**Visual/asset notes:** One bold stat ($420M) as the focal point. Optional small timeline chip (Apr 23, 2026). Avoid logos of the litigants if rights-uncertain — use text.

**Discipline note:** ⚠️ *Funding-pitch only — Papaya stays in the deck, not in public marketing (dropped May 19).*

---

## Slide 3 — Why now (the agentic-AI moment)

**Purpose:** Frame the timing wedge — agents are proliferating, but the verification layer is missing.

**Content:**
- Agent deployment is accelerating; **tools-for-agents is crowded** (W26: 80+ startups)
- The missing layer: **capability verification / an eval substrate**
- Agents need objective skill measurement they **cannot game** + economic incentives they **cannot fake**
- SkillOS = the first **verifiable-by-design measurement layer** for agent + human skill

**Visual/asset notes:** Simple "crowded vs empty" contrast — a dense cluster (tools-for-agents) next to one open slot (verification layer) where SkillOS sits.

---

## Slide 4 — Solution (layered positioning)

**Purpose:** The core of the pivot — two simultaneous layers, gaming primary, substrate rising.

**Content:**
- **Layer 1 — Agentic gaming + verifiable tournaments (PRIMARY, 2026):**
  - 6 games shipped on Base Sepolia
  - Sponsor MVP live (permissionless prize pools, ERC-5192 soulbound receipts)
  - Third-party SDK in ~30 lines (`@skillos/sdk` + `@skillos/mcp`)
- **Layer 2 — Self-evolving agents substrate (RISING):**
  - Verifiable performance → measurable skill → provable economic value
  - Cross-class data flywheel (human + agent + mixed-declared)
  - x402 data licensing for AI labs (Phase 2 backlog)

**Visual/asset notes:** Two-tier stacked diagram. Layer 1 visually dominant (larger, foreground, "shipped" check marks); Layer 2 above/behind it as the rising horizon. Mirror the README `## Layered positioning` structure exactly.

**Discipline note:** Layer 2 stays *utility framing*. Do not list future verticals here (§2.4 L3).

---

## Slide 5 — Architecture (5-actor flow)

**Purpose:** Show the protocol shape and the safety invariants in one diagram.

**Content:**
- Flow: **Players (human + agent) → Developers → SkillOS → Sponsors → AI Labs**
- Sweepstakes-safe storage: retry-fee and prize-pool accumulators are **segregated at the storage layer**
- Pure infrastructure: **no custody, no protocol-level KYC** (sanctions oracle is the only gate)
- Class-agnostic fairness: the storage layer does not differentiate human vs agent

**Visual/asset notes:** Horizontal 5-actor flow diagram (the hero diagram of the deck). Call out the fee/prize segregation as a small inset. Reuse the README Overview 5-actor framing.

---

## Slide 6 — Why we'll win

**Purpose:** Position against the obvious comparables without picking unwinnable fights.

**Content:**
- Edge: **composition + network effects + first-mover + anti-cheat trade secrets**
- vs **Skillz:** closed Web2 iOS/Android SDK — can't pivot to verifiable on-chain fairness without a full rebuild
- vs **Unity / Roblox:** engine-agnostic distribution + monetization layer — **co-pitch, not compete**
- vs **W26 agent-infra (80 startups):** SkillOS is a **capability-verification layer**, NOT another tools-for-agents play

**Visual/asset notes:** 3-column comparison ("them / their limit / our position"). Keep the Unity/Roblox column visually "partner-colored" not "rival-colored."

---

## Slide 7 — Traction (shipped reality)

**Purpose:** Prove this is built, not slideware.

**Content:**
- **6 games live on Base Sepolia:** 2048, Wordle, Sudoku, Minesweeper, Clicker, Match3
- **Sponsor MVP** live (permissionless prize-pool funding dashboard)
- **Packages published on npm** (alpha line): `@skillos/sdk` 0.2.1, `@skillos/mcp` 0.1.0, `@skillos/cli` 0.1.0, `@skillos/skills` 0.1.0 — *GA/stable public SDK is a Phase 2 milestone*
- **8/8 Builder Code surfaces wired** (Base.dev attribution)
- **Phase 1 closed May 17, 2026** → Phase 2 discipline-first mode

**Visual/asset notes:** Grid of 6 game thumbnails + a small "live URL" strip. A "shipped" stamp motif.

**Discipline note (honest framing):**
- ✅ npm packages **verified live** on the registry at the versions above (checked May 22, 2026) — accurate to claim "on npm."
- Frame the SDK as **alpha published / GA in Phase 2**, consistent with README ("Public SDK is Phase 2"). Do not imply a stable 1.0 public SDK today.
- ⚠️ **Verify before slide transfer:** confirm the live URLs (launcher, sponsor, API) against [`README.md`](../README.md) `## Live endpoints + proof`, and confirm the "8/8 Builder Code surfaces" + "Phase 1 closed May 17" claims against current repo/ops state.

---

## Slide 8 — Roadmap (phase-aware)

**Purpose:** Show a credible path without promising what isn't earned.

**Content:**
- **Phase 1 — ✅ shipped:** testnet on Base Sepolia + audit-prep packet
- **Phase 2 — Q3 2026 mainnet target (audit-gated):** v2.2 fee splitter (on-chain 70/30) · class-aware fairness · AntiCheat rebuild (X20) · third-party audit · Cayman Foundation structuring
- **Phase 3+ — achievement-gated (no concrete date):** decentralization · dispute layer · governance
- **Phase 5 — controlled public + funding:** substrate intelligence (foundation models trained on verified measurement data) — **utility framing, NOT investment premium**

**Visual/asset notes:** Horizontal phase timeline. Phase 1 solid/checked; Phase 2 with a single soft date (Q3 2026, "audit-gated"); Phase 3+/5 explicitly **undated** and labeled "achievement-gated."

**Discipline note:** No dates on Phase 3, 4, 5. Phase 5 line must read as "what the substrate enables," never a financial claim.

---

## Slide 9 — Moat

**Purpose:** Explain why this is defensible when the components are open standards.

**Content:**
- **Composition:** built on public standards (ERC-5192 / 8021 / 8004, x402, Foundry) — components are public, **the composition is proprietary**
- **Anti-cheat trade secrets:** T1–T5 detection tier ladder
- **Cross-class data flywheel:** agent×agent + human×human + human×agent interactions — **impossible to reproduce inside closed lab evals**
- **First-mover:** the $420M Papaya lesson opens a post-Lanham window for a verifiable fair-play protocol

**Visual/asset notes:** Layered "open base / proprietary composition" stack diagram. Flywheel loop for the data-flywheel bullet.

**Discipline note:** ⚠️ *Papaya reference = funding-pitch only.*

---

## Slide 10 — Team

**Purpose:** Convert solo-founder risk into a disciplined-execution story.

**Content:**
- Solo founder: İnanç Ayvaz (Youngstar) — CS background, ~5 years Web3, architect/director experience
- **Turkey advantage:** Peak Games + Dream Games precedent (world-class gaming talent), Terminal Istanbul, April 2026 tech-startup incentives
- **Multi-agent execution model** — disciplined pre-MVP velocity; Phase 2 adds auditor + advisor + growth hire
- Evidence of rigor: pre-flight triangulation discipline + audit-prep packet artifacts

**Visual/asset notes:** Founder photo + a compact "execution discipline" proof strip. Turkey-advantage as a small callout, not a paragraph.

---

## Slide 11 — Why Alliance DAO fits

**Purpose:** Show alignment with the specific program.

**Content:**
- **ALL18 cohort** (Sept 7, 2026 start; rolling applications)
- **$500K founder-friendly terms**
- Backers (Paradigm / Multicoin / Dragonfly) align with the on-chain measurement thesis
- **Pre-MVP teams accepted** → fits SkillOS's Phase 2 mainnet-ready window

**Visual/asset notes:** Alliance logo + 3 alignment chips. Keep factual; verify cohort dates/terms before transfer.

**Discipline note:** ⚠️ *Verify before transfer:* confirm ALL18 start date, rolling-app status, and $500K terms from the current Alliance DAO source — these are external facts that change.

---

## Slide 12 — Ask + use of funds

**Purpose:** Make the specific ask and show the money goes to audit + structure + Phase 2.

**Content:**
- **Ask: $500K** (Alliance terms)
- Use of funds:
  - **$100–150K** — third-party audit (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin)
  - **$30–80K** — Cayman Foundation structuring + counsel
  - **$150–200K** — Phase 2 engineering (fee splitter + class-aware fairness + AntiCheat rebuild + mainnet redeploy)
  - **$100K** — runway + growth hire

**Visual/asset notes:** Simple use-of-funds bar or donut. Totals should reconcile to the $500K ask (note the ranges sum slightly above $500K — tighten to a single figure per line before transfer).

**Discipline note:** Frame as operating use-of-funds only. No token raise, no token allocation, no valuation.

---

## Slide 13 — Vision (Layer 2, controlled framing)

**Purpose:** Land the long-term "why this matters" without tripping any securities-framing wire.

**Content:**
- Self-evolving agents need **measurement infrastructure** they cannot game
- SkillOS is that substrate
- **Skill gaming today**; measurement *can* scale beyond gaming — **achievement-gated optionality, not a roadmap promise**
- Utility framing throughout: *"what this measurement infrastructure enables"*

**Visual/asset notes:** One quiet, confident statement slide. Minimal text. A horizon/substrate visual metaphor.

**Discipline note:** No token-economic claims, no valuation language, no future-verticals product list. This is the slide most likely to drift — keep it utility-framed and optionality-gated.

---

## Slide 14 — Appendix (optional)

**Purpose:** Depth for technical diligence; not part of the main flow.

**Content:**
- Technical architecture deep-dive (contracts, cron settlement, attestation signer)
- Builder Code economics (70/30 dev/platform split — Phase 2 on-chain enforcement)
- AntiCheat tier ladder (detection tiers + data-depth tiers)
- Operational-rigor proofs (audit-firm packet trailer)

**Visual/asset notes:** Dense reference slides, clearly marked "Appendix." Safe to omit from the live pitch and keep for follow-up.

**Discipline note:** ⚠️ *Verify before transfer:* confirm the exact AntiCheat tier labels and the fee-split mechanics against current contracts/docs rather than from memory — these have changed across sprints (X20 AntiCheat rebuild is in-flight).

---

## Cross-reference index

| Slide | Primary on-disk source |
|---|---|
| 1, 4, 13 | `README.md` `## Layered positioning`; `developer-surface.md` §2.4 (L1 tagline) |
| 5 | `README.md` `## Overview` (5-actor flow + invariants) |
| 7 | `README.md` `## Live endpoints + proof`; `packages/*/package.json`; npm registry |
| 8 | `README.md` `## Phase roadmap`; `CLAUDE.md` invariant #7 + #8 |
| 9, 13 | `CLAUDE.md` invariant #8; `developer-surface.md` §2.4 L3 |

## Open verification items (resolve before Google Slides transfer)

1. Live URLs (launcher / sponsor / API) — confirm against README `## Live endpoints + proof`.
2. "8/8 Builder Code surfaces wired" + "Phase 1 closed May 17, 2026" — confirm against current repo/ops state.
3. Alliance DAO ALL18 facts (start date, rolling apps, $500K terms) — confirm from external source.
4. Use-of-funds line items — tighten ranges so they reconcile to the $500K ask.
5. AntiCheat tier labels + fee-split mechanics — confirm against current contracts (X20 in-flight).

*Resolved during blueprint authoring:* npm publish status of `@skillos/{sdk,mcp,cli,skills}` — verified live on the registry (May 22, 2026).
