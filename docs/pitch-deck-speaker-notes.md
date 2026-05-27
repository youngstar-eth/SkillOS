# SkillOS — Alliance ALL18 Pitch Deck (Speaker Notes)

**Companion to:** [`docs/pitch-deck.md`](./pitch-deck.md)
**Target run time:** 8–10 minutes (founder-narrated). Q&A separate.
**Voice:** Sober, evidence-led, no hype. Match Day 4 founder mode.

Each slide gets:
- **30–60s talking points** (the spoken narration)
- **Key data points to emphasize** (what reviewers should remember)
- **Anticipated questions + responses**

---

## Slide 1 — Hook (45s)

**Talking points:**

> "I'll open with the thesis, then we'll walk through the proof.
>
> AI companies claim. SkillOS proves. In public.
>
> Every frontier lab today grades its own homework. Anthropic publishes a benchmark, OpenAI publishes a benchmark, Hermes publishes a benchmark — and no third party can replay any of them end-to-end.
>
> SkillOS is the verification substrate that closes that gap. Permissionless arena, on-chain settlement, replay-anchored. Any agent, any rule of play, same chain.
>
> That's the entire thesis. The next eleven slides are evidence."

**Emphasize:**
- "In public" is the load-bearing phrase. It's not "verified by us" — it's "verifiable by anyone."
- Tone is calm. No selling. State and move on.

**Anticipated questions:**
- *"What does 'verification substrate' actually mean?"* → "The five primitives on Slide 4. Arenas, identity, settlement, attribution, sponsorship. Composable infrastructure agents plug into."
- *"Why now and not 18 months ago?"* → "Slide 6 — the three-thesis convergence. The agent-execution layer wasn't a real surface until Base /agents launched three days ago."

---

## Slide 2 — Problem (45s)

**Talking points:**

> "The capability measurement crisis is documented. Three independent 2025 sources, all peer-reviewed or institutional.
>
> FAccT 2025 — the ACM Fairness Accountability Transparency conference — flagged benchmark contamination and lab-controlled evaluation as structural problems in AI claim-making.
>
> The EU Joint Research Centre wrote, almost verbatim, 'AI capability claims are not independently verifiable at scale.'
>
> Stanford HAI's AI Index 2025 reinforced this from the methodology side — evaluation heterogeneity makes cross-model comparison structurally unsound.
>
> So the gap isn't 'these labs are dishonest.' The gap is: there is no public substrate where capability can settle. Closed labs publish; nobody can replay."

**Emphasize:**
- Three named sources. Don't paraphrase — name them.
- The framing is "structural gap," not "labs are lying." Crypto-native reviewers will pattern-match this to "trustless settlement" — let them.

**Anticipated questions:**
- *"Aren't existing benchmarks like MMLU and HELM solving this?"* → "Benchmarks measure. They don't settle. There's no substrate where a third party reconstructs the run. SkillOS is the settlement layer, not another benchmark."
- *"Is this a regulatory bet?"* → "Partly. EU AI Act and the US executive order both demand independent capability verification. But the primary thesis is investor and developer trust — regulation is downstream."

---

## Slide 3 — Solution (60s)

**Talking points:**

> "SkillOS is the verification layer Base ecosystem is missing.
>
> L3 thesis: a permissionless arena where agents prove capability through head-to-head play, settled on Base, replay-anchored on-chain.
>
> What we are not — and this matters because reviewers will pattern-match wrong if I don't say it:
> - Not a marketplace.
> - Not a benchmark suite.
> - Not a leaderboard with extra steps.
>
> What we are: substrate. Composable infrastructure agents plug into to make capability claims publicly settleable.
>
> Today, on Base Sepolia: six game arenas live, agent-or-human submission, on-chain tournament settlement, ERC-8004 agent identity, and x402 agent-paid retries. All shipped, all replay-evidenced.
>
> Where we sit in the Base ecosystem: below /agents — the execution surface Coinbase launched three days ago — and adjacent to open-weight model releases like Hermes 3. The verification gap is structural, and we're the only team in it."

**Emphasize:**
- The "what we are not" list. Most reviewers will mis-categorize SkillOS as a marketplace if not explicitly headed off.
- "Below /agents" — the architectural diagram in Slide 4 makes this concrete.

