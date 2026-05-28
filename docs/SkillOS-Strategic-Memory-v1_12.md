# SkillOS — Strategic Memory v1.12

> **Status:** Canonical. **Supersedes v1.11.** Locked from the May 28 2026 refinement burst.
> **What v1.12 is:** v1.11 + two contained refinements — (1) **NFT/Pixie model dropped** (entry simplifies, prize sources narrow); (2) **format = PvP / Solo Submit**, skill-type-determined. Everything else in v1.11 (skill-universal frame, verification fork, anchors, SP, revenue rails, legal core, data sovereignty) stands.
> **Authority:** This is the spec. Model real across the project base. Verification discipline retained (VTP, gate-respect, memory-as-spec, triangulation; pairs with Architecture Invariants & Discipline current).

---

## 0. What v1.12 changes (headline)

1. **NFT / Pixie model DROPPED.** No burn-to-enter, no Item NFT, no Auction/Pack, no Vault. Entry = **free / fee** only. Prize source = **player-pool / sponsor-funded / none**. The cleaner skill-contest + sponsor-sweepstakes paths make the item apparatus a redundant legal hedge — removing it shrinks Phase 2 contract scope, audit surface, and legal surface, and is frame-coherent (item-burn = collectible-game residue, like AntiCheat).
2. **Format = PvP / Solo Submit — skill-type-determined.** The arena's shape is a function of the skill. PvP (head-to-head: 1v1 duel or bracket) for competitive/adversarial skills; Solo Submit (independent submission, leaderboard-ranked) for productive/generative skills. Pairs with the verification family (§3) — both skill-driven; together they define "how a skill is measured."

(v1.11 recap, unchanged: skill-universal substrate; verification = config dimension, deterministic-replay ⊕ staked-resolution; skill-purity = universal master invariant; AntiCheat killed; class-enforcement → opt-in attestation.)

---

## 1. Positioning & category

- **Category: DeAI** — verifiable capability-measurement + skill-economy layer ("Proof of Skill"). NOT generic DeAI, NOT DeFAI, distinct from Bittensor.
- **Skill-universal frame:** *"any skill is our domain."* Substrate skill-agnostic; **permissionless arena creation** = the operational meaning (Polymarket/Uniswap pattern). Games were the seed; measured = capability at any work (coding, research, agentic tool-use, negotiation, design — and games). Scale does this with human labelers, captured + extractive; SkillOS does it open + verifiable + participant-owned.
- **Tagline (LOCKED):** *"Prove your skill to get payout!"*
- **Thesis (L3):** trustless capability measurement infrastructure — public economic-stake arenas where AI agents and humans prove what they can actually do, with results no party needs to trust.
- **The gap:** capability is still a product *claim*, not a measurable feature. SkillOS = the measurement layer DeAI lacks, for **any** capability.

---

## 2. Anchors

- **Scale (primary):** Meta $14.3B / 49% captured it; Google/OpenAI/xAI fled over neutrality. SkillOS = neutral-by-architecture, can't be captured. Extraction (Scale owns + sells workers' data) vs ownership (participants own + get paid).
- **Polymarket:** economic stake → bias correction **+ the resolution mechanism for judgment-skills** (staked-resolution family, §3) — resolves "is this capability demonstrated?" via economic stake + dispute, not an operator verdict. A borrowed primitive.
- **Retained:** Anthropic flywheel externalized, Hermes/Nous, Base + x402.
- **Gaming-operator: dropped.** Crisis pattern = AI-native (trust-the-benchmark-lab + trust-the-captured-vendor).

---

## 3. Product model

- **Substrate = skill-arenas** (primary, any-skill). Games = reference implementations / seed. **SDK = arena creation toolkit.** Permissionless arena creation = killer feature + the operational meaning of "any skill."
- **Arena = configurable protocol object.** Config knobs:
  - **Entry:** free / fee  *(NFT-burn removed in v1.12)*
  - **Prize source:** player-pool (from fee entries) / sponsor-funded / none  *(item-sale removed in v1.12)*
  - **Format (skill-type-determined):** **PvP** (head-to-head — 1v1 duel or bracket; for competitive/adversarial skills) / **Solo Submit** (independent submission, leaderboard-ranked; for productive/generative skills)
  - **Verification family (skill-type-determined):** deterministic-replay ⊕ staked-resolution (see below)
  - **Capability axes credited** (+ scoring→SP mapping) — core-5 domain-general + arena-declared custom
  - **Data tier** (T0–T3)
  - **Resolution** (winner selection: highest-score / bracket-elim / threshold) — distinct from *format* (interaction structure) and *verification* (result validity)
  - **Data rights** (disclosed at entry; entering = opt-in consent)
  - → **Legal profile derives from config** (§5).
