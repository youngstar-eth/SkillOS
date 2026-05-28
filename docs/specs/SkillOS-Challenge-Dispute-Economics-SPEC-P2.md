# SkillOS — Challenge & Dispute Economics SPEC (Phase 2)

> **Status:** Draft for founder lock. **Child of** Settlement & Verification SPEC §3 + Δ11.
> **Scope:** the ONE economic mechanism behind the optimistic-challenge settlement layer, serving BOTH verification families. Replay-challenge economics + staked-resolution dispute economics, unified.
> **Calibration discipline:** all parameter VALUES = settable params, TBD (like fee %s). This SPEC fixes the MECHANISM, not the numbers.

---

## 1. Unified state machine (economic events)

```
claim {result, evidence, optional claimer-bond}
   → challenge window (T, family-specific)
       ├─ no challenge → FINALIZE → SP credit + prize eligible
       └─ challenge {challenger-bond} → adjudicate → PAYOUT
                                                       loser's bond/stake → winner + protocol cut (+ optional burn)
```

One state machine · one bond/stake accounting · two pluggable adjudication functions (replay re-exec | staked re-judge) · one payout rule. Families differ only in adjudication + parameters.

---

## 2. Replay-family economics (objective · self-policed · light)

Adjudication is objective + cheap (re-run `verify(seed,inputLog)`), so the economics stay light:

- **Claimer bond = value-threshold.** No bond for low/no-prize claims (a fraudulent claim just fails replay → rejected → entry wasted, no extra slash). Bond required only when the claim competes for prize value above a settable threshold → fraud slashes it.
- **Challenger bond = small anti-spam.** Correct challenge → recovers bond + claimer-bond share + protocol bounty. Wrong challenge → bond burned/forfeit.
- **Self-policing:** competitors are the natural challengers (a fraudulent top score steals their prize → they're incentivized to fraud-prove). Substrate only guarantees *"anyone can fraud-prove"*; minimal external reward needed.
- **Window:** short (verification is fast).

**Settable params:** value-threshold, claimer-bond curve, challenger anti-spam bond, window length, bounty.

---

## 3. Staked-family economics (subjective · the frontier)

### 3a. Design principle — shrink the subjective surface
Wherever possible, the sponsor's **acceptance criterion is made outcome-checkable** ("research that predicts held-out data," "negotiation reaching price < $X"). Outcome-checkable ⇒ collapses to objective resolution ⇒ skips the subjective-jury problem. **Subjective-jury is the FALLBACK, only when truly unavoidable.**

### 3b. Adjudication model (phased)
- **Bootstrap = A (sponsor-resolver + dispute→panel):** sponsor is first-pass judge against their own criterion; a disputed resolution escalates to an independent staked panel. Used while the SP-resolver pool is thin.
- **North-star = D (SP-weighted + USDC-staked native resolver set):** resolvers must hold relevant-axis SP above a threshold (proven domain capability → credible judge) AND stake USDC. Dispute escalates to a larger SP-weighted + higher-stake set; being outvoted by the escalated set → slash. Evolve A→D as per-axis SP density grows.

### 3c. SP + USDC roles (native tie-in)
- **SP = reputation WEIGHT** (soulbound, non-transferable → cannot be economically staked, but gates + weights who may judge). Relevant-axis SP = credible-judge signal.
- **USDC = economic STAKE** (slashable → accountability/skin-in-game).
- Together: *those who proved a skill judge that skill, held accountable by stake.* Prover→judge flywheel — reuses the credential layer for free.

**Settable params:** resolver SP threshold (per axis), resolver USDC stake, dispute window, escalation tiers, reward/slash split, panel size.

---

## 4. Locked decisions

| # | Decision | Value |
|---|---|---|
| 1 | Replay claimer-bond | **Value-threshold** (bond only above a prize threshold; below = competitor-policed only) |
| 2 | Staked adjudication model | **D north-star / A bootstrap, phased** (A→D as SP density grows) |
| 3 | SP-weighting in resolution | **Yes** — relevant-axis SP gates + weights resolvers (native flywheel) |
| 4 | Slashed bond/stake split | **Challenger reward + protocol cut (+ optional burn)** — exact split = settable param |

---

## 5. Parameter surface (settable — calibration TBD)

All values build as governance-/config-settable, not hardcoded: replay value-threshold · claimer-bond curve · challenger anti-spam bond · replay window · replay bounty · resolver SP threshold (per axis) · resolver USDC stake · dispute window · escalation tiers + panel sizes · reward/slash split + protocol cut + burn %. *(Same discipline as v1.12 fee %s.)*

---

## 6. Risks & honest notes

- **Bootstrap trust (phase A):** sponsor-resolver-first is closer to *"trusted sponsor + dispute escape hatch"* than fully trustless. Honest framing for the bootstrap phase; the dispute layer is the trust-minimizer, and D is the trustless target. Do not claim full trustlessness for judgment skills during phase A.
- **Sybil / collusion (phase D):** SP-threshold gate + USDC stake + random selection from the eligible set mitigate, but resolver-collusion on high-value disputes is a real attack surface → escalation tiers + economic-stake size must scale with value-at-stake. Open design.
- **Appeal-spiral cost:** unbounded escalation = griefing vector → cap escalation tiers; each tier raises both stake and panel size (cost-to-attack > value-at-stake).
- **The subjective floor:** §3a shrinks it, but some skills resist outcome-checkability; for those, judgment quality is bounded by resolver quality — SP-gating is the lever.

---

## 7. Reconciliation

- This is **one economic mechanism for both families** — the unification drawn at the Settlement boundary. Replay = objective adjudication + light economics; staked = subjective adjudication + heavier economics; same state machine, bond accounting, payout rule.
- Reconciles with **Settlement & Verification SPEC §3** (optimistic + challenge) — this SPEC IS its economic layer.
- Closes the **v1.12 §12 "biggest new design surface"** at the mechanism level; numeric calibration + the per-axis resolver bootstrapping remain.
- Feeds: Δ11 build (staked-resolution) + the settlement-layer build (challenge-window economics) — both derive parameters from here.
