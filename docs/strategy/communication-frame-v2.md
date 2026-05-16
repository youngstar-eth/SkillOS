# Communication Frame v2 — SkillOS / Simpl3 / Founder

**Status:** Canonical internal reference.
**Audience:** Founder, future hires, agent assistants drafting external copy.
**Last revised:** 2026-05-16.
**Predecessor:** No formal v1 — this is the first canonical write-up.
**Distribution:** Internal-only. Do **not** quote verbatim externally — extract phrasing per §5–§7.

---

## §1 Purpose & scope

This document defines how the Simpl3 organization communicates across three
distinct X accounts and three distinct deck contexts. It exists because:

1. **The substrate ambition outpaces the public-defensible product surface.**
   SkillOS today is the only shipped vertical; the broader Simpl3 thesis
   ("Simplifying Web3 for the next billion — human and agent") is not yet
   earned by execution. Until it is, the broader claim cannot live at the
   product layer without risking either overclaim or Howey exposure.
2. **The Domain Neutrality Invariant** (developer-surface.md §2.4) is an
   internal architecture constraint with an explicit public-comm rule:
   *externally, SkillOS is "skill economy infrastructure for the agent era";
   skill gaming is the named category.* That rule is the spine of this doc.
3. **The founder voice bridges layers** (@inancweb3) and is the only account
   that can articulate both the narrow product reality and the broader
   substrate thesis without violating the architecture invariant or the Howey
   constraint — because founder thesis posts are observational, not
   product-commitment, and not parent-company corporate.

Scope: X/Twitter primarily. Cross-applies to deck slide copy, podcast
positioning, and press one-liners. Does not cover internal Discord, repo
READMEs, or commit messages.

Out of scope: token mechanics (achievement-gated, not in public comm at all),
multi-product timeline (optionality-framed only), buyback mention (forbidden
in public comm per founder constraint).

## §2 Three-account architecture

| Account | Layer | Role | Primary audience |
|---------|-------|------|------------------|
| **@SkillOS** | Product | Product state. Working demos, tx hashes, deploys, post-mortems. | Builders, integrators, users, AI agents |
| **@web3simpl** | Corporate / parent | Mission, milestones, multi-product optionality (without commit). | Investors, press, ecosystem partners |
| **@inancweb3** | Founder / analyst observer | Thesis, build observations, occasional retros. Bridges layers. | Builders, AI/web3 founders, Anthropic-resonance circles |

**Why three.** A single account either undersells the substrate ambition or
overclaims at the product level. A layered model lets the broader claim be
*earned* by product execution over years, instead of asserted up-front. This
is the Stripe trajectory pattern (see §12). It also protects the architecture
invariant: @SkillOS never breaches Domain Neutrality, because Domain
Neutrality breach signals only happen at the @web3simpl + @inancweb3 layers.

**What goes where.**
- @SkillOS: contract addresses, base.dev tx links, replay-verifier output,
  match settlement screenshots, sponsor-pool burndown, post-incident RCAs.
- @web3simpl: company milestones, hires, funding announcements,
  category-level statements about Web3 mass adoption, multi-product *hints*
  (optionality only, no roadmap).
- @inancweb3: thesis posts on verifiable AI / capability evaluation,
  observations from building, retros, reply rotation.

**What doesn't cross-pollinate.**
- @SkillOS does **not** post Simpl3 mission statements. If a product
  deploy ties to mission, link to @web3simpl quote-tweet.
- @web3simpl does **not** post product-state details (tx hashes, deploys).
  If a milestone is product-state-driven, link to @SkillOS instead.
- Cross-pollination is allowed only via quote-tweet or reply — never via
  primary post copy.

## §3 Bio versions (canonical, all under 160 characters)

> **@web3simpl** (106 chars)
> Simplifying Web3 for the next billion — human and agent. Verifiable infra. Class-agnostic. Permissionless.

> **@inancweb3** (112 chars)
> Building Simpl3. Verifiable AI substrates. Ethics-aligned by architecture, not policy. Web3 mass adoption thesis.

> **@SkillOS** (114 chars)
> Verifiable skill arenas on Base. Class-agnostic. Permissionless sponsorship. On-chain settlement. Replay-verifiable.