- **Format + verification = "how a skill is measured" (both skill-driven):**

  | Skill | Format | Verification |
  |---|---|---|
  | Coding | Solo Submit | deterministic-replay (tests pass) |
  | Speedrun / 2048 | Solo Submit (same seed, top score) or PvP | deterministic-replay |
  | Chess / competitive game | PvP | deterministic-replay |
  | Math | Solo Submit | deterministic-replay (check) |
  | Negotiation | PvP | staked-resolution |
  | Research / creative / design | Solo Submit | staked-resolution |

- **Verification families:**
  - **Deterministic replay** — reproducible/objective skills (games, code-passes-tests, math). Input log + equalized seed → result must deterministically reproduce. Substrate-enforced, fully trustless, cheapest (T2/T3). Scaffold exists (`game-2048.ts`).
  - **Staked resolution** — judgment/open-ended skills (creative, research, negotiation, design) with no deterministic oracle. Polymarket-pattern: economic-stake-backed, *disputable* resolver / market / sponsor-criterion — NOT an operator verdict. Trustless without determinism. **NEW design surface (§12), not built.**
  - Hybrid possible (objective sub-scores via replay + judged components via staked resolution).
- **Sponsor = demand-side.** Lab/company funds an arena to get a capability proven / data generated; defines the **challenge** + (for judgment skills) the **acceptance criterion**; cannot rig the **result**.
- **Hermes (Nous) integration:** self-evolving agent, MCP-native, agentskills.io-compatible, 20+ messaging platforms. Anchor #3 live + bidirectional.

---

## 4. Master invariant (unchanged from v1.11)

### 4a. Skill-purity (no-chance) — UNIVERSAL master invariant
> **Arenas are skill-pure: outcome reflects skill, not luck. Holds for EVERY arena, every skill domain, every format, every verification family.** Seed-equalized where randomness exists; judgment skills skill-pure if all entrants face the same conditions, judged on merit. A *built* property, not a claim.

### 4b. Verification method — CONFIG DIMENSION (not an invariant)
> Deterministic replay ⊕ staked resolution. **deterministic-replay ≠ skill-purity** — replay is the verification of the reproducible subset; skill-purity is the broader no-chance property all arenas satisfy.

---

## 5. Legal model (v1.12 — Pixie removed)

**Per-arena legal profile = f(entry, prize source):**

| Arena type | Entry | Prize source | Legal mechanism |
|---|---|---|---|
| PvP / Solo Submit | Entry fee | Player-funded pool | Skill-contest (no chance) — stake clean *because* skill; submit-and-best-wins is a valid contest structure |
| Sponsor tournament | Free entry | Sponsor-funded | Sweepstakes-clean (no consideration) + skill = double-clean |
| No-prize / SP-only | Free | — | No legal concern |

- **Skill-purity (no chance)** is the universal foundation that keeps stake legally clean. With NFT/Pixie removed, there are exactly **two clean prize paths** — player-pool (fee entry) and sponsor-funded — and neither needs the burn/item apparatus.
- **Sweepstakes → sponsor dimension only.** `feeCollected ⊥ prizePool` for the sponsor-funded portion.
- **Format note:** Solo Submit + prize = still skill-contest (submit-and-best-wins, like a photo/essay contest). Format does not change the legal profile.
- **Staked-resolution note:** verification family does not change the legal profile (still skill-contest, no chance), but the **resolver/dispute mechanism** is a new surface → X13 glance (resolver independence, dispute fairness).
- Residual = geo-restriction (Delaware + Turkey + Cayman) + agent dimension (X13).

---

## 6. SP → on-chain per-axis soulbound credential (unchanged)

- `SkillCredentialSBT` (ERC-5192 / soulbound-1155), per-wallet `axis → accrued SP`, settle-accrued (~0 marginal cost), non-transferable, composable.
- **Core-5 (P2):** speed, accuracy, strategy, planning, creativity (domain-general). **Hybrid-extensible (P2.5/3):** arena-declared custom axes — more central under "any skill."
- Incentive gradient: free play → SP; economic-staked → more SP. Aggregate = derived display; per-axis = source of truth. SBT = credential not token.

---

## 7. Revenue model (v1.12 — Pixie cut removed)

- **Entry fees** (PvP / Solo Submit) · **Data marketplace** (smart-contract fee on user-owned data/replays — replaces data licensing) · **Sponsor pool-creation fee**. Main.
- Arena-creator split. Fee %s = **TBD calibration** (build as *settable params*, not hardcoded).
- Data marketplace = pure-infra embodiment (monetize rails, never own data; anti-Scale).

---

## 8. Data sovereignty (unchanged)

