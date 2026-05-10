# @skillos/app-2048

Next.js app for the 2048 duel + solo-tournament flow on Base Sepolia. Also
hosts the production x402-protected public API for agent-native access.

## Run locally

```bash
cp .env.local.example .env.local   # fill in Supabase + signer + CDP keys
npm install                         # from monorepo root
npm run dev -w @skillos/app-2048  # starts on :3000 by default
```

## Public (x402-paid) API

Six production endpoints under `/api/public/*`, protected by the
`withX402` higher-order handler in
[`src/lib/x402-handle.ts`](./src/lib/x402-handle.ts). Payment is verified
+ settled against the Coinbase CDP facilitator on Base Sepolia; all six
endpoints include Bazaar metadata (`discoverable=true`, category, tags)
for auto-discovery.

Full endpoint reference: [`src/app/api/public/README.md`](./src/app/api/public/README.md)

On-chain proof (tx hashes on BaseScan): [`../../reports/x402-live-proof.md`](../../reports/x402-live-proof.md)

Test agent (signs + retries all 6 routes from a funded wallet):
[`../../scripts/x402-smoke.ts`](../../scripts/x402-smoke.ts)