**Notes:**
- All three deliberately omit hashtags (algorithm penalty per §11).
- "Verifiable" is the only term that appears in all three bios — it's the
  cross-account anchor. Anthropic resonance carrier (see §6).
- "Class-agnostic" appears in @web3simpl + @SkillOS bios but **not**
  @inancweb3 — founder voice operates above the architecture-invariant layer.
- "Substrate" is permitted at @inancweb3 only ("substrates"). Never at
  @SkillOS (Domain Neutrality breach), and only via "infra" wording at
  @web3simpl (to keep the broader claim earned-by-execution, not announced).
- "Permissionless" appears at @web3simpl + @SkillOS. It's a publicly
  defensible architecture invariant (developer-surface.md §3.7) and a
  Skillz-vs-Papaya category differentiator.

## §4 Architecture invariants — public-comm cross-reference (seven)

These invariants are encoded in `docs/architecture/developer-surface.md`.
Each row maps an architecture invariant to its public-comm posture so that
copy at any layer can be sanity-checked against the architecture itself.

| # | Invariant | Anchor (developer-surface.md) | Public posture |
|---|-----------|-------------------------------|----------------|
| 1 | **Domain Neutrality** — substrate is class-agnostic; public framing is skill-gaming only | §2.4 (lines 62–82) | **Internal only.** Never breach at @SkillOS layer. Broader frames allowed at @web3simpl + @inancweb3 only. |
| 2 | **Class-agnostic substrate** — five core primitives generalize to any verifiable performance market | §2.4, §3.1 | Public defensible at **all layers**. Anthropic resonance. |
| 3 | **Permissionless sponsorship** — any wallet can sponsor a prize pool; no gatekeeping | §3.7, §3.8 | Public defensible at **all layers**. Skillz-vs-Papaya category anchor. |
| 4 | **Replay-verifiable evaluation** — T2/T3 tiers reconstruct deterministic state from on-chain anchors | §3.2 (T-tier table, lines 218–229) | Public defensible. Carries "verifiable AI / auditable capability eval" framing. |
| 5 | **Builder Code attribution** — ERC-8021 dataSuffix; chain-evidenced, no off-chain trust | §2.1, §3.2 (dataSuffix capability) | Public defensible. Chain-evidenced. Use as proof-point, not aspiration. |
| 6 | **Engine-agnostic SDK** — collab filter rejects engine-specific or closed-SDK distribution | §3.7 (line 348ff) | Public defensible. Use in partnership-context replies. |
| 7 | **Achievement-gated tokenization** — token roadmap exists *only* gated on platform-maturity milestones | §3.7 (line 354) | **Internal only.** **Never** public-comm. Howey trigger. |

**Asymmetry to internalize:** six of seven invariants are publicly
defensible because they are either chain-evidenced or code-evidenced. Only
invariant #7 is Howey-sensitive enough to stay pitch-only. The risk matrix
in §9 falls out of this asymmetry — it is not generic legal caution.

## §5 Tagline trio

| Account | Tagline (canonical) |
|---------|---------------------|
| @web3simpl | "Simplifying Web3 for the next billion — human and agent" |
| @inancweb3 (thesis line) | "You can't onboard the next billion to Web3 with opaque infrastructure" |
| @SkillOS | "Verifiable skill arenas on Base" |

## §6 Terminology lexicon

| ❌ Drop / de-emphasize | ✅ Adopt / emphasize |
|------------------------|----------------------|
| "Skill economy infra for the agent era" *(@web3simpl level — too narrow)* | "Simplifying Web3 for the next billion — human + agent" |
| "Verifiable infrastructure for the agent era" *(@web3simpl level — too narrow)* | "Web3 mass adoption substrate" *(@web3simpl level)* |
| "Web3 gaming" *(reinforced already-abandoned)* | "Agent infrastructure" + "verifiable evaluation" |
| "Tournament" *(generic, not differentiated)* | "Arena" + "verifiable capability" |
| "Trustless" *(crypto jargon)* | "Verifiable" + "auditable" + "on-chain" |
| Hashtag spam | None (algo penalty 2024-era, still avoid) |
| "Open" *(vague)* | "Class-agnostic" + "permissionless" |

**Anthropic resonance terminology** (use at @inancweb3 + @web3simpl layers):

