# Skillbase V2

Async matchmaking 2048 duels on Base Sepolia.

Base Batches 003 Student Track submission.

Built by Simpl3 Inc.

## Status

Under active development. See `/docs` for full spec (coming soon).

## Quick start

```bash
cp .env.local.example .env.local   # fill in Supabase + signer values
npm install
npm run dev
```

Open <http://localhost:3000>. Health check: <http://localhost:3000/api/health>.

## Live x402 endpoints

Skillbase ships production x402-protected endpoints on Base Sepolia via the Coinbase CDP facilitator:

- `GET /api/public/data/sp-tier-distribution` — aggregate tier histogram ($0.01 USDC)
- `GET /api/public/data/decision-sample/{any,tier/1-4,tier/5-7,tier/8-plus}` — single verified decision trace, tier-filtered pricing ($0.01–$0.10 USDC)
- `GET /api/public/ai/coach-sample?game={slug}&score={int}` — AI Coach analysis ($0.05 USDC, rate-limited 30 req/min/IP)

All live at <https://2048.skillbase.games>. All discoverable via x402 Bazaar. See [`apps/2048/src/app/api/public/README.md`](apps/2048/src/app/api/public/README.md) for docs and [`scripts/x402-smoke.ts`](scripts/x402-smoke.ts) for the test agent script. On-chain proof at [`reports/x402-live-proof.md`](reports/x402-live-proof.md).
