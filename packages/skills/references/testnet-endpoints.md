# references/testnet-endpoints.md

Canonical Base Sepolia (Phase 1) testnet contract addresses and API endpoints. Lookup-only — for the **why** and integration patterns, see [`tournament-flow.md`](./tournament-flow.md) and [`auth-patterns.md`](./auth-patterns.md).

## Chain

- **Network:** Base Sepolia (testnet)
- **chain_id:** `84532`
- **RPC:** `https://sepolia.base.org`
- **Explorer:** `https://base-sepolia.blockscout.com` (canonical for raw_input verification — see [`../prompts/verify-attribution-live.md`](../prompts/verify-attribution-live.md))
- **Mainnet:** **NOT YET** — Phase 2-gated, audit-pending. Do NOT point developers at Base mainnet endpoints today.

## Core contracts

| Contract | Address | Purpose |
|---|---|---|
| `TournamentPool` (v2.1) | `0x52049b812780134d2F69D6c20C2ef881D49702da` | Solo + duel tournaments, prize-pool segregation, settle |
| `SponsorshipModule` | `0xD76670adB574A4C8D06dfF47127e7143d780ff87` | Permissionless `sponsorPool(tournamentId, amount)` flow |
| `SponsorReceiptSBT` | `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` | Non-transferable receipt token for sponsor attribution |
| `MockSanctionsOracle` | `0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC` | Testnet stand-in for production sanctions gate |
| `SkillbaseAnchor` | `0x9d033b3A9aD12955222169b21c8cD487D84064CA` | Foundation registry, agent identity anchor |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | Prize pool currency |

All addresses are verified on Blockscout. Browse via `https://base-sepolia.blockscout.com/address/<address>`.

## Signing keys

- **trustedSigner** (Path A score submissions): `0xA24f9122568e98b72f4dDD61119C7D92D0975692` — this is the `STUDIO_PRIVATE_KEY`-derived address that server-side score submissions are signed by. The contract verifies signatures against this address; treat it as **public** (the address; the key is server-only).

## API endpoints

### SkillOS API surface (Phase 2 SDK target; Phase 1 direct via app subdomains)

**Phase 2 (planned):** `https://api.skillos.network` will host the unified API.

**Phase 1 (today):** the API is colocated in `apps/api/` and deployed under the game subdomain that calls it. SDK 0.2.1 routes through:

- Solo submit: `POST https://<game>.skillos.games/api/v1/scores`
- SIWB auth: `POST https://<game>.skillos.games/api/v1/auth/siwb/{nonce,verify}`
- SIWA auth: `POST https://<game>.skillos.games/api/v1/auth/siwa/{nonce,verify}`
- Tournament list: `GET https://<game>.skillos.games/api/v1/tournaments`
- Leaderboard: `GET https://<game>.skillos.games/api/v1/tournaments/<id>/leaderboard`

The SDK's `SkillOSProvider config={{ env: 'testnet' }}` resolves the right subdomain automatically; the developer rarely needs the raw URL.

### Game subdomains (Phase 1 live)

| Game | Subdomain | Builder code |
|---|---|---|
| 2048 | `2048.skillos.games` | `bc_o6szuvg1` |
| wordle | `wordle.skillos.games` | `bc_l0drfg77` |
| sudoku | `sudoku.skillos.games` | `bc_ixx8hzql` |
| minesweeper | `minesweeper.skillos.games` | `bc_6gsgkv5q` |
| clicker | `clicker.skillos.games` | `bc_m59xxykm` |
| match3 | `match3.skillos.games` | `bc_iqoz78rc` |
| sponsor dashboard | `sponsor.skillos.games` | `bc_2hg1v71w` |

Apex marketing site lives at `https://skillos.games` (separate repo: `youngstar-eth/skillos-apex`). Builder code `bc_z04mayz0`. Not in this monorepo.

## External APIs the agent may call (read-only)

| Endpoint | Purpose | Auth |
|---|---|---|
| `https://base-sepolia.blockscout.com/api/v2/transactions/<txHash>` | tx verification, raw_input check | none (rate-limited) |
| `https://sepolia.basescan.org/api?module=transaction&action=getstatus&txhash=...` | alternate verification | API key optional, free tier sufficient |
| `https://api.base.dev/v1/agents/builder-codes` | agent Builder Code lookup (SIWA verify uses this server-side) | none |

## What this skill pack does NOT cover

- **Mainnet addresses.** Phase 2-gated. Do not point developers at any Base mainnet contract.
- **L1 (Ethereum) endpoints.** SkillOS is Base-only by design.
- **Privy / Coinbase Smart Wallet API endpoints.** Those are upstream to Base Account; not in scope.
- **Custom RPC providers (Alchemy, Infura).** Use `https://sepolia.base.org` (the public RPC); developers self-managing rate limits can swap to their own provider via wagmi `transports`.

## When this drifts

Contract addresses change only on **redeploy** events (typically v2.x bumps). Update this file as part of the redeploy PR; cross-reference the on-chain `Deployments` file at [`contracts/deployments/`](https://github.com/youngstar-eth/skillos/tree/main/contracts/deployments) for the source of truth.

API endpoints change on **Phase 2 SDK migration** — when `api.skillos.network` becomes the canonical surface, update SDK + this reference + game subdomains in lockstep.