**Anticipated questions:**
- *"Why six games and not just one?"* → "Diversity of skill profiles. A capability claim that generalizes across Match3 + 2048 + Wordle + Sudoku + Minesweeper + Clicker is stronger than one that only proves Chess. We started with arcade-style and breadth — Phase 2 expands to harder verticals."
- *"How does this not become a gambling product?"* → "Slide 4 sweepstakes-safety invariant. Retry fees and prize pools live on disjoint storage slots. Sponsor wallets fund pools directly. Foundation treasury never funds prize pools. The contract architecture is non-custodial and the protocol layer has no KYC — the sanctions oracle is the only gate."

---

## Slide 4 — Architecture (60s)

**Talking points:**

> "Five primitives compose the substrate.
>
> One — Arena. Deterministic skill engines. Same seed, same board, same scoring. Six games shipped.
>
> Two — Identity. ERC-8004. Canonical agent identity registry at the 0x8004 vanity address. Mainnet and Base Sepolia both have canonical deployments. Agents register once and all attestations bind to that identity.
>
> Three — Settlement. TournamentPool v2.1, deployed on Base Sepolia. Non-custodial. The sweepstakes safety invariant: prize pool and fee accumulators live on disjoint keccak-derived storage slots. A buggy module physically cannot corrupt prize segregation. We have integration tests — the settle-guard tripwire — that protect this invariant on every change.
>
> Four — Attribution. ERC-8021 dataSuffix. Every game has a Builder Code — for example, 2048's code is bc_o6szuvg1. Every on-chain action is machine-attributable to its tooling stack. This composes with Anthropic's Agent SDK directly.
>
> Five — Sponsorship. SponsorshipModule plus SponsorReceiptSBT. Permissionless prize-pool funding from any wallet. Soulbound receipts. The sponsor side of the substrate is fully shipped — Phase 1 closed."

**Emphasize:**
- Each primitive has a deployed contract on Base Sepolia. Five names: TournamentPool v2.1, SponsorshipModule, SponsorReceiptSBT, ChallengeEscrow, DevAttributionNFT. Plus external canonical ERC-8004 IdentityRegistry.
- 239 Foundry tests. Mention the number — it's a credibility anchor.

**Anticipated questions:**
- *"Audit status?"* → "Phase 2 mainnet activation is audit-gated. Audit firm outreach is active — see Slide 9 phase status. No mainnet deploys until audit clears."
- *"Why ERC-8004 over a proprietary identity scheme?"* → "Open standard, canonical vanity address, external registry already deployed on mainnet and Base Sepolia. Any agent ecosystem can interoperate without per-product onboarding. Proprietary identity would lock us into our own arena — defeats the substrate thesis."

---

## Slide 5 — How it works (45s)

**Talking points:**

> "The substrate is agent-agnostic by design.
>
> Hermes 3, Claude, GPT, open-weight, custom — any agent with an ERC-8004 identity can submit. One MCP surface — at-skillos/mcp — exposes nine tools. List tournaments, submit score, agent register, fund pool, fetch match replay, fetch cohort snapshot, and tier-2 paywalled variants for x402 settlement.
>
> Multi-path execution: agent fetches the tournament, plays the deterministic engine locally, signs the score with its agent wallet, the studio re-attests, and the score settles on-chain.
>
> Cron is the only writer of tournament state. Tournament create and settle happen through per-app cron routes, signed by the studio key, gated on a CRON_SECRET. No manual write surfaces in production. This is a sweepstakes-safety hardening: there is exactly one path into tournament state mutation."

**Emphasize:**
- "Same arena, any agent" — this is the L2 thesis line. Use it verbatim.
- 9 MCP tools. Name the surface explicitly — `@skillos/mcp`.

**Anticipated questions:**
- *"How do agents authenticate to write tools?"* → "SIWA — Sign-In With Agent, EIP-712 — plus ERC-8128 for read paths. Wallet signs a SIWA payload bound to the agent's ERC-8004 identity, the MCP server validates the signature and the agent ID, then the write proceeds."
- *"What stops an agent from submitting a fake score?"* → "Three layers. One — the agent wallet signature. Two — studio re-attestation before broadcast. Three — Phase 2 hardens server-side deterministic replay verification of the gameplay seed and inputs. Today's Phase 1 testnet runs on layers one and two; layer three is in Phase 2 scope."

---

## Slide 6 — Why now (60s)

**Talking points:**

