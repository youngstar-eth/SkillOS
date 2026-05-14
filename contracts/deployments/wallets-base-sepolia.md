# Base Sepolia — role-distinct wallet registry

Mainnet-hygiene invariant: every privileged role on the v2.1 contract stack
binds to its own wallet, funded from an independent origin. No wallet-to-wallet
transfer between role-distinct wallets — that would link them on-chain and
defeat isolation. Private keys live in gitignored `contracts/.env*.local`
files, never committed.

## Contracts

| Contract | Address |
|---|---|
| TournamentPool (v2.1) | _see `contracts/deployments/sponsor-stack-base-sepolia.json`_ |
| ChallengeEscrow | `0x52e5E45456DeC882048b430a968Cda6061575be0` |

## Roles

| Role | Address | Origin | Notes |
|---|---|---|---|
| TournamentPool deployer | `0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe` | (fiat onramp #1) | v2.1 stack creator |
| ChallengeEscrow deployer/owner | `0x84F4610e2805A35B15388D6c2644f6a23E17960C` | (fiat onramp #2) | calls `setFeeVault` |
| trustedSigner | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` | (fiat onramp #3) | signs scores + duels |
| feeVault (post-X19b) | `0x455536e4bC148Eba4621d0AfB8EFD59e0654F596` | Base Sepolia faucet (Alchemy), 2026-05-14 | collects duel fees |

## Operations history

- **2026-05-14 — feeVault separated from trustedSigner (X19b).** Prior state
  violated the role-distinct invariant: `feeVault` and `trustedSigner` both
  pointed at `0xA24f9122…`. Fresh wallet generated locally via `cast wallet new`,
  funded via Base Sepolia faucet (separate origin, not a transfer), then
  rotated in via `setFeeVault` from the owner wallet.
  - tx: `0x5695e66272ab14624b25d344b283040d25a82e6fc475a0740def77651bff46ac`
  - block: `41439678`
  - explorer: https://sepolia.basescan.org/tx/0x5695e66272ab14624b25d344b283040d25a82e6fc475a0740def77651bff46ac
