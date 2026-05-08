# @skillbase/app-sponsor

Permissionless tournament prize-pool funding dashboard. Deployed at <https://sponsor.skillbase.games>.

Anyone with a wallet can fund any active SkillOS tournament prize pool on-chain via the `SponsorshipModule` contract. A soulbound `SponsorReceipt` SBT is minted per sponsorship.

## Run locally

```bash
cp .env.local.example .env.local   # fill in Supabase + sponsor module addresses
npm install                         # from monorepo root
npm run dev -w @skillbase/app-sponsor
```

## Routes

- `/` — active tournaments list (daily / weekly / monthly cycles)
- `/[tournamentId]` — per-tournament sponsorship form (USDC approve + sponsor)
- `/dashboard` — connected-wallet sponsorship history (reads `SponsorReceipt` SBT events)
- `/api/sponsor/tournaments` — active tournaments JSON, joined with sponsor counts
- `/api/sponsor/tournament/[id]/sponsors` — per-tournament sponsor list

The sponsor event indexer cron has moved to `apps/orchestrator` (PR #33).
This app now only serves UI + read APIs — no cron schedules.

## Deployment

- Production: <https://sponsor.skillbase.games>
- Vercel project: `skillbase-sponsor`

## Reference

See [`../../docs/sponsor-flow.md`](../../docs/sponsor-flow.md) for end-to-end architecture, contract addresses, and sanctions oracle setup.
