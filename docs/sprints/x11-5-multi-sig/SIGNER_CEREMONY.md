# X11.5 — Signer Ceremony Design (1-of-1 transitional)

## Hardware wallet requirement

Even at 1-of-1, signer key must be hardware-isolated. Acceptable devices:
- Ledger Nano S Plus / X
- Trezor Model T / Safe 5
- GridPlus Lattice1
- Foundry Foundry-managed HSM (audit firm acceptable)

**Hot wallet (MetaMask seed in browser) is rejected for mainnet ownership.**

## Pre-ceremony checklist (founder, before any contract action)

- [ ] Hardware wallet acquired + initialized
- [ ] Seed phrase backup verified (test recovery once on separate device)
- [ ] Seed phrase storage secured (offline, ideally 2 geographically distinct locations)
- [ ] Signer wallet funded with operational ETH (≥0.1 ETH Base mainnet for tx fees)
- [ ] Signer wallet ETH source = fresh fiat-onramp (no transfer history from existing SkillOS wallets per §2.7 invariant #2)

## Ceremony sequence (testnet rehearsal first)

### Phase A: Testnet rehearsal (Base Sepolia)

1. Deploy Safe Wallet on Base Sepolia via `contracts/scripts/x11-5/deploy-safe-1of1.sh`
2. Owner: hardware wallet address (testnet-specific, NOT same as future mainnet wallet)
3. Threshold: 1
4. Transfer testnet TournamentPool ownership from current Owner (`0x3A4F9eB7...`) to Safe Wallet
5. Verify via `cast call <pool> "owner()(address)"` returns Safe Wallet address
6. Test owner-gated function call routes through Safe Wallet UI

### Phase B: Mainnet ceremony (post-sprint, post-funding-window)

1. Deploy Safe Wallet on Base mainnet
2. Owner: hardware wallet address (mainnet-specific, fresh fiat-onramp origin)
3. Threshold: 1
4. Transfer mainnet TournamentPool ownership (post-X11 v2.2 deploy)
5. Verify on-chain
6. Document final addresses in audit-packet/wallet-topology.md

## Upgrade path triggers (future)

Move from 1-of-1 to higher threshold when ANY of:
- Advisor onboarded with signer responsibility commitment
- Audit firm pre-mainnet review recommends specific threshold
- Counsel availability profile shifts (e.g., dedicated retainer with response SLA)
- TVL crosses threshold (proposed: $1M USDC) requiring higher operational security
