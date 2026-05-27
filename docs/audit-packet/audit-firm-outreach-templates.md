# SkillOS Audit Firm Outreach — Mail Templates v1

**Date:** 2026-05-17
**From:** inanc@simpl3.ai
**Strategy:** Parallel outreach to 4 firms — 2 tier-1 (Trail of Bits, OpenZeppelin) + 2 tier-2 (Spearbit, Cyfrin). Tier-1 contract-only scope (their strength + premium timeline); tier-2 contract + critical off-chain scope (more flexibility + faster engagement).

**Deferred decisions (revisit before send):**
- CC strategy (legal counsel, advisor — currently signed as solo founder)
- Turkey-based solo founder framing weight — currently honest but not lead-with

---

## TEMPLATE 1 — Trail of Bits

**To:** info@trailofbits.com (or via https://www.trailofbits.com/services/smart-contracts/ contact form)
**Subject:** Audit engagement inquiry — SkillOS skill-gaming substrate, Base mainnet pre-launch

```
Hello Trail of Bits team,

I'm reaching out to inquire about smart contract audit engagement for
SkillOS — a permissionless skill-gaming substrate built on Base — ahead
of our Q3 2026 mainnet launch.

What SkillOS is, briefly: a sweepstakes-safe on-chain attestation primitive
that lets developers ship skill-based games with verifiable tournaments,
class-agnostic participation (humans + agents under the same primitive),
and permissionless sponsor-funded prize pools. Architecturally, we segregate
fee accumulators from prize pools at the storage layer (sweepstakes safety
as a structural invariant, not a policy), and consume Base + Coinbase
infrastructure standards rather than reinventing them (ERC-5192 soulbound
receipts, ERC-8004 agent identity, ERC-8021 builder code attribution,
ERC-8128 per-request agent signing, x402 micropayments for paid data
endpoints).

Audit scope requested: smart contract package
(TournamentPool v2.1 → v2.2, SponsorshipModule, SponsorReceiptSBT,
SkillbaseAnchor, ChallengeEscrow). Lines of code: ~2,800 Solidity excluding
tests. 207 Foundry tests on dual-profile configuration, currently green
on `main`. Pre-audit hardening complete: 2 critical findings resolved
during our UR Pass 1 self-audit (May 16-17), 0 Critical / 0 High in the
contracts track itself, 3 Medium items already scoped into v2.2 remediation
(unbounded loop → PullPayment, EIP-191/712 schema consolidation, emergency
withdrawal timelock).

Packet ready to share under NDA:
- UR Pass 1 audit-prep reports (4 parallel review tracks)
- CR1 codebase reality pass synthesis (May 17)
- STRIDE-style threat model (full-stack scope, 9 components)
- Wallet topology with role-distinct architecture + mainnet rotation discipline
- Architecture supplement v1.4 (sprint sequencing + invariants)
- Foundry test suite + coverage report

Timeline: ideal start window late Q2 2026 (June-July) to support Q3
mainnet activation. Open to adjusting based on your availability.

Budget: prepared for premium-tier engagement in the standard ToB range
for a project of this scope; specific number open for discussion.

Could we schedule an intro call to walk through the architecture and
discuss fit? Calendly or your preferred scheduling channel works.

Best,
Inanc Ayvaz
Founder, SkillOS (Simpl3 Inc.)
inanc@simpl3.ai
https://skillos.network
GitHub: github.com/youngstar-eth/SkillOS
```

---

## TEMPLATE 2 — OpenZeppelin

**To:** security@openzeppelin.com (or via https://www.openzeppelin.com/security-audits contact form)
**Subject:** Smart contract audit inquiry — SkillOS, sweepstakes-safe gaming infrastructure on Base

```
Hi OpenZeppelin team,

I'd like to discuss audit engagement for SkillOS — a Base-native
permissionless skill-gaming protocol — ahead of our Q3 2026 mainnet
target.

Project context: SkillOS is positioned as skill-economy infrastructure
for self-evolving agents. Phase 1 testnet shipped May 17, 2026 (UR Pass 1
+ Tier 0 hotfixes). Audit firm slot booking initiated for Phase 2 mainnet
readiness. The core architectural commitment is sweepstakes safety
enforced at contract storage layout — fee accumulators (`feeCollected`)
and prize pools (`prizePool`) live in segregated slots, with prize pools
fundable only through permissionless `sponsorPool()` calls. The protocol
extends standard OpenZeppelin patterns (Ownable, ReentrancyGuard, ECDSA
verification) and integrates several ERCs (5192 for soulbound sponsor
receipts, 8021 for builder code dataSuffix attribution, 8128 for
per-request agent signing via the SIWA standard).

We'd like to engage OpenZeppelin specifically because of your reviewer
strength on standard-compliance and governance design. We have several
v2.2 design questions where your judgement would be material —
particularly around the migration from EIP-191 to EIP-712 with ERC-6492
unwrapping for smart wallet compatibility (M-2 from our self-audit), and
the multi-sig owner transition design for our X11.5 mainnet boot ceremony.

Audit scope requested: contract package
(TournamentPool v2.1 → v2.2, SponsorshipModule, SponsorReceiptSBT,
SkillbaseAnchor, ChallengeEscrow). Optionally extending to deployment
script + multi-sig configuration review. Roughly 2,800 lines Solidity
excluding tests. 207 Foundry tests, dual-profile config, all green on
`main` post our UR Pass 1 audit-prep pass.

Pre-audit posture: comprehensive self-audit completed May 16-17 across
contracts, off-chain stack, frontend, and infrastructure. Contract track
returned 0 Critical / 0 High / 3 Medium / 8 Low. Medium items scoped into
v2.2 remediation. Threat model + wallet topology + sprint sequencing
documentation ready to share under NDA.

Timeline: looking at start window late Q2 — early Q3 2026 (June-August)
for mainnet activation in Q3.

I'd appreciate the chance to discuss fit, scope detail, and your
availability window. Happy to walk through the architecture and current
audit-prep state in a 30-min intro call.

Best,
Inanc Ayvaz
Founder, SkillOS (Simpl3 Inc.)
inanc@simpl3.ai
https://skillos.network
GitHub: github.com/youngstar-eth/SkillOS
```

---

## TEMPLATE 3 — Spearbit

**To:** intake via https://spearbit.com/contact or Cantina platform listing
**Subject:** Audit inquiry — Foundry-native skill-gaming substrate, Base mainnet pre-launch Q3 2026

```
Hi Spearbit team,

Reaching out about audit engagement for SkillOS — a Base-native permissionless
skill-gaming protocol with a Q3 2026 mainnet target.

The short version: we're a Foundry-native repo (207 tests on dual profile,
all green), pre-mainnet, with a comprehensive self-audit complete this
weekend. Looking for an external review that closes the gap between our
audit-prep state and audit-firm-approved state. Spearbit's reviewer
network model + Cantina platform fits our timeline better than the typical
3-6 month tier-1 lead time.

Scope: smart contract package (TournamentPool v2.1 → v2.2, SponsorshipModule,
SponsorReceiptSBT, SkillbaseAnchor, ChallengeEscrow) plus critical off-chain
surfaces where attack vectors connect to contract state — specifically
SIWA agent auth (ERC-8128 per-request signing), x402 paid-data tier
endpoints, and the cron broadcaster topology. Approximately 2,800 lines
Solidity + ~1,500 lines critical off-chain TypeScript.

Pre-audit hardening complete: UR Pass 1 (May 16-17) returned 0 Critical /
0 High in contracts, 3 Medium items scoped into v2.2 remediation
(PullPayment migration, EIP-712 + ERC-6492 consolidation, emergency
withdrawal timelock). Off-chain track had 2 Critical (1 resolved same day
with auth gate, 1 in Phase 2 sprint for rate limiter infrastructure) and
9 High findings, 6 of which are queued in pre-mainnet sprints we'll close
before audit kickoff.

What I can share under NDA:
- UR Pass 1 reports (4 tracks) + CR1 codebase reality pass synthesis
- STRIDE threat model (9 components, full-stack scope)
- Wallet topology with mainnet rotation discipline
- Architecture supplement v1.4 with sprint sequencing

Timeline: looking for June-July 2026 start window. Open to your scheduling.

Budget: tier-2 range expected, open to scope adjustment.

Could we set up a 20-30 min call to discuss fit and walk through the
architecture briefly?

Best,
Inanc Ayvaz
Founder, SkillOS (Simpl3 Inc.)
inanc@simpl3.ai
https://skillos.network
GitHub: github.com/youngstar-eth/SkillOS
```

---

## TEMPLATE 4 — Cyfrin

**To:** audits@cyfrin.io (or via https://www.cyfrin.io/audits contact form)
**Subject:** Audit inquiry — SkillOS protocol audit, Foundry-native, Phase 2 mainnet pre-req

```
Hi Cyfrin team,

I'd like to discuss audit engagement for SkillOS — a Base-native
permissionless skill-gaming substrate — ahead of our Q3 2026 mainnet
launch.

Why Cyfrin specifically: we're a Foundry-native shop. 207 tests on
dual-profile, all green on `main`. Static analysis pipeline (Slither,
Aderyn, 4naly3er, Solhint) integrated in CI. NatSpec coverage at 100% on
external/public functions. Coverage ≥85% per contract. Patrick's tooling
shapes how we work — wanted to engage you both because of the alignment
and because your turnaround is closer to our window.

The protocol: sweepstakes-safe (segregated storage slots for fees vs
prize pools), permissionless (anonymous sponsors fund any pool, soulbound
ERC-5192 receipts), class-agnostic (humans + agents under the same
attestation primitive), builder-attributed (ERC-8021 dataSuffix on every
transaction). We consume Base + Coinbase standards rather than reinvent
them — ERC-8004 agent identity, ERC-8128 per-request signing via SIWA,
x402 micropayments for paid-data tier endpoints.

Audit scope requested: contract package
(TournamentPool v2.1 → v2.2, SponsorshipModule, SponsorReceiptSBT,
SkillbaseAnchor, ChallengeEscrow) plus deployment scripts.
~2,800 lines Solidity excluding tests.

Pre-audit posture: comprehensive UR Pass 1 self-audit complete May 16-17.
Contract track: 0 Critical / 0 High / 3 Medium / 8 Low / 11 Info.
Medium items already scoped into v2.2 design constraints (PullPayment
migration, EIP-712 consolidation, emergency withdrawal timelock per X11
sprint). Three pattern locks captured during the audit-prep thread that
shape our pre-cutover discipline:
- Memory-as-spec drift detection (verify before assume)
- Wallet topology rotation (zero on-chain connection between role-distinct addresses)
- VTP discipline (high-stakes prompts verify state in pre-flight)

Packet ready to share under NDA includes:
- UR Pass 1 reports (4 parallel tracks) + CR1 synthesis
- STRIDE threat model + wallet topology
- Sprint sequencing through Phase 2 mainnet
- Foundry test suite + coverage breakdown

Timeline: looking for June-July 2026 start. Open to your availability.

Could we set up a 20-30 min intro call to walk through scope and discuss
your current bandwidth?

Best,
Inanc Ayvaz
Founder, SkillOS (Simpl3 Inc.)
inanc@simpl3.ai
https://skillos.network
GitHub: github.com/youngstar-eth/SkillOS
```

---

## Sending strategy

**Recommended sequence (parallel, all within 24-48h window):**

1. **Day 1 (today/tomorrow):** Send Templates 3 (Spearbit) + 4 (Cyfrin) first. Faster turnaround firms; their response shapes your tier-1 conversation. Use their pricing as anchor.

2. **Day 2:** Send Templates 1 (ToB) + 2 (OpenZeppelin). Tier-1 firms have longer queues; earlier outreach matters more.

3. **Tracking spreadsheet recommended.** Columns: firm, outreach date, first response date, NDA signed date, quote received, scope confirmed, slot booked, kickoff date.

**Response handling notes:**

- Tier-1 typical response: 5-10 business days for first acknowledgment; 2-4 weeks for NDA exchange + scoping call.
- Tier-2 typical response: 1-3 business days for first acknowledgment; 1-2 weeks for NDA + scoping.
- Expect 2-4 firms to come back with quotes. Compare on: scope coverage, lead time, fixed-price vs time-and-materials, deliverables format (PDF report + slide deck typically), revision rounds included.
- **DO NOT commit slot without legal review of audit firm engagement letter.** Boilerplate engagement letters often contain liability caps you'll want to negotiate.

**Pre-send checklist:**

- [ ] Update CC strategy (deferred)
- [ ] Confirm founder profile framing weight (deferred)
- [ ] Verify your email signature info (name spelling, social handles)
- [ ] Confirm willingness to NDA each firm separately
- [ ] Have packet artifacts ready in a shareable folder (Google Drive private, or 1Password share, or Dropbox link)
- [ ] Calendar availability for next 2 weeks blocked for scoping calls (30 min each, 4 calls minimum)

---

## Packet artifact checklist (to attach / link in follow-up)

Ready to share once NDA signed with each firm:

1. **Source code** — github.com/youngstar-eth/SkillOS at tagged commit (recommend creating `audit-baseline-v1` tag from current `main`)
2. **Foundry test suite + coverage report** — generated via `forge coverage --report lcov` and `forge test -vv` outputs
3. **Static analysis reports** — Slither, Aderyn, 4naly3er, Solhint outputs at audit-baseline commit
4. **UR Pass 1 audit-prep reports** — `docs/audit-prep/UR-PASS-1/` (4 tracks)
5. **CR1 codebase reality pass synthesis** — `docs/codebase-reality-pass1/SYNTHESIS.md`
6. **Threat model** — `skillos-threat-model.md` (this packet)
7. **Wallet topology** — `skillos-wallet-topology.md` (this packet)
8. **Architecture supplements** — v1.2, v1.3, v1.4 at `docs/architecture/supplements/`
9. **Architecture planning** — `docs/architecture/skillos-architecture-planning.md`
10. **Mainnet wallet rotation runbook** — forthcoming, drafted in P2-Pre-B sprint

---

**End of audit firm outreach mail templates v1.**
