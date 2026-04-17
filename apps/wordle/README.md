# 2048 on Base — Mini App

Next.js 14 App Router · Base MiniKit · Supabase · Bauhaus design system.

## API routes

All write endpoints require a Farcaster Quick Auth `Bearer` token (from the
MiniKit client). Reads are public.

### POST `/api/user/upsert`

Creates or updates a `users` row keyed by wallet address. The Quick Auth
token's `sub` (FID) is always authoritative — if the body also supplies `fid`
it must match or the request is rejected.

```bash
curl -X POST http://localhost:3000/api/user/upsert \
  -H "Authorization: Bearer <quickauth-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    "fid": 12345,
    "username": "alice",
    "displayName": "Alice",
    "pfpUrl": "https://example.com/pfp.png"
  }'
# 200 { "success": true, "userId": "<uuid>" }
# 400 invalid_wallet | 401 missing_bearer/invalid_token | 403 fid_mismatch
```

### POST `/api/score`

Persists a finished game and returns an EIP-712 signature the client can
pass to `ArcadePool.submitScore(…)`. The server looks up the player's
wallet from the `users` table (keyed by FID from the token) — the client
never picks the signed address.

```bash
curl -X POST http://localhost:3000/api/score \
  -H "Authorization: Bearer <quickauth-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "tournamentId": 1,
    "score": 2048,
    "maxTile": 2048,
    "moves": 512,
    "durationMs": 183000,
    "won": true,
    "grid": [[2,4,8,16],[32,64,128,256],[512,1024,2048,0],[0,0,0,0]]
  }'
# 200 { "sessionId", "signature", "nonce", "signer", "player", "score",
#       "tournamentId", "chainId", "contract" }
# 400 invalid_score | 401 missing_bearer | 404 user_not_found | 500 signer_failed
```

### GET `/api/leaderboard`

Public; reads from the `leaderboard` view.

```bash
curl "http://localhost:3000/api/leaderboard?limit=10&offset=0"
# 200 { "entries": LeaderboardRow[], "total": n, "limit": 10, "offset": 0 }
```

## EIP-712 domain (must match the deployed contract)

```
name             = "ArcadePool"
version          = "1"
chainId          = 84532   (Base Sepolia — from NEXT_PUBLIC_CHAIN_ID)
verifyingContract = <NEXT_PUBLIC_ARCADE_POOL_ADDRESS>

struct Score {
  uint256 tournamentId;
  address player;
  uint256 score;
  uint256 nonce;          // 128 bits of session UUID, left-padded to 256
}
```

## Env

See `.env.example`. Anything prefixed `NEXT_PUBLIC_*` is shipped to the
browser; everything else is server-only. In particular:

- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS, server-only.
- `SCORE_SIGNER_PRIVATE_KEY` — the EIP-712 signer; whatever address it
  derives must match the oracle address whitelisted in the on-chain
  `ArcadePool`.
- `QUICK_AUTH_DOMAIN` — domain the JWT `aud` claim must match. Blank
  falls back to the request `Host` header.
