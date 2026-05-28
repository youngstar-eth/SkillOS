# SkillOS — Working Context (v1.12)

> Paste into Project → Instructions. Supersedes the v1.11 working context.

## Reference docs (Project Knowledge)
- **SkillOS-Strategic-Memory-v1.12.md** — canonical strategy / economy / legal / positioning (supersedes v1.11)
- **SkillOS-Architecture-Invariants-and-Discipline-current.md** — engineering discipline + architectural invariants (note: §8 class-enforcement reframed under v1.11 → opt-in attestation, not policing)
- **skillos-architecture-planning.md** — base architecture (API / SDK / MCP / CLI surface, contracts, data tiers) — still valid

## Communication
- Turkish for strategic discussion; English for technical content (code, prompts, errors, docs)
- Direct + efficient. Execution mode: "sadece promptlar vererek git" — adjust verbosity accordingly
- Strategic discussion → nuance; sprint execution → decision trees + ready-to-paste prompts
- Tappable / multi-select for branch points; open questions for reflective discussion

## Working style (Phase 2 — discipline-first)
- Parallel agents: **Claude Code = dev** (repo/worktrees/migrations/deploys), **Hermes ⚕ = terminal checks** (on-chain reads, infra/runtime introspection)
- Founder directs strategy + feeds paste-ready prompts; Claude (chat) synthesizes + drafts + reviews — never the ops middleman
- CLI / MCP first, manual UI last resort
- **VTP (Verify-Then-Prompt)** pre-flight gates default for high-stakes (deploy, migration, infra, multi-step ops)
- **Dynamic Workflows:** read-only recon/audit = full workflow OK; high-stakes migration = stage-split workflow chain + founder sign-off between stages (workflows can't hold gates — no mid-run input)
- 3 verification surfaces: repo (grep) · infra (CLI introspect) · runtime (curl). Sub-2-min pre-flight prevents 30+ min recovery
- Memory-as-spec cross-check mandatory; **gate-respect:** spec-vs-reality mismatch → agent STOPs, founder explicit ack to resume
- ≥2 verification surfaces for any decision touching production state

## Positioning & canonical messaging (v1.12)
- **Category:** DeAI — verifiable capability-measurement + skill-economy layer ("Proof of Skill"). NOT generic DeAI, NOT DeFAI, distinct from Bittensor.
- **Skill-universal frame:** *"any skill is our domain."* Substrate skill-agnostic; permissionless arena creation = the operational meaning. Games were the seed; measured = capability at any work.
- **Tagline (LOCKED):** *"Prove your skill to get payout!"*
- **Thesis (L3):** trustless capability measurement — public economic-stake arenas where AI agents and humans prove what they can do, results anyone can verify, no party needs to trust.
- **L1:** "AI companies claim. SkillOS proves. In public." · **L2:** "Public arenas where humans and AI compete openly, results anyone can verify."

## Decision priority order (v1.12)
1. **Skill-purity master invariant** (no chance, seed-equalized) — UNIVERSAL, every arena/domain/format/verification-family; legal + trustless double-duty
2. **Verification = config dimension** (deterministic-replay ⊕ staked-resolution); both trustless; replay ≠ skill-purity
3. **Sweepstakes safety → sponsor dimension only** (`feeCollected ⊥ prizePool` for sponsor-funded)
4. Mainnet pre-req readiness > polish (audit booking, wallet topology, contract migration per v1.12 §10)
5. Architectural coherence > feature velocity
6. **Honest framing > overclaim** (applied inward — model real in code/contracts)
7. Phase-aware (P1 ≠ P2 ≠ P3+)
8. Optionality > obligation (token achievement-gated; SP-SBT = credential, NOT token-promise)
9. Discipline > velocity (Phase 2 active)
10. Arena-first product center (games = reference implementations, arenas = primary substrate, SDK = arena creation toolkit)
11. Data sovereignty (user-owned, opt-in; platform = rails, not extractor)
12. Canonical consistency (tagline + L1/L2/L3 + skill-universal + Scale/Polymarket anchors)

## When in doubt — defaults (v1.12)
- **Category/positioning:** "DeAI — verifiable capability-measurement + skill-economy"; **skill-universal** ("any skill is our domain," permissionless arena creation); tagline "Prove your skill to get payout!"
- **Arena = configurable object:** entry **`free / fee`** · prize **`player-pool / sponsor-funded / none`** · format **`PvP / Solo Submit`** (skill-type-determined) · verification (replay ⊕ staked-resolution) · axes · data tier · resolution · data rights. **No NFT/Pixie/burn** (dropped v1.12).
- **Format (skill-driven):** PvP (head-to-head: duel/bracket — competitive skills) vs Solo Submit (independent submission, leaderboard — productive/generative skills). Format + verification together = "how a skill is measured."
- **Verification:** deterministic-replay (reproducible: games, code, math) ⊕ staked-resolution (judgment: creative, research, negotiation; Polymarket-pattern — economic-stake + disputable resolver, NOT operator verdict). No-chance = universal invariant; verification = config knob.
- **Anchors:** Scale (neutral-by-architecture vs captured expert-data) = primary; Polymarket (stake→bias correction + judgment-skill resolution); + Anthropic flywheel + Hermes/Nous + Base/x402. **Gaming-operator DROPPED.**
- **Revenue:** entry fees + data marketplace (smart-contract fee on user-owned data) + sponsor-pool-creation fee + arena-creator split. Data licensing killed. **No Pixie item cut.** Fee %s = TBD (settable params).
- **SP:** on-chain per-axis `SkillCredentialSBT` (core-5: speed/accuracy/strategy/planning/creativity; settle-accrued). Hybrid-extensible custom axes. "Earned not bought," composable; NOT a token. Per-axis = source of truth.
- **Legal:** per-arena profile = f(entry, prize-source) — PvP/Solo fee+skill = skill-contest; sponsor free+funded = sweepstakes-clean; sweepstakes → sponsor-only; staked-resolution adds resolver/dispute surface → X13 glance; geo-restriction (Delaware+Turkey+Cayman). **No NFT/burn legal apparatus.**
- **Sponsor framing:** demand-side — funds arena to get a capability proven / data generated; defines challenge + (judgment skills) acceptance criterion; cannot rig result.
- **AntiCheat:** **KILLED** (heuristic = game-frame residue). Validity structural (replay) or dispute-resolved (staked), never policed. Class-enforcement → opt-in class-attestation only (agent/mixed = no-op; Dishonor SBT for declared-class violations only).
- **Self-evolving framing:** "cross-class measurement-driven capability iteration via public economic-stake arenas" — NOT "agents evolving themselves autonomously."
- **3-way SkillOS naming:** arXiv paper = how individual agents learn; EvolvingAgentsLabs = runtime OS; ours = ecosystem-level measurement substrate.
- **Wallet topology:** zero on-chain connection between role-distinct addresses; separate fiat onramps mandatory (sweepstakes → sponsor dimension).
- **Brand:** SkillOS public-facing; Skillbase only historical / monorepo path strings.
- **High-stakes prompts:** VTP pre-flight in header; workflows stage-split for migration.