> "Three theses, three independent teams, one substrate need.
>
> May 24, 2026 — three days ago — Coinbase launched Base /agents. On-chain agent execution as a first-class ecosystem surface. The execution layer.
>
> Hermes 3 from Nous Research — open-weight agentic models, competitive with frontier labs. The model layer is no longer monopolized by closed labs.
>
> SkillOS — the verification substrate. 239 Foundry tests passing across 12 suites, six arenas live, ERC-8004 wired, agent-paid retries shipped end-to-end via x402.
>
> The convergence isn't planned. None of these teams coordinated. The pattern is structural: agent execution + open models + verification substrate is the new stack, and three independent teams shipped the three layers in the same month.
>
> Implication for Alliance: the window to be *the* verification layer below /agents closes fast. Replicating SkillOS requires 18+ months of contract testing, audit prep, and arena design. We're already shipped."

**Emphasize:**
- "May 24, 2026 — three days ago." The Base /agents date is recent enough to land hard.
- "Convergence isn't planned" — name this explicitly. Crypto-native reviewers will recognize the structural-not-coordinated pattern.

**Anticipated questions:**
- *"Are you working with Coinbase / Base directly?"* → "We're in the Base ecosystem as a deployed protocol on Base Sepolia. No formal partnership yet — Phase 2 scope includes ecosystem partnership outreach. The /agents launch creates the surface; SkillOS plugs into it without coordination required."
- *"What if Coinbase builds the verification layer themselves?"* → "Possible. But coordination cost is asymmetric — they ship execution, we ship verification, and the substrate works better when those are separable. The Anthropic/Coinbase/Nous separation is exactly the pattern that made the broader web work."

---

## Slide 7 — Validation (60s)

**Talking points:**

> "Five independent market anchors validate the thesis.
>
> One — Polymarket. Over a billion in TVL. Verifiable outcome markets at scale. Same primitive as SkillOS: on-chain truth as substrate for an economy. They proved opinion markets; we extend to capability markets.
>
> Two — Anthropic Agent SDK and the MCP flywheel. Agent tooling demand is real and the MCP standard is taking hold. SkillOS ships an MCP server — at-skillos/mcp — that plugs directly into the flywheel.
>
> Three — Hermes 3 and Nous Research. Open-weight agents competitive with frontier labs. Validates that agent capability is no longer lab-monopolized. When capability decentralizes, measurement substrate becomes load-bearing.
>
> Four — Base /agents from Coinbase. Defines the layer SkillOS sits below — verification under execution.
>
> Five — Pixie Chess Paradigm. Raised $5.2 million in 2026 for a single-game verified-skill product. Investors will fund this category. SkillOS is broader: six games versus one, ERC-8004 versus proprietary identity, permissionless sponsorship versus closed."

**Emphasize:**
- Each anchor is independent. The framework's strength is that no single anchor failing collapses the thesis.
- Pixie Chess Paradigm's $5.2M is the closest comparable. Use it.

**Anticipated questions:**
- *"How do you compete with Pixie Chess Paradigm directly?"* → "We don't — they're vertical-specialized. We're horizontal substrate. They could deploy on SkillOS infrastructure if they wanted a verification anchor for chess specifically. Different layers, different theses."
- *"Why isn't [other comparable] on this list?"* → "Five was the discipline cut. We can talk about adjacent comparables in Q&A — for example, Talent Protocol, EAS attestations, Sismo."

---

## Slide 8 — Demo (60s)

**Talking points:**

> "Sixty seconds of video proof.
>
> Hermes 3 from Nous and Claude from Anthropic compete in a Match3 tournament on Base Sepolia. Both agents register through ERC-8004 — agent_register MCP tool, on-chain mint to the canonical 0x8004 registry. Same MCP surface. Same deterministic engine. Same submit pipeline.
>
> The climax is the on-chain settle. TournamentSettled event fires. Prize distribution to the winning agent's wallet. Then, post-settle, a PlayerCapabilityNFT mints to each agent wallet, bound to its ERC-8004 agent ID. Soulbound capability attestation.
>
> Every step has a Base Sepolia transaction hash. The demo run is reproducible — same seed, same engine, same chain anchors.
>
> Honest framing: this is Phase 1 testnet, signature-attested submission. Full server-side replay verification — where the backend independently re-executes the gameplay seed and inputs and hard-fails any claimed-versus-replay mismatch — is Phase 2 mainnet scope and audit-gated. We don't claim production-grade replay today. We claim a substrate that ships replay as the next milestone."

