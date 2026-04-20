# Skillbase

**On-chain skill competition infrastructure on Base.**

A non-custodial arcade where players stake USDC, compete in 20 HTML5 skill games,
and earn payouts on-chain via audited escrow contracts. Built as a Farcaster
MiniKit monorepo on Next.js 14, deployed on Base Sepolia.

## Overview

Skillbase is a platform for skill-based competitions where results settle
on-chain. Players enter daily tournaments (F1) or head-to-head challenges (F2)
with a USDC stake; EIP-712 signed score oracles settle winners through two
on-chain contracts — `ArcadePool` (daily leaderboard tournaments) and
`ChallengeEscrow` (non-custodial 1v1 challenges). 20 games ship on a shared
scoring protocol, unified design system, and AI coach layer.

## Architecture

```
skillbase/
├── apps/                   # 20 Next.js 14 mini-apps + landing
│   ├── 2048/ wordle/ snake/ ...  # each: MiniKit + Supabase + shared scoring
│   └── landing/            # skillbase.games marketing site
├── contracts/              # Foundry — ArcadePool.sol, ChallengeEscrow.sol
├── packages/               # Shared scoring/signing/types
├── designs/                # Design-token source (20 games + skillui)
├── supabase/               # Migrations + RLS policies
├── scripts/                # Tournament setup, daily payout cron, meta generators
└── prompts/                # AI coach + daily challenge prompts
```

Each game is an independent Next.js deployment. Shared logic (EIP-712 scoring,
session auth, design tokens) lives in `packages/` and is consumed via workspace
symlinks.

## Getting Started

### Prerequisites
- Node.js 18+, npm 8+ (workspaces)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- Supabase project + Base Sepolia RPC

### Install
```bash
npm install                                      # all 20 apps + packages
cp apps/2048/.env.example apps/2048/.env.local   # fill in secrets per app
```

### Dev
```bash
npm run dev:2048          # single app
cd contracts && forge build && forge test
```

## Project Status

Submission to **Base Batches 003 — Student Track** (April 2026).

Focus areas:
- **F1:** Daily tournaments + 3-tier leaderboard payout cron — shipped
- **F2:** Non-custodial `ChallengeEscrow` (1v1 async duels) — shipped
- **F3:** Cross-game season pass + Farcaster social layer — in progress

## Contracts (Base Sepolia · chainId 84532)

| Contract | Address |
|----------|---------|
| `ChallengeEscrow` | `0x52e5E45456DeC882048b430a968Cda6061575be0` |
| `ArcadePool`      | `0xe3f93950F97e1698DC14d5D79324E3c2BA9ACcec` |
| USDC (testnet)    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Mainnet deployment pending audit + Base Batches review.

## License

MIT — see [LICENSE](./LICENSE).

## Built By

[Simpl3 Inc.](https://simpl3.xyz) — 2025.