- "Verifiable AI"
- "Capability evaluation substrate"
- "Closed labs publish; we publish on-chain"
- "Ethics-aligned by architecture, not by policy"

## §7 Voice discipline (tone matrix)

| Account | Tone | Content cadence | Reply orientation |
|---------|------|-----------------|-------------------|
| @web3simpl | Corporate, mission-driven, big-picture | 1–2 posts/week (milestones, thesis) | Selective; high-signal replies only |
| @inancweb3 | Analyst observer, builder-thinker, opinionated | 3–5 posts/week (thesis, observations, occasional retro) | Engaged; daily reply rotation |
| @SkillOS | Technical, direct, no hype, product-state-driven | 2–3 posts/week (deploys, tx hashes, working demos) | Operational; user-facing replies |

**Cross-account discipline:**

- Avoid cross-pollination: @SkillOS does NOT post Simpl3 mission statements;
  @web3simpl does NOT post product-state details (link to @SkillOS instead).
- Mutual amplification OK: each account can quote-tweet or reply to others
  when organically relevant.
- Founder voice (@inancweb3) bridges layers — can reference both @SkillOS
  product state and @web3simpl mission.

## §8 Pitch deck split

**SkillOS pitch deck** (product-level, current YC + Phase 2 fundraise focus):

- Slide 1: "Verifiable skill arenas on Base" thesis
- Slides 2–3: Skillz/Papaya $420M Lanham Act verdict anchor + class-agnostic
  architecture solution
- Slides 4–6: Phase 1 proven execution (agent funnel, on-chain settlement,
  Builder Code attribution)
- Slides 7–10: Phase 2 mainnet roadmap (v2.2 contract, audit, class-aware
  fairness, Cayman structuring)
- Anthropic resonance thread: subtle, throughout — "verifiable",
  "auditable", "ethics-aligned by architecture"

**Simpl3 pitch deck** (parent-level, mid-term seed/Series A, multi-product):

- Slide 1: "Simpl3 = Simplified Web3. Onboarding the next billion — human
  and agent."
- Slides 2–3: Mass Web3 adoption thesis, market context
- Slide 4: Multi-product strategy (SkillOS = first vertical, more
  achievement-gated)
- Slides 5–6: SkillOS as proof point (Phase 1 sealed, agent funnel proven)
- Slides 7–10: Holding company economics + future vertical optionality
- **Howey constraint**: NO token roadmap, NO substrate intelligence public,
  NO multi-product timeline — only optionality framing

**Sequencing.** SkillOS deck primary today. Simpl3 deck mid-term — assembled
after SkillOS Phase 2 mainnet execution proves market fit (Q4 2026 – Q1 2027
horizon, gated on Phase 2 success).

## §9 Risk filtreleri (do / don't matrix)

| ❌ NEVER public communication | Reason |
|-------------------------------|--------|
| "Substrate intelligence" / "foundation model training" / "AI oracle" | Howey trigger risk — pitch-only |
| "Token launch" / "governance token" / "$SP token" | Achievement-gated, public commit YASAK |
| "Multi-product roadmap" with specific verticals or timelines | Optionality preservation, no promise |
| "Anthropic partner" | Wait for Powered by Claude approval before claim |
| Specific next-billion-user metrics or timeline | Hype/overclaim risk |
| Skill gaming category drop at @SkillOS layer | §2.4 Domain Neutrality violation |
| "Buyback" mention | NO buyback firm public communication constraint |

| ✅ OK public communication | Why |
|----------------------------|-----|
| "Verifiable" + "auditable" + "replay-verifiable" | Phase 5-aligned, Anthropic resonance |
| "First product" / "first vertical" / "flagship" | Multi-product optionality implicit, no promise |
| Skillz/Papaya $420M verdict frame | Canonical pitch anchor, legal-truthful |
| "Class-agnostic infra" | Architecture invariant, public defensible |
| "Permissionless sponsorship" | Architecture invariant, public defensible |
| "Human and agent" mass adoption framing | Simpl3 thesis, broad accessibility |
| "Ethics-aligned by architecture, not by policy" | Anthropic resonance, code-evidenced |

## §10 Phase trajectory signals

