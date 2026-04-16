# Mini App Studio (MAS)

On-chain arcade for Base Batches — a monorepo of mini apps built with Next.js, Farcaster MiniKit, Supabase, and Foundry.

## Structure

```
MAS/
├── apps/
│   └── 2048/          # Next.js 14 · Base MiniKit · Supabase · Bauhaus design
├── contracts/         # Foundry — ArcadePool.sol
├── designs/           # Design token outputs (skillui, 20 games)
├── package.json       # npm workspaces root
└── .gitignore
```

## Apps

| App | Description | Status |
|-----|-------------|--------|
| [2048](./apps/2048) | Classic 2048 with on-chain score submission | ✅ Live |

## Contracts

| Contract | Network | Address |
|----------|---------|---------|
| ArcadePool | Base Sepolia (84532) | see `NEXT_PUBLIC_ARCADE_POOL_ADDRESS` in `.env.local` |

## Setup

### Prerequisites

- Node.js 18+
- npm 8+ (workspaces support)
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)

### Install

```bash
# Root — installs all workspace dependencies
npm install

# Copy env template and fill in secrets
cp apps/2048/.env.example apps/2048/.env.local
```

### Dev

```bash
# From root
npm run dev:2048

# Or directly
cd apps/2048 && npm run dev
```

### Build & Type-check

```bash
npm run build:2048
npm run typecheck:2048
```

### Contracts

```bash
cd contracts
forge build
forge test
```

## Env vars (apps/2048)

| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | Supabase anon key (RLS enforced) |
| `NEXT_PUBLIC_ARCADE_POOL_ADDRESS` | browser | Deployed ArcadePool contract |
| `NEXT_PUBLIC_CHAIN_ID` | browser | `84532` = Base Sepolia |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Bypasses RLS — never expose |
| `SCORE_SIGNER_PRIVATE_KEY` | server-only | EIP-712 oracle signer |
| `QUICK_AUTH_DOMAIN` | server-only | Farcaster Quick Auth domain |

## Roadmap

20 mini apps planned for MAS. Next: Wordle, Snake, Tetris.