**Emphasize:**
- Play the video if there's a screen. If not, reference the PR link and describe the storyboard.
- "Honest framing" — the testnet caveat is non-negotiable. Reviewers respect "shipped honestly + roadmap clear" over "claimed too much + adjusted later."

**Anticipated questions:**
- *"Can we see the actual transactions?"* → "Yes. Blockscout link in the PR description. All txs are public — agent registration, sponsor pool funding, score submissions, settle, capability NFT mints."
- *"Why Match3 specifically?"* → "Deterministic engine, agent-friendly action space, visually clear in 60s. The substrate runs all six games — Match3 was chosen for video legibility."

---

## Slide 9 — Phase status (45s)

**Talking points:**

> "Three phases. One closed, one in progress, one optionality.
>
> Phase 1 — closed May 17, 2026. Five contracts deployed on Base Sepolia. 239 Foundry tests across 12 suites. Six game arenas live. ERC-8004 agent identity wired. Agent-paid retries via x402 shipped end-to-end. The X15 demo is public and verifiable.
>
> Phase 2 — in progress. Contract version 2.2, audit cycle, X14 class-aware fairness, X22 bracket tournaments. Mainnet activation Q3 2026, audit-gated. We do not deploy to mainnet until audit clears.
>
> Phase 3 and beyond — achievement-gated. Multi-product expansion, broader substrate scope, ecosystem decentralization. Activation requires sustained adoption plus regulatory clarity plus organic economy maturity. This is optionality, not promise.
>
> Token economy — let me be explicit on this. Optional, not promised. No public commitment. Achievement-gated. We treat public framing as a commitment device, not a teaser."

**Emphasize:**
- "Audit-gated" — say it twice if needed. This is the Phase 2 discipline.
- The token framing: "optional, not promised" — verbatim. Howey-sensitive language.

**Anticipated questions:**
- *"Audit firm and timeline?"* → "Outreach active. Multiple firms in conversation; pricing and slot timing converging. We'll have a signed engagement in [next 4–6 weeks]. Audit fee is the primary use-of-funds line."
- *"Why no token commitment?"* → "Achievement-gated means we don't promise a token until the substrate has proven sustained adoption and regulatory clarity. Promising a token today is Howey exposure and a credibility tax. We'd rather earn the right than declare it."

---

## Slide 10 — Team (30s)

**Talking points:**

> "Solo founder. Substrate-grade discipline.
>
> İnanç Ayvaz — at-inancweb3 on X. Turkey-based. Five years Web3 — protocol design, smart contracts, infrastructure operations.
>
> Execution discipline you can verify in the repo: 239 Foundry tests, six game arenas, sponsor app, seven shared packages, Supabase migrations, CI active with four required gates — typecheck, test-ts, test-foundry, lint. Direct-to-main is banned. ADR-driven architecture in docs/adr. Pre-flight gates enforced for any production-state change.
>
> The Day 1–4 sprint thread leading into this submission produced twelve canonical diagrams, seventeen canonical artifacts, fourteen-plus hours of sustained design and execution discipline. The pitch deck and the demo video are both downstream of that sprint thread.
>
> Phase 2 hiring plan: Solidity specialist for audit cycle, agent ecosystem partnership lead. Lean team — substrate plays don't need bloat."

**Emphasize:**
- Solo founder — own it. Don't apologize for it. Crypto-native reviewers respect operator discipline.
- "Direct-to-main is banned" — counter-signaling. Demonstrates engineering rigor.

**Anticipated questions:**
- *"Why solo?"* → "Phase 1 was substrate design — best done by one person with the full architectural picture. Phase 2 is execution + partnership — that's when the team expands. Hiring opens once Alliance accepts."
- *"Founder coverage if something happens to you?"* → "Honest answer: thin today. Phase 2 includes operational redundancy planning — that's part of the use-of-funds."

---

## Slide 11 — Ask (45s)

**Talking points:**

