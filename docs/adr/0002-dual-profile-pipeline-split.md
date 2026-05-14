# ADR 0002 — Dual-Profile Foundry Pipeline Split

**Status:** Accepted (X19a.2, PR #85)
**Date:** 2026-05-14
**Deciders:** Founder + audit-prep agent session
**Related:** `contracts/PIPELINE_PARITY_AUDIT.md`, PR #85, sprint X19a/X19a.2

## Context

Phase 1 testnet contracts on Base Sepolia were deployed across two distinct compile-pipeline lineages, and a single `foundry.toml` cannot reproduce both byte-for-byte:

1. **Pre-X19a generation (5 contracts, deployed 2026-04-29):** `TournamentPool v2.1`, `SponsorshipModule`, `SponsorReceiptSBT`, `MockSanctionsOracle`, `SkillbaseAnchor`. All compiled with `via_ir = false`. Confirmed via Blockscout's verified `compiler_settings`.
2. **X19a generation (`ChallengeEscrow`, deployed 2026-04-19):** Compiled with `via_ir = true`. Confirmed via Blockscout's verified `compiler_settings` at `0x52e5E45456DeC882048b430a968Cda6061575be0`.

`ChallengeEscrow` was deployed earlier in calendar time but from a different worktree (no broadcast artifact exists in this repo; remappings on the verified record include `@uniswap/v4-*` paths absent from this monorepo's foundry config). It is the chronological exception, not the canonical pre-X19a deploy.

PR #85 v0 pinned the default profile to `via_ir = true` to fix ChallengeEscrow verify reproducibility. The Phase 1 pipeline-parity audit (`contracts/PIPELINE_PARITY_AUDIT.md`) then showed this pin is *inverted* for the other 5 contracts: under the new default, none of them rebuild to matching bytecode.

The audit firm contracted for Phase 2 mainnet requires byte-reproducible builds from canonical source for every deployed contract. A single-profile config cannot serve both generations.

## Decision

Adopt a dual-profile `foundry.toml`. The **default profile** matches the X19a generation (ChallengeEscrow + every future deploy). A new **`phase1-legacy` profile** matches the 5 pre-X19a sponsor-stack contracts.

```toml
[profile.default]                  # ChallengeEscrow + all Phase 2 / future deploys
via_ir = true
evm_version = "cancun"
bytecode_hash = "ipfs"
# ...solc 0.8.26, optimizer 200, standard remappings

[profile.phase1-legacy]            # Pre-X19a sponsor-stack (5 contracts)
via_ir = false                     # KEY DIFF
out = "out-phase1-legacy"          # separate artifact dir, no clobber
# ...everything else identical to default
```

Both profiles share solc version, optimizer runs, evm_version, bytecode_hash, and remappings. The single observed difference is `via_ir`.

## Migration cutoff

`ChallengeEscrow` (deploy block 40308226, address `0x52e5…5be0`) is the **canonical start of the `via_ir = true` era**. Every contract deployed after this — including all Phase 2 mainnet contracts — uses the default profile. Every contract deployed before, including the 5 sponsor-stack contracts at block 40851426 despite being chronologically *later* in wall-clock time, falls under `phase1-legacy`.

The cutoff is by **deployment pipeline lineage**, not deployment date. The classification is fixed once a contract is on chain; never reclassify a deployed contract.

## Usage

Forge subcommands respect the `FOUNDRY_PROFILE` environment variable; explicit `--profile <name>` is supported on some subcommands and serves as documentation when present.

### Build

```bash
# ChallengeEscrow + new Phase 2 work
forge build --force

# Re-build any of the 5 legacy contracts (e.g. for audit-firm submission)
FOUNDRY_PROFILE=phase1-legacy forge build --force
# artifacts land in out-phase1-legacy/, leaving out/ untouched
```

### Verify on Blockscout

```bash
# ChallengeEscrow — already verified; re-submission is a no-op
forge verify-contract --verifier blockscout \
  --verifier-url 'https://base-sepolia.blockscout.com/api/' \
  --rpc-url https://sepolia.base.org \
  --compiler-version 0.8.26 --watch \
  0x52e5E45456DeC882048b430a968Cda6061575be0 \
  src/ChallengeEscrow.sol:ChallengeEscrow \
  --constructor-args 0x000000…

# Any pre-X19a legacy contract — set FOUNDRY_PROFILE first
FOUNDRY_PROFILE=phase1-legacy forge verify-contract --verifier blockscout \
  --verifier-url 'https://base-sepolia.blockscout.com/api/' \
  --rpc-url https://sepolia.base.org \
  --compiler-version 0.8.26 --watch \
  <legacy-address> src/<Contract>.sol:<Contract> \
  --constructor-args <abi-encoded>
```

## Audit-firm hand-off

The Phase 2 audit firm receives one tuple per deployed contract:

| Contract | Address | Profile | Source pin |
|---|---|---|---|
| ChallengeEscrow | `0x52e5…5be0` | `default` | `src/ChallengeEscrow.sol` @ HEAD |
| TournamentPool v2.1 | `0x52049b…02da` | `phase1-legacy` | `contracts/audit-sources/TournamentPool.v21.sol` (extracted from commit `eb2bc0d`) |
| SponsorshipModule | `0xD76670…ff87` | `phase1-legacy` | `src/SponsorshipModule.sol` @ HEAD (no drift; archive copy at `audit-sources/SponsorshipModule.v21.sol`) |
| SponsorReceiptSBT | `0xCCC183…e768` | `phase1-legacy` | `src/SponsorReceiptSBT.sol` @ HEAD (no drift; archive copy at `audit-sources/SponsorReceiptSBT.v21.sol`) |
| MockSanctionsOracle | `0x0CB38F…B1CC` | `phase1-legacy` | `src/MockSanctionsOracle.sol` @ HEAD (no drift) |
| SkillbaseAnchor | `0x9d033b…064ca` | `phase1-legacy` | `src/SkillbaseAnchor.sol` @ HEAD (no drift) |

`TournamentPool v2.1` is the only contract with source drift: HEAD `src/TournamentPool.sol` carries unmerged v2.2 WIP (PRs #49–#55, commits `c004c18 → 9a2580d`) that was never deployed. The audit firm must build from `contracts/audit-sources/TournamentPool.v21.sol`, not from HEAD `src/`.

For each contract the firm should produce a standard-JSON input matching that row's profile, recompile, and confirm byte-equality against on-chain at every position outside `immutableReferences` (constructor-set values are exempt; see `reference_blockscout_verify_diagnosis_playbook.md` for the immutables-aware diff method).

## Future-deploy decision tree

```
Is this a NEW deployment going to chain?
├── YES → default profile. via_ir = true. No exceptions.
│   This applies to every Phase 2 mainnet deploy, every future testnet
│   deploy after 2026-05-14, and every redeploy of an existing contract.
└── NO — verifying / reproducing an EXISTING on-chain contract
    │
    Was the contract deployed BEFORE 2026-04-19 (ChallengeEscrow)?
    ├── No, or ambiguous → query Blockscout's compiler_settings JSON
    │   first. Trust on-chain over wall-clock.
    └── Yes → phase1-legacy profile.
```

When Phase 2 mainnet redeploys land and all Base Sepolia `phase1-legacy` contracts are retired, the `[profile.phase1-legacy]` block becomes safe to delete. Until then it is load-bearing: any unrelated PR that removes it breaks audit reproducibility.

## Consequences

**Positive:**
- Audit firm receives a single canonical config per contract, no per-PR negotiation.
- Future engineers see the dual-profile pattern in `foundry.toml` and the ADR explains why without git-blame archaeology.
- `out-phase1-legacy/` keeps legacy artifacts isolated; `forge clean` on default profile doesn't nuke them.
- The default-profile mainnet trajectory is uncontaminated by legacy pipeline settings.

**Negative:**
- Anyone re-verifying a legacy contract MUST remember to set `FOUNDRY_PROFILE=phase1-legacy`. Without it, the verify silently fails ("already verified" if the prior record exists, or a confusing bytecode-mismatch error otherwise). This is documented in `reference_blockscout_verify_diagnosis_playbook.md` and called out at the top of `contracts/PIPELINE_PARITY_AUDIT.md`.
- Two artifact directories exist (`out/`, `out-phase1-legacy/`); CI rules or other tooling that assumed a single output path need a one-line update.

**Reversibility:**
- Cheap. To collapse back to a single profile post-Phase 2 mainnet (after all `phase1-legacy` contracts are retired), delete the `[profile.phase1-legacy]` block and the `out-phase1-legacy/` directory. Update this ADR's Status to Superseded with a pointer to the consolidating ADR.
