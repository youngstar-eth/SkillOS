# @skillos/app-api

Public read-only HTTP API for SkillOS — `https://api.skillos.network`.

Stack: **Hono** + **@hono/zod-openapi** (OpenAPI 3.1) + **Zod** + **viem** on Vercel Node functions. Schema-first: every request/response shape is a Zod schema, every endpoint registers its route, and the OpenAPI spec is the single source of truth for both runtime validation and the docs UI.

> Sprint X2 scope (current): adds SIWB human auth + bearer-gated `/v1/scores POST`. Read endpoints unchanged from X1. Sponsor write endpoint deferred to X4. SIWA agent auth deferred to X4. x402 paywalled tier deferred to X5. See `docs/architecture/developer-surface.md` §3.1 / §4 for the full layered plan.

---

## Endpoints (v1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/health` | — | liveness + version + chain id |
| GET | `/v1/tournaments` | — | paginated tournament list |
| GET | `/v1/tournaments/:id` | — | single tournament state |
| GET | `/v1/tournaments/:id/leaderboard` | — | paginated score history (desc) |
| GET | `/v1/scores/:wallet` | — | submission history for a wallet |
| GET | `/v1/sponsors/:wallet/receipts` | — | ERC-5192 SBT receipts owned by wallet |
| **POST** | **`/v1/auth/siwb/nonce`** | — | issue 5-min SIWE nonce |
| **POST** | **`/v1/auth/siwb/verify`** | — | verify SIWE → 24h bearer JWT |
| **POST** | **`/v1/scores`** | **Bearer** | submit score (T0 tier, signature-only) |
| GET | `/openapi.yaml` | — | OpenAPI 3.1 spec (YAML) |
| GET | `/openapi.json` | — | OpenAPI 3.1 spec (JSON) |
| GET | `/docs` | — | Stoplight Elements documentation UI |

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

## SIWB authentication flow (X2)

End-to-end flow for human writes (POST /v1/scores). EOA wallets and Base Account smart wallets both supported — viem's `verifyMessage` handles ERC-6492 wrapping transparently for undeployed counterfactual smart wallets.

```bash
# 1. Request a nonce
NONCE_RESPONSE=$(curl -sS -X POST https://api.skillos.network/v1/auth/siwb/nonce \
  -H 'Content-Type: application/json' \
  -d '{"walletAddress":"0x1234567890abcdef1234567890abcdef12345678"}')
echo "$NONCE_RESPONSE" | jq
# → { "nonce": "abc123...", "issuedAt": "2026-05-10T...", "expiresAt": "2026-05-10T...+5min" }

# 2. Build SIWE message client-side, sign with wallet
#    (wagmi: useSignMessage; viem: walletClient.signMessage)
#    Message format (EIP-4361, alphabetic order shown):
SIWE_MSG="skillos.network wants you to sign in with your Ethereum account:
0x1234567890abcdef1234567890abcdef12345678

URI: https://skillos.network
Version: 1
Chain ID: 84532
Nonce: <NONCE_FROM_STEP_1>
Issued At: 2026-05-10T...
"
SIG="0x..." # from wallet

# 3. Verify → bearer JWT
TOKEN_RESPONSE=$(curl -sS -X POST https://api.skillos.network/v1/auth/siwb/verify \
  -H 'Content-Type: application/json' \
  -d "{\"message\":\"$SIWE_MSG\",\"signature\":\"$SIG\",\"walletAddress\":\"0x...\"}")
echo "$TOKEN_RESPONSE" | jq
# → { "token": "eyJhbGc...", "sessionId": "<uuid>", "expiresAt": "...+24h" }

BEARER=$(echo "$TOKEN_RESPONSE" | jq -r .token)

# 4. Submit a score (T0 tier — server signs but does NOT validate plausibility)
curl -sS -X POST https://api.skillos.network/v1/scores \
  -H "Authorization: Bearer $BEARER" \
  -H 'Content-Type: application/json' \
  -d '{
    "tournamentId": "0xbb0e...dc4c",
    "score": 1844,
    "matchCountDelta": 1,
    "tier": "T0"
  }'
# Response headers:
#   X-SkillOS-Tier: T0
#   X-SkillOS-Verification: signature-only
# Body:
#   { "txHash": "0x...", "soloRunId": "0x...", "submittedAt": "...", "tier": "T0" }
```

### Trust tier — what `/v1/scores` does and doesn't do

**Sprint X2 ships T0 only.** The server signs whatever score the bearer-authenticated wallet claims. There is **no** plausibility validation. External developers and agents using this API path operate at lower trust intentionally — the architecturally-locked `SubmissionTier` (T0–T3) reflects this trade-off: T0 = "score-only minimum, no validation", T2/T3 = replay-verifiable.

Game-app frontends (`2048.skillos.games`, `wordle.skillos.games`, etc.) keep using their own per-game backends in `packages/duel-backend`, which DO run AI plausibility (`@skillos/ai-coach`). Real users on real game UIs are not affected by the API path's trust hole.

