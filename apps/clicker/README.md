# @skillos/app-clicker

Next.js app for the Clicker solo-tournament flow on Base Sepolia. Per-app frontend; shared backend logic lives in `@skillos/duel-backend`.

## Run locally

```bash
cp .env.local.example .env.local   # fill in Supabase + signer + AI keys
npm install                         # from monorepo root
npm run dev -w @skillos/app-clicker
```

## Routes

- `/` — game canvas (solo + tournament entry)
- `/tournament/solo` — daily solo tournament entry
- `/tournament/solo/[runId]/result` — post-submit result page (renders `<AICoach />` + `<AIRecap />`, fires lazy on mount)
- `/api/tournaments/solo/[runId]/{coach,recap,plausibility}` — solo-flow API routes (delegate to `@skillos/duel-backend`)
- `/api/cron/{create,settle}-tournaments` — daily tournament lifecycle (gated on `CRON_SECRET`)

## Deployment

- Production subdomain: `clicker.skillos.games`
- Vercel project: `mas-clicker`
- Preview deploys: every PR to `main` builds an isolated preview URL — see Vercel dashboard for the latest.