> "Alliance ALL18 is the primary target. Crypto-native, agent-aware, capital plus network plus accelerator scaffolding. The fit is structural.
>
> Parallel tracks running in parallel — not sequential, not contingent:
> - Crypto VCs — Base ecosystem partners, infrastructure thesis funds.
> - AI agent funds — Anthropic-resonance investors, AI-tooling funds.
> - Mainstream tier-1 — capability measurement thesis, regulatory clarity thesis.
> - Strategic corporate — Coinbase, AI labs, evaluation platform partnerships.
>
> Use of funds is clear: Phase 2 mainnet audit is the primary cost center. Solidity specialist hire. Agent ecosystem partnership lead. Twelve months of runway to mainnet activation plus first verified-capability partnerships.
>
> Round structure is open. Sizing and terms tuned to the lead investor. Alliance's call on shape."

**Emphasize:**
- "Open" round structure — don't over-anchor. Let Alliance lead.
- Audit is the primary line item. Reviewers should leave knowing the money has a defined first destination.

**Anticipated questions:**
- *"What's the round size you're targeting?"* → "Tuned to lead. Working bracket is [tuned to Alliance norms — placeholder for founder to fill in before submission]. Anchored on 12-month runway to mainnet + first partnerships."
- *"Why multi-track instead of just Alliance?"* → "Alliance is primary. Parallel tracks are insurance and optionality. We don't want to be single-source-dependent — and we expect strategic capital to come from multiple thesis-aligned partners."

---

## Slide 12 — Closing (15s)

**Talking points:**

> "AI companies claim. SkillOS proves. In public.
>
> Demo link, repo, founder contact on the slide. Thank you for your time."

**Emphasize:**
- Short. Land the tagline. Stop talking.
- Don't repeat the deck. Don't add a "summary" — the deck *is* the summary.

**Anticipated questions:**
- *(reserved for Q&A — the close is intentionally brief)*

---

## Cross-deck Q&A reserves

Questions that don't fit any single slide cleanly but reviewers may ask:

**"What's the moat?"**
> "Three layers. One — 239 Foundry tests and a sweepstakes-safety architecture that takes 18+ months to replicate honestly. Two — ERC-8004 + x402 + ERC-8021 are open standards, but the integration discipline to compose them into a substrate is the moat. Three — ecosystem position. Below Base /agents, adjacent to open-weight model releases — that position is structural, not just first-mover."

**"What's the revenue model?"**
> "Three lines, none speculative. One — x402 per-call settlement on AI-data licensing tier (Anthropic-pattern). Two — tournament fee margin (existing on-chain primitive). Three — Builder Code attribution split on third-party agent SDK integrations. No subscription tier. No enterprise quote, no monthly tier. Per-call settlement is the discipline."

**"What kills this?"**
> "Three risks, ranked. One — audit finds a sweepstakes-safety regression we missed. We've extended the settle-guard tripwire on every change to mitigate — but it's the highest-impact risk. Two — Coinbase ships a verification layer themselves. Possible but coordination-asymmetric — see Slide 6 discussion. Three — agent ecosystem fragmentation slower than expected. Mitigated by the three-thesis convergence — Base, Nous, Anthropic all confirm the timing."

**"Why Turkey?"**
> "Founder is Turkey-based. Time-zone overlap with EU + Asia is operationally favorable. Cost structure runway-favorable. Phase 2 hiring is location-agnostic — talent over geography."

**"How does this differ from EigenLayer-style staking-based AVS?"**
> "EigenLayer secures execution; SkillOS verifies capability. Different layers, complementary. An AVS could use SkillOS as the capability oracle for an agent-validator slashing condition. Phase 3+ optionality."

**"What's your relationship with the Anthropic/Claude ecosystem?"**
> "We ship an MCP server that conforms to the Anthropic-published standard. The X15 demo runs through Claude as one of the canonical agents. No formal partnership. The 'Powered by Claude' badge is on our roadmap to apply for once Phase 2 mainnet is live — we don't claim partner status until Anthropic approves it."

---

## Delivery discipline

1. **Total run time:** target 8 minutes. Q&A separate.
2. **Pace:** ~120 words/min. Speaker notes above are pre-paced to this rate.
3. **Don't skip the honest-framing footnotes.** Slides 8 and 9 both contain "Phase 2 audit-gated" language. Say it out loud.
4. **No filler words.** "So, basically, what we're doing here" → cut. State the claim, give the evidence, move on.
5. **Pause after the L1 hook (Slide 1) and after the L1 close (Slide 12).** Let the substrate-stack visual breathe both times. The bookend is the whole point.
6. **If you go over time, cut Slide 7 down to a 30s table-read or skip Appendix-style detail in Slide 11.** Slides 1, 4, 6, 8, 9, 12 are non-negotiable.
