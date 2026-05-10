# @skillos/lib-shared

Cross-cutting utilities used by both server-side handlers (`@skillos/duel-backend`) and per-app code.

## What's here

- `src/supabase.ts` — `getSupabaseBrowser()` (anon, RLS-enforced, client-safe) and `getSupabaseService()` (service-role, server-only). Single client per process.
- `src/http.ts` — `withCronAuth()` HOF for cron route handlers (verifies `Authorization: Bearer ${CRON_SECRET}`); `softError()` helper for graceful API failure responses.
- `src/attestation.ts` — EIP-712 signature builders for settle + walkover (used by `STUDIO_PRIVATE_KEY` server-side).
- `src/rpc.ts` — `getPublicClient()` viem client with chain-aware fallbacks (Base Sepolia, optional `BASE_SEPOLIA_RPC_URL` override).
- `src/seed.ts` — deterministic match-id seed helpers.

Plus type re-exports from `@skillos/game-types` for convenience.

## Usage

```ts
import { getSupabaseService, withCronAuth } from "@skillos/lib-shared";

export const POST = withCronAuth(async (req) => {
  const supabase = getSupabaseService();
  // …
});
```

## Environment

Reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optionally `BASE_SEPOLIA_RPC_URL`, and `CRON_SECRET`.
