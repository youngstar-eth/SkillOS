# SkillOS — Alliance ALL18 Pitch Deck

**Submission target:** Alliance ALL18 (Wed 2026-05-27 PT / Thu 2026-05-28 Istanbul)
**Format:** 12 slides, markdown source — importable to Google Slides / Keynote, exportable to PDF
**Audience:** Alliance reviewers (crypto-native, agent-aware, technical)
**Tone:** Sober, evidence-led, no hype
**Visual sourcing:** Day 4 canonical diagrams (referenced by Diagram # — pair at slide-render time from claude.ai project memory; this markdown is the structural source-of-truth)

---

## Slide 1 — Hook

**Title (top, large):** AI companies claim. SkillOS proves. In public.

**Subtitle (smaller, below):** A verification substrate for autonomous agents — on Base, on-chain, replay-evidenced.

**Body:** *(empty — let the L1 thesis breathe; visual carries the slide)*

**Visual (centered):**
*Day 4 Diagram 1 — Substrate stack (revised "self-evolving agents" framing).*
Three horizontal bands stacked vertically:
- **Top band — Claims layer:** "AI labs publish benchmarks. Press releases. Closed evals."
- **Middle band — SkillOS verification substrate:** "Arenas. On-chain settlement. Replay anchors. ERC-8004 identity."
- **Bottom band — Self-evolving agents:** "Hermes • Claude • GPT • open-weight • bring-your-own. Same arena, same rules, same chain."

**Layout suggestion:** Title centered, large. Subtitle directly below in lighter weight. Diagram fills the lower 60% of the slide. No bullets — this slide is positional, not informational.

---

## Slide 2 — Problem

**Title:** AI capability measurement is broken.

**Bullets (left half):**
- **FAccT 2025 (ACM Conference on Fairness, Accountability, Transparency):** benchmark contamination, lab-controlled evals, irreproducible claims.
- **EU JRC (Joint Research Centre) 2025:** "AI capability claims are not independently verifiable at scale."
- **Stanford HAI AI Index 2025:** evaluation methodology heterogeneity makes cross-model comparison structurally unsound.
- **The pattern:** every frontier lab grades its own homework. No public substrate to settle the question.
- **Cost of the gap:** investor decisions, regulatory frameworks, and developer trust all hinge on numbers no third party can replay.

**Visual (right half):** Three logos / icons stacked vertically — FAccT, EU JRC, Stanford HAI — with one-line citation under each. (No chart; the citations *are* the visual.)

**Layout suggestion:** Title at top. Bullets left 55%, citations stack right 35%, 10% margin.

---

## Slide 3 — Solution

**Title:** SkillOS — the verification layer Base ecosystem is missing.

**Bullets:**
- **L3 thesis:** SkillOS is a permissionless arena where agents prove capability through head-to-head play, settled on Base, replay-anchored on-chain.
- **What we are:** verification substrate. Not a marketplace. Not a benchmark suite. Not a leaderboard.
- **What we ship today:** 6 game arenas live on Base Sepolia, agent-or-human submission, on-chain tournament settlement, ERC-8004 agent identity, x402 agent-paid retries.
- **What this unlocks:** public capability claims that any third party can replay end-to-end — closed labs publish; SkillOS publishes on-chain.
- **Where we sit:** the verification gap below `/agents` (Base ecosystem) and adjacent to open-weight model releases (Hermes/Nous).

**Visual (right half):** *Day 4 Diagram 4 — Base ecosystem position.*
Concentric / layered diagram:
- Outer ring: Base ecosystem partners (Coinbase, Aerodrome, Farcaster, /agents).
- Inner gap (highlighted): "Verification layer — capability claims, replay anchors, on-chain settlement."
- SkillOS logo / marker placed inside the gap.

**Layout suggestion:** Title at top. Bullets left 50%, diagram right 50%. Highlight the "gap" ring with a contrasting color.

---

## Slide 4 — Architecture

**Title:** Verification substrate — 5 primitives.

**Bullets:**
- **Arena.** Deterministic skill engines (Match3, 2048, Wordle, Sudoku, Minesweeper, Clicker). Same seed → same board → same scoring.
- **Identity.** ERC-8004 agent registry (canonical `0x8004…`). One agent → one on-chain identity → all attestations bind to it.
- **Settlement.** `TournamentPool` v2.1 on Base Sepolia. Non-custodial. Prize pool and fee accumulators on disjoint storage slots (sweepstakes-safety invariant).
- **Attribution.** ERC-8021 `dataSuffix` Builder Code (`bc_o6szuvg1` per game). Every on-chain action is machine-attributable to its tooling stack.
- **Sponsorship.** `SponsorshipModule` + `SponsorReceiptSBT`. Permissionless prize-pool funding from any wallet. Soulbound receipts.

**Visual (right half):** *Day 4 Diagram 8 — Verification substrate (Pixie variant).*
Five circles arranged in a pentagon, labeled Arena / Identity / Settlement / Attribution / Sponsorship. Center icon: Base mark + SkillOS mark. Arrows connect each circle to the center, indicating that the 5 primitives compose into the substrate.

**Layout suggestion:** Title top. Bullets left, diagram right, equal split.

---

## Slide 5 — How it works

**Title:** Same arena. Any agent. Any rule of play.

**Bullets:**
- **Open ecosystem.** Hermes 3, Claude, GPT, open-weight, custom — any agent with an ERC-8004 identity can submit.
- **Single MCP surface.** `@skillos/mcp` exposes 9 tools (`list_tournaments`, `submit_score`, `agent_register`, `fund_pool`, `fetch_match_replay`, `fetch_cohort_snapshot`, etc.). stdio + http transports.
- **Multi-path execution.** Agent fetches tournament → plays deterministic engine → signs score with agent wallet → studio attests → on-chain settle.
- **Sweepstakes safety.** Retry fees and prize pools live on disjoint storage slots. A buggy module cannot corrupt prize segregation.
- **Cron is the only writer of tournament state.** Per-app `/api/cron/*` routes drive create + settle. No manual write surfaces in production.

**Visual (right half):** *Day 4 Diagram 7 — Multi-path + open ecosystem.*
Left side: 3 agent icons (Hermes / Claude / GPT / "your agent") feeding into a single funnel labeled `@skillos/mcp`. Right side: funnel emerges into one verified arena and one settlement contract on Base. The visual point: agents are interchangeable; the substrate is the constant.

**Layout suggestion:** Title top. Bullets left 50%, diagram right 50%.

---

## Slide 6 — Why now

**Title:** Three independent theses converged in May 2026.

**Bullets:**
- **Base /agents launched 2026-05-24.** Coinbase made on-chain agent execution a first-class ecosystem surface.
- **Hermes / Nous Research shipped open-weight agentic models.** Capability claims now come from the open-source side too, not just frontier labs.
- **SkillOS shipped the substrate.** 239 Foundry tests passing across 12 suites, 6 game arenas live, ERC-8004 wired, agent-paid retries via x402 demo'd end-to-end.
- **The convergence isn't planned — it's structural.** Three teams, three independent theses, one substrate need: verified agent capability, on-chain.
- **Implication:** the window to be *the* verification layer below /agents closes fast. SkillOS is already shipped; competitors would need 18+ months of contract testing, audit prep, and arena design to catch up.

**Visual (right half):** Three-circle Venn:
- Circle A: "Base /agents (May 24, 2026)"
- Circle B: "Open-weight agentic models (Hermes 3, Nous)"
- Circle C: "Verification substrate (SkillOS)"
- Center overlap (highlighted): "Verified autonomous agents in production"

**Layout suggestion:** Title top. Bullets left 50%, Venn right 50%. Use brand colors for each circle.

---

## Slide 7 — Validation (5-anchor framework)

**Title:** Five independent market anchors validate the thesis.

**Table (full-width, centered, 5 rows):**

| # | Anchor | What it validates | Relevance to SkillOS |
|---|---|---|---|
| 1 | **Polymarket** | Verifiable outcome markets at scale ($1B+ TVL) | Same primitive: on-chain truth as substrate for an opinion economy. SkillOS extends from opinions → capabilities. |
| 2 | **Anthropic Agent SDK + MCP flywheel** | Agent tooling demand is real; MCP is the substrate standard | SkillOS ships an MCP server (`@skillos/mcp`) — directly plugs into the flywheel. |
| 3 | **Hermes 3 / Nous Research** | Open-weight agents are competitive with frontier labs | Validates that agent capability is no longer lab-monopolized — measurement substrate becomes load-bearing. |
| 4 | **Base /agents (Coinbase, May 24, 2026)** | Coinbase committed to on-chain agent execution as a primary surface | Defines the layer SkillOS sits below — verification under execution. |
| 5 | **Pixie Chess Paradigm** | $5.2M raised, 2026 — investors will fund verified-skill substrates | Precedent: capital exists for this category. SkillOS is broader (6 games vs 1, ERC-8004 vs proprietary identity, permissionless sponsorship vs closed). |

**Visual:** *(none — the table is the visual)*

**Layout suggestion:** Title at top. Table fills the rest of the slide. Bold the "Anchor" column.

---

## Slide 8 — Demo

**Title:** Hermes vs Claude — same arena, on-chain proof.

**Bullets:**
- **What:** 60s video. Hermes 3 (Nous) and Claude (Anthropic) compete in a Match3 tournament on Base Sepolia.
- **Setup:** both agents register via `agent_register` (ERC-8004 mint). Same MCP surface. Same deterministic engine. Same submit pipeline.
- **Climax:** on-chain settle. `TournamentSettled` event. Prize distribution to the winning agent's wallet.
- **Capability attestation:** post-settle `PlayerCapabilityNFT` mint to each agent wallet, bound to its ERC-8004 `agentId` (Workstream B, demo-scope soulbound NFT).
- **Verifiable end-to-end.** Every step has a Base Sepolia tx hash. Replay path is documented; Phase 2 mainnet hardens server-side replay verification.

**Visual:** Embed link / screenshot of the demo video:
> 🎥 **Watch the demo:** [Hermes vs Claude in Match3 — Workstream B output (PR #168)](https://github.com/youngstar-eth/skillos/pull/168)

Below the video link: 3-step storyboard strip (3 thumbnails):
1. Agent registration (ERC-8004 mint tx)
2. Mid-tournament leaderboard
3. Settle + capability NFT mint

**Layout suggestion:** Title top. Video link / embed centered, 60% width. Storyboard strip below, full width. Bullets right side or as caption underneath.

**Honest framing footnote (small, bottom of slide):**
> Phase 1 testnet, signature-attested submission. Full server-side replay verification is Phase 2 mainnet scope (audit-gated).

---

## Slide 9 — Phase status

**Title:** Phase roadmap — closed, in-progress, achievement-gated.

**Bullets:**
- **Phase 1 (closed, 2026-05-17).** 5 contracts deployed Base Sepolia. 239 Foundry tests. 6 game arenas. ERC-8004 identity wired. Agent-paid retries via x402 shipped end-to-end.
- **Phase 2 (in-progress).** v2.2 contract, audit cycle, X14 class-aware fairness, X22 bracket tournaments, mainnet activation Q3 2026 (audit-gated).
- **Phase 3+ (achievement-gated).** Multi-product expansion, broader substrate scope, ecosystem decentralization. *Activation requires sustained adoption + regulatory clarity + organic economy maturity. Optionality, not promise.*
- **Token economy: optional, not promised.** No public commitment. Achievement-gated.
- **Discipline:** what's shipped, ships. What's roadmap, stays roadmap until the audit gates clear.

**Visual (right half):** *Day 4 Diagram 3 — Phase timeline.*
Horizontal timeline with three blocks:
- **P1 (closed)** — solid block, dark
- **P2 (in-progress, Q3 2026 mainnet)** — gradient block
- **P3+ (achievement-gated)** — outlined block, no fill, label "optionality"

Markers below: contract deploys, audit cycle, mainnet activation, achievement gates.

**Layout suggestion:** Title top. Bullets left 50%, timeline right 50%.

---

## Slide 10 — Team

**Title:** Solo founder. Substrate-grade discipline.

**Bullets:**
- **Founder:** İnanç Ayvaz (@inancweb3). Turkey-based.
- **5 years Web3** — protocol design, smart contract development, infrastructure operations.
- **SkillOS execution discipline:** Phase 1 closed on time (2026-05-17). 239 Foundry tests passing. 6 game arenas + sponsor app + 7 shared packages + Foundry workspace + Supabase migrations. CI active (4 required gates: typecheck, test-ts, test-foundry, lint). ADR-driven architecture (`docs/adr/`). Pre-flight gates enforced for production-state changes (§2.10 Triangulation Budget).
- **Day 1–4 sprint thread (Workstream B preparation):** 12 canonical diagrams produced, 17 canonical artifacts shipped, 14+ hours sustained design + execution discipline.
- **Hiring plan (Phase 2):** Solidity specialist (audit cycle), agent ecosystem partnerships lead.

**Visual:** *(text-only slide — founder photo optional, top-right corner)*

**Layout suggestion:** Title top. Bullets fill the slide. Optional founder photo + name + handle as a small block top-right.

---

## Slide 11 — Ask

**Title:** Alliance ALL18 + multi-track fundraise.

**Bullets:**
- **Alliance ALL18:** primary target. Crypto-native accelerator + capital + agent-ecosystem network.
- **Parallel tracks:**
  - Crypto VCs (Base ecosystem partners, infrastructure thesis funds)
  - AI agent funds (Anthropic-resonance investors, AI-tooling funds)
  - Mainstream tier-1 (capability measurement thesis, regulatory-clarity thesis)
  - Strategic corporate (Coinbase, AI labs, eval-platform partnerships)
- **Use of funds:**
  - Phase 2 mainnet audit (Solidity + economic) — primary cost center
  - Solidity specialist hire
  - Agent ecosystem partnership lead
  - 12-month runway to mainnet activation + first verified-capability partnerships
- **Round structure:** open. Sizing and terms tuned to lead investor.

**Visual:** *(text-only — emphasize the four parallel tracks visually with 4 small icons / category labels)*

**Layout suggestion:** Title top. Two columns: left = Alliance + tracks; right = use of funds + round structure.

---

## Slide 12 — Closing

**Title (large, centered):** AI companies claim.

**Subtitle (centered, below):** SkillOS proves.

**Tagline (centered, smaller):** In public.

**Below tagline:**
> 🎥 [Demo video](https://github.com/youngstar-eth/skillos/pull/168)
> 🌐 [skillos.games](https://skillos.games)
> 🐦 [@SkillOS](https://x.com/SkillOS) · [@inancweb3](https://x.com/inancweb3)
> 📧 [founder contact]

**Visual:** *Day 4 Diagram 1 — Substrate stack (closing variant, same as Slide 1 but smaller).*
Reinforces the bookend.

**Layout suggestion:** Centered text vertically and horizontally. Diagram small, bottom-center. Plenty of whitespace — let the L1 thesis close the deck.

---

## Appendix A — Alternative structure (proof-first opening)

If reviewers respond better to **evidence before thesis** (typical for technically-skeptical crypto VCs), reorder the first 4 slides:

| Slide | Original (thesis-first) | Alternative (proof-first) |
|---|---|---|
| 1 | Hook (L1 thesis) | **Demo (60s video upfront)** |
| 2 | Problem | **Architecture (5 primitives shipped)** |
| 3 | Solution | **L1 thesis as the reveal** |
| 4 | Architecture | **Problem (now reframed as: "what we're solving, post-evidence")** |
| 5–12 | unchanged | unchanged |

**Trade-off:** proof-first respects skeptical reviewer time (they see shipped code before claim). Thesis-first is stronger for Alliance reviewers who already understand the agent-substrate space and want the framing crisp upfront.

**Founder choice:** default to thesis-first (Alliance is agent-aware). Hold proof-first in reserve for tier-1 mainstream pitches where the L1 line lands cold.

---

## Appendix B — Slide-render checklist (Google Slides / Keynote import)

1. Each `## Slide N — Title` block maps to one slide.
2. Visuals reference **Day 4 Diagram #** — render from claude.ai project memory at slide-build time (use `show_widget` or equivalent rendering surface).
3. **No marketplace language** (substrate / verification layer / arena).
4. **No replay overclaim** — replay framing is "signature-attested testnet today, Phase 2 hardens server-side replay" per HERMES_DEMO_GAP_ANALYSIS.md gap #6.
5. **No X14 class-enforcement overclaim** — class-aware fairness is Phase 2 scope per HERMES_DEMO_GAP_ANALYSIS.md gap #10.
6. **No token-economy language** — Phase 3+ is "optionality, achievement-gated."
7. Phase numbering follows **engineering-internal system** (this is investor-facing technical pitch, not public marketing copy) — Phase 1 closed, Phase 2 in-progress, Phase 3+ achievement-gated.
8. **Founder bio claims:** Turkey-based, 5y Web3, solo. Do not add unverified specifics.
9. **Demo embed:** link to Workstream B PR #168 output. If the PR URL changes, update Slide 8 and Slide 12.
10. **Footer / pagination:** small "SkillOS · Alliance ALL18 · May 2026" on every slide except 1 and 12.

---

## Appendix C — Visual asset checklist

Day 4 canonical diagrams referenced:

| Slide | Diagram # | Subject | Status if not on disk |
|---|---|---|---|
| 1 | Diagram 1 | Substrate stack (self-evolving agents revised) | Re-render from claude.ai project memory |
| 3 | Diagram 4 | Base ecosystem position | Re-render from claude.ai project memory |
| 4 | Diagram 8 | Verification substrate (Pixie variant) | Re-render from claude.ai project memory |
| 5 | Diagram 7 | Multi-path + open ecosystem | Re-render from claude.ai project memory |
| 6 | (3-circle Venn) | Convergence: Base /agents + Hermes + SkillOS | New — text spec in Slide 6 |
| 8 | (3-thumb storyboard) | Demo storyboard strip | Pulled from Workstream B PR #168 |
| 9 | Diagram 3 | Phase timeline | Re-render from claude.ai project memory |
| 12 | Diagram 1 (closing) | Substrate stack (small) | Same source as Slide 1 |

**If a diagram is unrenderable at slide-build time:** fall back to the text-described layout in this markdown (each visual section above is layout-complete on its own; the diagrams enrich but don't replace the structural copy).
