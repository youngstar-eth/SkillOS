# X11.5 — Multi-sig Deployment Sprint Plan

**Status:** Phase 2 mainnet pre-req (funding-independent)  
**Effort:** ~1 week  
**Strategic Q lock (May 18, 2026):** 1-of-1 founder transitional Safe Wallet

## Goal

Transition TournamentPool + SponsorshipModule + ChallengeEscrow Owner role from EOA (currently `0x3A4F9eB7fba1A0015A6f070259f3B9e883D95eEE` per chain-verified May 18) to multi-sig Safe Wallet at mainnet boot ceremony.

**Single-EOA mainnet boot is architecturally rejected per §2.7 invariant.** Even with 1-of-1 threshold, Safe Wallet provides upgrade path + audit posture upgrade vs raw EOA.

## Scope

1. Safe Wallet deployment scripts (Base Sepolia testnet rehearsal first; Base mainnet at cutover)
2. Signer ceremony design (hardware wallet flow, 1-of-1 with documented upgrade path)
3. Owner transfer rehearsal on testnet
4. Recovery flow documentation (signer compromise scenarios)
5. Audit packet update (wallet topology Safe Wallet row)

## Out of scope (this sprint)

- Actual mainnet deployment (post-sprint manual ceremony)
- Actual mainnet ownership transfer (post-sprint manual ceremony)
- Threshold > 1 (deferred to Phase 3+ advisor migration)

## Threshold rationale (1-of-1 transitional)

Per audit posture preferred 2-of-3, this sprint defers higher-threshold to:
1. Operational hız: solo founder ceremony per-tx friction unacceptable Phase 2 launch
2. Counsel availability: Turkish counsel timezone + response time = operational delay risk
3. 3rd signer identification: advisor not yet lands; Coinbase Custody / escrow service procurement = additional vendor decision

**Upgrade path documented in UPGRADE_PATH.md.** Safe Wallet UI supports threshold + signer additions post-deploy without contract migration.

## Cross-references

- architecture-doc-supplement-v1.5.md §2.7 (wallet rotation discipline)
- architecture-doc-supplement-v1.5.md §3.15 (chain-verified Owner state)
- docs/audit-packet/wallet-topology.md (wallet topology current state)