- Fully user-owned, opt-in. Control = arena-selection + disclosed consent OR open-marketplace listing. Platform never owns/custodies.
- x402: (a) agent arena entry; (b) replay/data purchase for self-improvement.

---

## 9. Architecture deltas (cumulative; v1.12 changes in **bold**)

- Data licensing ✗ → data marketplace.
- ChallengeEscrow sunset → **PvP = bracket in TournamentPool; Solo Submit = submitScore path.**
- dev-split → arena creator (fee % TBD, settable param).
- Off-chain SP → on-chain per-axis SBT.
- Sweepstakes-everything → sponsor-dimension-only.
- Gaming-operator anchor dropped.
- Verification = arena config dimension (replay ⊕ staked-resolution); staked-resolution path = new design.
- AntiCheat (heuristic) KILLED — game-frame residue. Validity structural (replay) or dispute-resolved (staked), not policed. Class-enforcement → opt-in class-attestation only.
- **NFT / Pixie model DROPPED** — no Item NFT, Auction/Pack, Vault, or burn-to-enter. Entry = free/fee; prize = player-pool/sponsor. Removes the largest new-contract cluster + its legal gate from Phase 2.
- **Format = PvP / Solo Submit (skill-type-determined)** — was solo/duel-bracket.

---

## 10. Project-base migration impact map (v1.12)

> Redefines Phase 2 contract/code scope — not a new phase. NFT/Pixie removal materially shrinks it.

| Delta | Touchpoints | Phase | Notes |
|---|---|---|---|
| Arena = configurable object | Arena contract (entry/prize/**format**/axes/data-tier/verification/resolution) + API + DB | P2, audit | spine |
| Verification family | replay engine first-class (settle/SP path) + **staked-resolution path** (resolver/oracle/dispute) | P2, audit | deterministic exists (game-2048.ts); staked = new design |
| Format: PvP / Solo Submit | PvP = bracket in TournamentPool; Solo Submit = submitScore; ChallengeEscrow deprecate | P2, audit | |
| SP → per-axis SBT | SkillCredentialSBT (soulbound, settle-accrued, per-axis); core-5 | P2, audit | |
| Data marketplace | marketplace contract + fee + x402 | P2 | replaces /v1/data/* licensing |
| Data sovereignty | Supabase ownership flags + RLS + consent | P2 | |
| Sweepstakes narrowing | invariant rewrite (sponsor-dimension) | P2, audit | |
| Arena creator | DevAttribution → ArenaCreator + splitter | P2 | fee % settable |
| AntiCheat removal | delete heuristic stub; class-enforcement → opt-in attestation only | P2 | simplifies scope |
| ~~Pixie model~~ | **REMOVED** | — | Item NFT/Auction/Pack/Vault/burn cut entirely |
| Hermes integration | @skillos/mcp plugin/skill + agentskills.io | P2 | distribution |
| Positioning (skill-universal, verification fork, no-NFT, format) | apex, pitch, docs | now | |

---

## 11. Invariants (v1.12 set — unchanged from v1.11)

1. **Skill-purity (no-chance) — UNIVERSAL master:** outcome = skill not luck; seed-equalized; holds every arena/domain/format/verification-family.
2. **Verification = config dimension** (replay ⊕ staked-resolution); both trustless; a knob, not an invariant (replay ≠ skill-purity).
3. **Sweepstakes-safe storage → sponsor dimension only.**
4. **Pure infrastructure:** no custody, marketplace + verification, NOT extractor; substrate produces trustless results, doesn't police participants.
5. **Data sovereignty:** user-owned, opt-in.
6. **Permissionless:** arena creation, sponsorship, participation.
7. **Class-agnostic substrate:** human + agent same infra; class = opt-in attestation, not a policing axis.
8. **Honest framing > overclaim, inward too.**
9. **Optionality > obligation:** token achievement-gated; SP-SBT = credential, NOT token-promise.
10. **Discipline > velocity (Phase 2):** VTP, gate-respect, commit before lost.
11. **Canonical consistency** across surfaces.

---

## 12. Open items / TBD

- **Staked-resolution mechanism design:** resolver/oracle model, dispute flow, economic-stake parameters (Polymarket-pattern for judgment skills). Biggest new design surface.
- **Skill → format + verification classification:** heuristic for PvP vs Solo Submit and deterministic-replay vs staked-resolution (and hybrids).
- **Fee percentages** (settable params): arena-creator split, entry cut, marketplace fee, sponsor-creation.
- **Cross-arena axis normalization.**
- **X13 counsel:** skill-predominance, agent dimension, resolver/dispute fairness, geo-restriction (Delaware + Turkey + Cayman). *(Pixie defensibility removed — Pixie dropped.)*
- **Per-axis P2.5/3 extensibility** (custom axes + registry).
