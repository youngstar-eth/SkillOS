# skill-game-scaffold

Minimum-viable Vite + React 18 scaffold for a SkillOS-integrated skill game. Copy this directory to start a new project.

## Start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## What's wired

| File | Purpose |
|---|---|
| `src/main.tsx` | React root + Providers wrapper. |
| `src/SkillOSProvider.tsx` | Composes `WagmiProvider` + `QueryClientProvider` + `SkillOSProvider`. Edit `BUILDER_CODE` to your registered Base Builder Code. |
| `src/App.tsx` | Demo UI: sign in, pick a tournament, submit a score. |
| `src/score-submit.ts` | Thin wrapper around `useSkillOSScore.submit` with input validation. |
| `src/sdk-types.ts` | Local type re-exports for the wrapper. |

## What to change

1. **Builder Code.** In `src/SkillOSProvider.tsx`, replace `BUILDER_CODE = undefined` with your registered `bc_xxxxxxxx`. Register at https://docs.base.org/ai-agents/setup/agent-builder-codes.
2. **Wallet connector.** Default is `injected()` (any browser EVM wallet). For Base Account smart wallet flow specifically, swap to `@base-org/account/wagmi`'s `baseAccount({ appName })` — install `@base-org/account` first.
3. **Game UI.** Replace `App.tsx`'s demo UI with your actual game. Call `submitScoreOnce(submit, { score, tier: 'T0' })` at game-over.

## Phase 1 constraints

- This scaffold targets **Base Sepolia** (testnet). Mainnet is audit-gated, Phase 2.
- Only **T0** tier is supported by the SDK as of v0.2.1. T1+ requires server-side replay verification (Phase 2).
- Tournament creation is permissioned in Phase 1 — integrate with existing tournaments (visible via `useSkillOSTournaments()`). Permissionless creation opens in Phase 2.

## Where to learn more

- SDK reference: https://www.npmjs.com/package/@skillos/sdk
- Architecture docs: https://docs.skillos.network
- Skill pack (this template's parent): https://www.npmjs.com/package/@skillos/skills
