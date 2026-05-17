# X11.5 — Upgrade Path Documentation

## From 1-of-1 to 2-of-2

Add second signer to Safe Wallet via Safe UI:
1. Founder signs "add owner" transaction (current 1-of-1 threshold)
2. New signer address added
3. Threshold updated to 2
4. Both signers required for future owner-gated actions

**Effort:** ~1 hour Safe UI ceremony  
**Audit firm:** automatically detects new threshold via Safe contract state  
**No contract migration:** TournamentPool sees same Safe Wallet address

## From 2-of-2 to 2-of-3

Same Safe UI flow, add 3rd signer + keep threshold at 2.

## Signer succession scenarios

- **Signer compromise:** other signer initiates "remove + replace" via Safe UI (requires threshold)
- **Founder incapacitation:** depends on threshold + signer set; 1-of-1 transitional is single-point-of-failure, escalates upgrade urgency
- **Counsel turnover:** new counsel onboarded, owner change ceremony per above

## Recovery flow

Safe Wallet supports owner change via on-chain tx with threshold approval. No SDK recovery codes, no off-chain recovery hooks. The contract IS the recovery mechanism.

If all signer keys lost: ownership unrecoverable. Per CAUTION below.

## CAUTION

1-of-1 transitional is **architecturally a single-point-of-failure for Owner role**. Mitigations:
- Hardware wallet seed phrase backed up to 2 geographically distinct offline locations
- Signer wallet operational reserves separate from production assets
- Migration to 2-of-2 prioritized when blocker (counsel availability / advisor onboarding) resolves
- Per §2.7 "Single-EOA mainnet boot is architecturally rejected" — 1-of-1 Safe Wallet satisfies this via upgrade-path-documented architectural commitment, not via threshold itself