**Pre-mainnet hard blocker (Phase 2 housekeeping):** Tournaments with real-USDC prize pools must require T1+ before they can accept submissions via `/v1/scores`. Tracking memory: `project_phase2_mainnet_blocker_plausibility.md`.

### Auth error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `AUTH_NONCE_NOT_FOUND` | No record of that nonce for the given wallet |
| 400 | `AUTH_NONCE_EXPIRED` | Nonce older than 5 minutes |
| 400 | `AUTH_NONCE_CONSUMED` | Nonce already used (replay attempt) |
| 400 | `AUTH_SIGNATURE_INVALID` | SIWE message malformed, domain/chainId mismatch, or signature failed verify |
| 400 | `AUTH_BEARER_MISSING` | No Authorization header on a write endpoint |
| 400 | `AUTH_BEARER_INVALID` | Authorization header malformed or JWT verification failed |
| 400 | `AUTH_BEARER_EXPIRED` | JWT past `exp` claim (re-sign SIWE for fresh token) |
| 400 | `RATE_LIMITED` | 60/min per-wallet cap exceeded on `/v1/scores` |
| 400 | `TIER_NOT_IMPLEMENTED` | Submission tier T1+ requested (only T0 in X2) |

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

### Read-path (X1)

| Var | Required | Purpose | Example |
|---|---|---|---|
| `BASE_SEPOLIA_RPC_URL` | optional | viem public client RPC. Defaults to `https://sepolia.base.org`. | `https://sepolia.base.org` |
| `SPONSOR_INDEXER_DEPLOY_BLOCK` | recommended | Lower bound for `eth_getLogs` scans (TournamentPool deploy block). Without it, scans default to deploy-block constant. | `40851426` |
| `API_VERSION` | optional | Returned by `/v1/health`. Defaults to package.json version. | `0.1.0` |
| `VERCEL_GIT_COMMIT_SHA` | auto | Vercel-injected. Used as `commit` in `/v1/health`. | `abc1234` |

### Write-path (X2 NEW — required for `/v1/auth/*` and `/v1/scores`)

| Var | Required | Purpose | Provisioning |
|---|---|---|---|
| `JWT_SECRET` | **yes** | HS256 secret for bearer JWTs. ≥32 chars. Per-env, never reused across testnet/mainnet. | Generate `openssl rand -hex 32`; add via `vercel env add JWT_SECRET production --scope simpl3s-projects` |
| `SUPABASE_URL` | **yes** | Already in monorepo env. | Inherits from existing project env |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | RLS-bypassing key for nonce CRUD. Treat as high-trust. | Inherits from existing project env |
| `STUDIO_PRIVATE_KEY` | **yes** | Trusted signer for `submitSoloScore` attestations. MUST equal the `trustedSigner` address on TournamentPool v2.1 (`0xA24f9122568e98b72f4dDD61119C7D92D0975692` on Base Sepolia). NEVER log this. | `vercel env add STUDIO_PRIVATE_KEY production --scope simpl3s-projects` |
| `SIWE_DOMAIN` | optional | Domain expected in SIWE messages. Defaults to `skillos.network`. Override for local dev. | `vercel env add SIWE_DOMAIN production --scope simpl3s-projects` |

### Provisioning the X2 secrets in production

The founder runs the following in their own terminal (so the secret values stay with the founder, not the agent):

```bash
# JWT_SECRET — generate fresh per environment
JWT_SECRET=$(openssl rand -hex 32)
echo "$JWT_SECRET" | vercel env add JWT_SECRET production --scope simpl3s-projects

# STUDIO_PRIVATE_KEY — paste the same key apps/orchestrator and packages/duel-backend use
vercel env add STUDIO_PRIVATE_KEY production --scope simpl3s-projects
# (paste private key when prompted; do NOT echo)

# SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (inherit from one of the existing apps' env)
vercel env pull .env.production.local --scope simpl3s-projects --environment production --git-branch main
# Copy values from a sibling app's pulled env (e.g., mas-orchestrator) and add to this project:
vercel env add SUPABASE_URL production --scope simpl3s-projects
vercel env add SUPABASE_SERVICE_ROLE_KEY production --scope simpl3s-projects

# Verify (agent can run this — only shows variable names, not values)
vercel env ls --scope simpl3s-projects | grep -E 'JWT_SECRET|STUDIO_PRIVATE_KEY|SUPABASE'
```

### Database migration

X2 introduces one new Supabase table: `skillos_auth_nonces`. The migration file lives in this PR at `supabase/migrations/v2_20260510_auth_nonces.sql`. Apply via either:

```bash
# Option A — Supabase CLI (preferred; updates supabase_migrations audit table)
cd /Users/inancayvaz/MAS
supabase db push

# Option B — Supabase dashboard SQL editor
# 1. Open https://supabase.com/dashboard/project/<id>/sql
# 2. Paste contents of supabase/migrations/v2_20260510_auth_nonces.sql
# 3. Run
```

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