| Phase | @SkillOS signal | @inancweb3 signal | @web3simpl signal |
|-------|-----------------|-------------------|-------------------|
| Phase 1–2 (current) | Product execution (deploys, demos, tx hashes) | Thesis posts, build observations, occasional retro | Milestone announcements, corporate identity build |
| Phase 3 (achievement-gated) | Mainnet + agent class API + dispute layer | Verifiable AI maturation thesis | Multi-product hint signals (still optionality) |
| Phase 4–5 (platform-maturity-gated) | Substrate-level evolution (still product-narrow public) | Mass adoption proof commentary | Multi-product execution proof, Simpl3 broader vision |

## §11 Content cadence (algo-aware)

Per xAI algorithm 2026 playbook (`docs/research/x-algorithm-2026-playbook.md`):

- Dwell-time substance per post (no throat-clearing intros)
- DM-share optimized (code snippets, working commands, copy-able insights)
- Reply > like for new account warmup
- Quote-with-analysis mid-sized Jaccard-overlap accounts
- 24h post lifecycle, 6h babysit window high-stakes posts
- Avoid: engagement bait, repeated mention chains, hashtag spam, link-only
  posts

**Posting time (Türkiye-friendly):** Tue–Thu 17:00–19:00 Türkiye (= 10am–12pm
ET, US tech Twitter peak).

**Multi-account rhythm:** alternate accounts day-by-day to avoid author
diversity decay. Same-day cross-account posts only when coordinated thread
(e.g., milestone announcements).

## §12 Stripe pattern parallel + earned-by-execution principle

Stripe's first three years were positioned as "online payments" — the
substrate ambition ("infrastructure for the internet's economy") was earned
by execution, not announced.

Applied to Simpl3:

- Today: SkillOS execution focus = narrow public frame ("verifiable skill
  arenas")
- Tomorrow: Simpl3 multi-product execution proves over years = broader frame
  earns its right ("Simplified Web3 for the next billion")
- @inancweb3 bridges layers — founder thesis can articulate both without
  premature commitment

## §13 Anti-patterns flagged (cross-reference x-algorithm playbook §6)

- ❌ Posting before Grok safety labels arrive (~30-min lag, default MediumRisk)
- ❌ Engagement bait phrases (caught by `slop_score`)
- ❌ Repeated mention chains in early posts (caught by
  `SpamEapiLowFollowerClassifier`)
- ❌ Short video clips under ~10s (no `vqv` credit)
- ❌ Author diversity decay — overposting same account same day

## §14 Source references

- xAI X algorithm 2026 playbook: `docs/research/x-algorithm-2026-playbook.md`
- Architecture: `docs/architecture/developer-surface.md` (single source of
  truth; v1.2/v1.3 supplements referenced in the original brief are **not
  yet present** in the repo — see "contradictions" section below)
- Domain Neutrality Invariant: §2.4 of `developer-surface.md` (lines 62–82)
- Skillz v Papaya Lanham Act verdict (April 2026, US $420M, largest in
  history)
- Stripe trajectory historic precedent

---

## Constraints (binding)

- All claims must be code-evidenced or memory-evidenced; no fabricated
  metrics.
- Howey safety: NO public token roadmap, NO substrate intelligence
  reference, NO multi-product specific timeline.
- Domain Neutrality §2.4: skill gaming category framing preserved at
  @SkillOS layer; broader frames at @inancweb3 + @web3simpl layers only.
- ToS-safe: no engagement bait, no spam patterns, no multi-account
  manipulation.
- Voice authenticity: technical, direct, no hype — across all three accounts.

## Contradictions noted (do not silently resolve)

1. The original brief refers to
   `docs/architecture/architecture-doc-supplement-v1.2.md` and
   `architecture-doc-supplement-v1.3.md`. As of 2026-05-16, only
   `developer-surface.md` exists in `docs/architecture/`. All v1.2-supplement
   references in this doc therefore resolve to `developer-surface.md` §2.4.
   Founder to decide whether v1.2/v1.3 supplements still need to be authored
   or whether `developer-surface.md` has absorbed their content.

2. Memory `project_claudemd_nextjs_version_stale` notes that the repo
   CLAUDE.md is itself stale in places (Next.js version framing). This
   document deliberately does not cite CLAUDE.md as a source — only the
   architecture and research docs above. Treat that as intentional, not an
   omission.
