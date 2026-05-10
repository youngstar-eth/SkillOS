# @skillos/app-api

Public read-only HTTP API for SkillOS — `https://api.skillos.network`.

Stack: **Hono** + **@hono/zod-openapi** (OpenAPI 3.1) + **Zod** + **viem** on Vercel Node functions. Schema-first: every request/response shape is a Zod schema, every endpoint registers its route, and the OpenAPI spec is the single source of truth for both runtime validation and the docs UI.

> Sprint X1 scope: read-only endpoints only. No auth, no writes, no x402. See `docs/architecture/developer-surface.md` §3.1 / §4 for the full layered plan.

---

## Endpoints (v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/health` | liveness + version + chain id |
| GET | `/v1/tournaments` | paginated tournament list |
| GET | `/v1/tournaments/:id` | single tournament state |
| GET | `/v1/tournaments/:id/leaderboard` | paginated score history (desc) |
| GET | `/v1/scores/:wallet` | submission history for a wallet |
| GET | `/v1/sponsors/:wallet/receipts` | ERC-5192 SBT receipts owned by wallet |
| GET | `/openapi.yaml` | OpenAPI 3.1 spec (YAML) |
| GET | `/openapi.json` | OpenAPI 3.1 spec (JSON) |
| GET | `/docs` | Stoplight Elements documentation UI |

All paths return a JSON error envelope on failure: `{ error: { code, message, details? } }`.

Every response includes an `X-Request-Id` header (echoed if the client provided one, otherwise generated server-side).

## Curl examples

```bash
# health
curl -sS https://api.skillos.network/v1/health | jq

# list tournaments (paginated, max 50)
curl -sS 'https://api.skillos.network/v1/tournaments?limit=20' | jq

# single tournament (id is bytes32, hex-encoded with 0x prefix)
curl -sS https://api.skillos.network/v1/tournaments/0xabcd...1234 | jq

# tournament leaderboard (sorted desc by score, paginated)
curl -sS 'https://api.skillos.network/v1/tournaments/0xabcd...1234/leaderboard?limit=10' | jq

# scores for a wallet
curl -sS https://api.skillos.network/v1/scores/0x1234...5678 | jq

# sponsor receipts for a wallet
curl -sS https://api.skillos.network/v1/sponsors/0x1234...5678/receipts | jq

# OpenAPI spec
curl -sS https://api.skillos.network/openapi.json | jq '.openapi'
# → "3.1.0"
```

## Local development

```bash
# from monorepo root
npm install
cd apps/api
cp .env.example .env.local      # set BASE_SEPOLIA_RPC_URL and SPONSOR_INDEXER_DEPLOY_BLOCK
npm run dev                     # tsx watch on :3000
npm run typecheck               # tsc --noEmit
npm run smoke -- http://localhost:3000   # run smoke suite against any base URL
```

## Environment variables

| Var | Required | Purpose | Example |
|---|---|---|---|
| `BASE_SEPOLIA_RPC_URL` | optional | viem public client RPC. Defaults to `https://sepolia.base.org`. | `https://sepolia.base.org` |
| `SPONSOR_INDEXER_DEPLOY_BLOCK` | recommended | Lower bound for `eth_getLogs` scans (TournamentPool deploy block). Without it, scans default to `earliest` — slow on cold cache. | `21500000` |
| `API_VERSION` | optional | Returned by `/v1/health`. Defaults to package.json version. | `0.1.0` |
| `VERCEL_GIT_COMMIT_SHA` | auto | Vercel-injected. Used as `commit` in `/v1/health`. | `abc1234` |

## Deployment (Vercel)

The Vercel project is provisioned in scope `simpl3s-projects` with name `mas-api` (matches existing app naming). The project is pre-linked to this directory; from `apps/api`:

```bash
vercel --prod      # production deploy
vercel             # preview deploy
```

### DNS (founder action)

Custom domain: **`api.skillos.network`**. Add the following CNAME record at the GoDaddy DNS for `skillos.network`:

| Record type | Host | Points to | TTL |
|---|---|---|---|
| `CNAME` | `api` | `cname.vercel-dns.com.` | 600 (raise to 3600 once stable) |

After the record is added, in the Vercel dashboard for the `mas-api` project: Settings → Domains → Add → `api.skillos.network`. Vercel will auto-issue a Let's Encrypt certificate within 1–10 minutes after CNAME propagation.

Verify:

```bash
dig api.skillos.network CNAME +short
# → cname.vercel-dns.com.

curl -I https://api.skillos.network/v1/health
# → HTTP/2 200
```

## Architecture notes

**Why chain-direct, not Supabase:** The TournamentPool contract has no on-chain enumeration of tournaments (mapping by id, no array). The canonical pattern would be an event-driven indexer; that's post-YC backlog. For Sprint X1, the API queries `TournamentCreated`, `ScoreSubmitted`, and `Transfer` events directly via `viem.getContractEvents()`, bounded by `SPONSOR_INDEXER_DEPLOY_BLOCK`. Trade-offs:

- **Pro:** No DB dependency, stateless, no indexer drift.
- **Con:** Each `/v1/tournaments` request issues an `eth_getLogs` scan from deploy block. Public Base Sepolia RPC handles this fine at current volumes (single-digit tournaments, low traffic). Mainnet path will switch to an indexer.

**Pagination is opaque cursor-based.** Clients pass back `?cursor=<base64>` from a previous response's `pagination.next`. The cursor encodes either a block-tx position (for events-based queries) or an array index (for in-memory slice). Limit is capped at 50 per page across all endpoints to bound RPC fanout.

**Function size:** Predicted bundle ~3 MB gzipped against Vercel's 250 MB cap. Stoplight Elements served via CDN (`unpkg`), not bundled.
