# Sprint UR Pass 1 — Track C: Frontend Env Inventory (NEXT_PUBLIC_*)

**Branch:** `ur/track-c-frontend`
**Date:** 2026-05-17
**Scope:** apps/2048, wordle, sudoku, minesweeper, clicker, match3, sponsor, api (MAS monorepo) + skillbase-apex (separate repo).
**Method:** Read-only audit — no code changes.

---

## Executive summary

- **0 RED** items (no service-role keys, signing keys, JWT secrets, or write-granting tokens exposed as `NEXT_PUBLIC_*`).
- **4 YELLOW** items: 1 medium (latent foot-gun), 3 low/cosmetic (documentation hygiene).
- All Supabase keys exposed as `NEXT_PUBLIC_*` are anon/publishable keys under RLS — GREEN by design.
- Wallet keys (`STUDIO_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_TOKEN`, `ANTHROPIC_API_KEY` are all consumed via non-prefixed env names (verified via grep).
- No `process.env.SECRET_THING` reads from any client component anywhere in scope.

### Auditor-parity grep counts
- Monorepo: `grep -rn "process\.env\.NEXT_PUBLIC_" apps/ packages/` → **16**
- Apex (source only, excluding `.next/` build artifacts): **6** (12 raw, but 6 are inside `.next/server/chunks/*.js` build output — expected NEXT_PUBLIC embedding behavior, confirms only `NEXT_PUBLIC_SITE_URL` + Supabase pair actually inlined)

---

## Per-app inventory

### apps/2048

| Var name | Used in (file:line) | Class | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` | `apps/2048/src/app/api/admin/system-health/route.ts:76` | **YELLOW** | Server-side fallback after non-prefixed `BASE_SEPOLIA_RPC_URL` — but the `NEXT_PUBLIC_` prefix still causes Next to inline if set. See Y1. |
| `NEXT_PUBLIC_URL` | `apps/2048/src/components/AIRecap.tsx:45` | GREEN | Public site URL for share links. |
| `NEXT_PUBLIC_CHAIN_ID` | via `packages/contracts/src/addresses.ts:23` | GREEN | Chain ID 84532. |
| `NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS` | via `packages/contracts/src/addresses.ts:26` | GREEN | Public contract address. |
| `NEXT_PUBLIC_USDC_ADDRESS` | via `packages/contracts/src/addresses.ts:49` | GREEN | Public USDC token address. |
| `NEXT_PUBLIC_TOURNAMENT_POOL_V2_ADDRESS` | via `packages/contracts/src/addresses.ts:46` | GREEN | Public contract address. |
| `NEXT_PUBLIC_TOURNAMENT_POOL_ADDRESS` | via `packages/contracts/src/addresses.ts:33` | GREEN | Legacy v1 (rollback). |
| `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS` | via `packages/contracts/src/addresses.ts:111` | GREEN | Public anchor contract. |
| `NEXT_PUBLIC_SUPABASE_URL` | via `packages/lib-shared/src/supabase.ts:15,40` | GREEN | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | via `packages/lib-shared/src/supabase.ts:16` | GREEN | Anon key under RLS. |

### apps/wordle / sudoku / minesweeper / clicker / match3

All five game apps share the same NEXT_PUBLIC consumption pattern (via `packages/contracts` + `packages/lib-shared`). The only per-app difference is `NEXT_PUBLIC_URL` fallback (`wordle.skillos.games`, `sudoku.skillos.games`, etc.).

| Var name | Used in | Class |
|---|---|---|
| `NEXT_PUBLIC_URL` | `apps/<game>/src/components/AIRecap.tsx:45` | GREEN |
| `NEXT_PUBLIC_CHAIN_ID` | via `packages/contracts/src/addresses.ts:23` | GREEN |
| `NEXT_PUBLIC_CHALLENGE_ESCROW_ADDRESS` | via `packages/contracts/src/addresses.ts:26` | GREEN |
| `NEXT_PUBLIC_USDC_ADDRESS` | via `packages/contracts/src/addresses.ts:49` | GREEN |
| `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS` | via `packages/contracts/src/addresses.ts:111` | GREEN |
| `NEXT_PUBLIC_SUPABASE_URL` | via `packages/lib-shared/src/supabase.ts:15,40` | GREEN |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | via `packages/lib-shared/src/supabase.ts:16` | GREEN |

### apps/sponsor

Sponsor has **zero direct `process.env.NEXT_PUBLIC_*` references in source** — all consumed transitively. Declared in `apps/sponsor/.env.local.example`:

| Var name | Used in | Class |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | via `packages/contracts/src/addresses.ts:23` | GREEN |
| `NEXT_PUBLIC_USDC_ADDRESS` | via `packages/contracts/src/addresses.ts:49` | GREEN |
| `NEXT_PUBLIC_TOURNAMENT_POOL_V21_ADDRESS` | via `packages/contracts/src/addresses.ts:83` | GREEN |
| `NEXT_PUBLIC_SPONSORSHIP_MODULE_ADDRESS` | via `packages/contracts/src/addresses.ts:88` | GREEN |
| `NEXT_PUBLIC_SPONSOR_RECEIPT_SBT_ADDRESS` | via `packages/contracts/src/addresses.ts:94` | GREEN |
| `NEXT_PUBLIC_SANCTIONS_ORACLE_ADDRESS` | via `packages/contracts/src/addresses.ts:100` | GREEN | Testnet mock; mainnet swaps to Chainalysis. |
| `NEXT_PUBLIC_SUPABASE_URL` | via `packages/lib-shared/src/supabase.ts:15,40` | GREEN |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | via `packages/lib-shared/src/supabase.ts:16` | GREEN |

### apps/api

Backend API app — server-only by design (Hono, not Next), but vendored contract addresses file reads NEXT_PUBLIC names.

| Var name | Used in (file:line) | Class | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `apps/api/src/lib/contracts-vendored/addresses.ts:23` | GREEN | Stylistic mismatch — see Y2. |
| `NEXT_PUBLIC_USDC_ADDRESS` | `apps/api/src/lib/contracts-vendored/addresses.ts:49` | GREEN | Same. |

`apps/api/.env.example` declares **no** `NEXT_PUBLIC_*` vars — yet the vendored file reads them. Not a security issue (no client bundle), but stylistically wrong.

### skillbase-apex (separate repo at `/Users/inancayvaz/skillbase-apex`)

| Var name | Used in (file:line) | Class | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `app/robots.ts:4`, `app/sitemap.ts:4`, `app/layout.tsx:25` | GREEN | Canonical public site URL. Declared in `.env.local.example`. |
| `NEXT_PUBLIC_API_BASE_URL` | `app/watch/page.tsx:18` | GREEN | `https://api.skillos.network`. **Not declared** in `.env.local.example` — Y4. |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase.ts:18` | GREEN | `/watch/[runId]` Realtime spectator. **Not declared** in `.env.local.example` — Y4. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.ts:19` | GREEN | Anon, RLS-gated. **Not declared** in `.env.local.example` — Y4. |
| `NEXT_PUBLIC_TALLY_PREMIUM_FORM_ID` | (declared in `.env.local.example`, **not referenced anywhere**) | DEAD | Y3 — obsolete or pending feature. |

---

## 🚩 RED findings

**None.**

Comprehensive negative checks performed:
- `grep -rn "process\.env\.\(STUDIO_PRIVATE_KEY\|AGENT_PRIVATE_KEY\|SUPABASE_SERVICE_ROLE_KEY\|ADMIN_API_TOKEN\|ANTHROPIC_API_KEY\)" apps/ packages/` returns server-only consumers; no `NEXT_PUBLIC_` prefix on any of these.
- No `NEXT_PUBLIC_*_PRIVATE_KEY`, `NEXT_PUBLIC_*_SECRET`, `NEXT_PUBLIC_*_TOKEN` anywhere.

---

## ⚠️ YELLOW findings

### Y1 — `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` prefix on a server-only RPC URL (medium, latent)

**Files (consumers are all server-side today):**
- `apps/2048/src/app/api/admin/system-health/route.ts:76`
- `packages/lib-shared/src/rpc.ts:34`

**Issue.** Fallback is `https://sepolia.base.org` (public, free). Today the value at runtime is likely the public endpoint and there is no leak. But the variable NAME is `NEXT_PUBLIC_*`, which means: if anyone ever sets it in Vercel to an Alchemy URL like `https://base-sepolia.g.alchemy.com/v2/<KEY>`, that key gets embedded in the client JS bundle of any app that transitively imports `packages/lib-shared` from a `"use client"` file. Today the import graph is clean (only server callers), but the protection is by convention, not by Next bundling rules. A future `"use client"` import of `getPublicClient` would silently exfiltrate the key on the next deploy.

Memory `reference_alchemy_base_sepolia_endpoint` already calls out the rotation plan; the variable-name rename is the missing piece.

**Fix.** Rename to `BASE_SEPOLIA_RPC_URL` (drop the `NEXT_PUBLIC_` prefix). Both consumer call sites already read the non-prefixed `BASE_SEPOLIA_RPC_URL` first (line 75 in 2048's route, line 33 in rpc.ts). Just drop the second-fallback line in both. Optional defense-in-depth: build-time assertion that throws if `process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` is set at all.

### Y2 — `apps/api` vendored addresses use `NEXT_PUBLIC_` prefix for non-Next backend (cosmetic)

**Files:** `apps/api/src/lib/contracts-vendored/addresses.ts:23,49`

apps/api is a Hono server, not a Next app — no client bundle. The prefix is harmless here but stylistically wrong. When trimming the vendored fork (or merging back to `@skillos/contracts`), the apps/api copy should read `CHAIN_ID` / `USDC_ADDRESS` (no prefix). Track via existing memory item `project_esm_consistency_pr` (post-X3 ESM cleanup PR).

### Y3 — `NEXT_PUBLIC_TALLY_PREMIUM_FORM_ID` declared but unused in apex (low, hygiene)

**File:** `/Users/inancayvaz/skillbase-apex/.env.local.example`

Documented in example but no source code references it. Either (a) wire up the premium-form feature, (b) delete the line, or (c) move to a `# TODO:` comment with a date.

### Y4 — Apex `.env.local.example` missing 3 NEXT_PUBLIC vars actually used (low, hygiene)

**Missing from `/Users/inancayvaz/skillbase-apex/.env.local.example`:**
- `NEXT_PUBLIC_API_BASE_URL` (used in `app/watch/page.tsx:18`)
- `NEXT_PUBLIC_SUPABASE_URL` (used in `lib/supabase.ts:18`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used in `lib/supabase.ts:19`)

Without these in the example file, a new contributor will hit the `/watch/[runId]` runtime throw on first attempt. The throw message in `lib/supabase.ts:30-32` correctly names both Supabase vars, so it's self-diagnosing — but the example file should be the source of truth. Auditors will ding it.

---

## Cross-cutting analysis

### Cross-app classification consistency
Every NEXT_PUBLIC_ var used in multiple apps has the **same classification** across all consumers. No drift detected:
- `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — uniformly GREEN across 7 apps + apex.
- `NEXT_PUBLIC_URL` — GREEN in all 6 game apps (each has own fallback domain).

### Declared-but-unused / used-but-undeclared
- `NEXT_PUBLIC_SKILLBASE_ANCHOR_ADDRESS` declared in 6 game `.env.local.example` files but **not** in `sponsor/.env.local.example`, even though `packages/contracts/src/addresses.ts:111` reads it unconditionally. Sponsor has no `/api/cron/anchor*` route today — empty default acceptable. Call out on review when adding new sponsor code paths that touch `SKILLBASE_ANCHOR_ADDRESS`.
- `NEXT_PUBLIC_TOURNAMENT_POOL_*` family documented only in sponsor's `.env.local.example`; the 6 game apps document only `CHALLENGE_ESCROW_ADDRESS` + `USDC` + `SKILLBASE_ANCHOR_ADDRESS`. `packages/contracts` exports v2.0/v2.1/sponsorship constants unconditionally with hardcoded fallbacks. Documentation drift, no runtime issue.

### Non-prefixed `process.env.X` in client components
**None found.** All `"use client"` files were grepped — only `process.env.*` reads in client components are:
- `process.env.NODE_ENV` in 6 `dev/game-test/page.tsx` files (auto-inlined by Next, safe).
- `process.env.NEXT_PUBLIC_URL` in 6 `AIRecap.tsx` files (GREEN, intended).

**No "client component reads `process.env.SECRET_THING`" footgun present.**

### Hardcoded sensitive patterns
- **Bearer tokens:** one hit in `apps/api/test/smoke-x2.ts:232` — literal `Bearer eyJhbGciOiJIUzI1NiJ9.bogus.bogus` in a smoke test. Not a real secret.
- **URLs with embedded `?key=` / Alchemy / Infura literals:** zero hits across apps/, packages/, apex.
- **Hardcoded `0x...` addresses in client-visible code:** all hits are public contract addresses (basescan link in `/legal/sweepstakes`, Farcaster manifest reference, a 64-char hash literal in `motion.tsx`). All safe.

---

## Pre-mainnet shortlist (env exposure)

1. **Y1** — rename `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` → `BASE_SEPOLIA_RPC_URL` to remove the latent client-leak foot-gun. Most pen-test-visible item; auditors will see the name and ask "why is the RPC URL prefixed public?" even though consumers are server-side today.
2. **Y4** — document the 3 missing NEXT_PUBLIC vars in apex `.env.local.example`. Trivial.

---

## Key files referenced

- `packages/contracts/src/addresses.ts` — central hub for NEXT_PUBLIC contract address vars
- `packages/lib-shared/src/supabase.ts` — central hub for NEXT_PUBLIC Supabase vars
- `packages/lib-shared/src/rpc.ts` — Y1 root site
- `apps/2048/src/app/api/admin/system-health/route.ts` — Y1 second site
- `apps/api/src/lib/contracts-vendored/addresses.ts` — Y2 site
- `/Users/inancayvaz/skillbase-apex/.env.local.example` — Y3 + Y4 site
- `/Users/inancayvaz/skillbase-apex/lib/supabase.ts` — apex Supabase consumer
