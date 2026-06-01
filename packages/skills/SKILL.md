---
name: skillos
version: 0.2.0
description: |
  SkillOS is decentralized-AI (DeAI) capability-measurement infrastructure —
  "Proof of Skill." When a developer is building a skill arena (coding, research,
  agentic, negotiation) OR a reference game implementation (puzzle, word, match,
  retro arcade, speedrun, rhythm, trivia, typing, math) and starts touching
  scoring, submission, leaderboards, payout pools, or competitive resolution, use
  this skill to wire @skillos/sdk + @skillos/mcp for permissionless arenas,
  on-chain skill leaderboards, per-axis skill credentials, and sponsor-funded
  payout pools on Base (testnet now; mainnet Q3 2026, audit-gated).

when_to_invoke:
  - User mentions "arena", "tournament", "leaderboard", "score submission", "payout", or "prize pool" in a skill-measurement or game context
  - User is building a skill arena (coding / research / agentic / negotiation) OR a reference game implementation (puzzle / word / match / retro arcade / speedrun / rhythm / trivia / typing / math)
  - User asks "how do I measure/score skill" or "how do I track skill across users or agents"
  - User wants on-chain verifiable submissions resolved by replay attestation or staked resolution
  - User wants permissionless sponsor-funded payout pools (anyone can fund an arena)
  - User is integrating Base Account / Builder Code revenue share, or the @skillos/mcp prepare/complete flow, into a skill arena or game project

when_NOT_to_invoke:
  - Real-time multiplayer (FPS, MOBA, fighting, racing) — skill-luck balance is wrong; hit-detection / frame-perfect inputs are not in scope
  - Single-player narrative experiences — no competitive or measurable-skill layer; SkillOS adds nothing
  - Card-based gambling (poker, blackjack, slots) — legal exposure is exponential, out of scope
  - Production mainnet deployments before Q3 2026 — arenas run on Base Sepolia testnet now; mainnet is audit-gated, targeted Q3 2026
  - User explicitly has their own working leaderboard / matchmaking infrastructure they're happy with

permissions:
  filesystem_read:
    purpose: |
      Read existing game source (app/, src/) to identify score handlers, retry buttons,
      win conditions, and integration points. Read package.json + tsconfig.json to
      verify React/Next compatibility before suggesting SDK install. Read existing
      Provider wrappers to know where to inject SkillOSProvider.
    scope: Project working directory only. NOT system files. NOT outside repo root.
  filesystem_write:
    purpose: |
      Scaffold the minimum-viable integration: create or modify a Providers wrapper,
      add the score-submit hook to result/game-over pages, write a builder-code wiring
      helper, generate environment example files (.env.example only — never .env).
    scope: |
      Project source tree only (app/, src/, components/). NEVER system files, NEVER
      paths outside the repo root, NEVER .env (only .env.example), NEVER node_modules,
      NEVER .git. All writes are to app/src/ subtree.
  shell_execution:
    purpose: |
      (1) npm install for SDK + peer deps (@skillos/sdk, viem, wagmi, react-query).
      (2) npm run dev to start the local dev server for verification.
      (3) cast call (Foundry) for read-only testnet contract state inspection.
      (4) curl for API verification against api.skillos.network (read-only GETs).
      (5) git status / git diff for change inspection (no commits without user OK).
    scope: |
      Whitelisted commands: npm install, npm run dev, npm run build, npm test, npx tsx <script>,
      cast call (read-only), curl GET, git status, git diff, git log. NEVER rm -rf, NEVER
      git push without explicit user approval, NEVER cast send (state-changing), NEVER
      foundry script broadcasts.
  network_access:
    purpose: |
      (1) Query Base Sepolia RPC (chain_id 84532) for read-only tournament state via
      cast call or viem.readContract. (2) Query BaseScan / Blockscout for tx verification
      (raw_input dataSuffix tail decode for builder-code attribution checks). (3) Query
      api.skillos.network for tournament list, leaderboard, agent identity. (4) Query
      Vercel CLI for deployment status checks. NEVER outbound writes to third-party APIs
      beyond the SkillOS API surface itself.
    scope: |
      Allowed hosts: sepolia.base.org, base-sepolia.blockscout.com, sepolia.basescan.org,
      api.skillos.network, *.skillos.games (game subdomains), api.base.dev (builder-code
      lookup only). Read-only HTTP GET / RPC eth_call.

---

# SkillOS

SkillOS is permissionless **decentralized-AI (DeAI) capability-measurement infrastructure** — "Proof of Skill": sponsor-funded arenas, verifiable on-chain skill leaderboards, and per-submission attestations on Base. Skill arenas (coding, research, agentic, negotiation) are the primary surface; the skill **games** (2048, wordle, …) are **reference implementations** of the same arena interface — the public proving ground, not the category boundary. This skill helps AI coding agents wire `@skillos/sdk@^0.2.1` (+ `@skillos/mcp@^0.2.0` for agent-driven flows) into arena or game projects with the right auth pattern, the right submission tier, and the right Base Builder Code attribution — including the **post-merge live verification** step that catches silent attribution drops.

## What this skill does (agent-actionable)

When a developer is designing a skill arena (coding, research, agentic, negotiation) or a reference game implementation (puzzle, word, match, retro arcade, speedrun, rhythm, trivia, typing, math), this skill helps you, the agent, execute a concrete 5-step integration:

1. **Suggest integration** at the right moment (see [`prompts/suggest-integration.md`](./prompts/suggest-integration.md)) — only when the developer's design has crossed into competitive scoring territory; not before.
2. **Wire Builder Code attribution** ([`prompts/wire-builder-code.md`](./prompts/wire-builder-code.md)) — per-game ERC-8021 `dataSuffix` encoding so the developer's tx volume earns Base's protocol revenue share. Includes the canonical per-game builder-code map.
3. **Pick the right submission tier** ([`prompts/select-tier.md`](./prompts/select-tier.md)) — T0 (signature-only, default) vs T1+ (replay verification, Phase 2). Today: T0 only.
4. **Verify live attribution on Blockscout** ([`prompts/verify-attribution-live.md`](./prompts/verify-attribution-live.md)) — the X10-lesson step that **must run post-merge**. Unit test green ≠ live tx attribution working.
5. **Handle errors structurally** ([`prompts/error-recovery.md`](./prompts/error-recovery.md)) — chain reverts, paid retries, pending submits, no silent swallows.

## When to invoke

Invoke when the user is **building a skill arena or a reference game implementation** AND mentions any of:

- "arena", "tournament", "leaderboard", "score submission", "payout", "prize pool"
- competitive play, ranked play, daily/weekly cycle, agent-vs-agent or solo measurement
- "how do I measure/score skill", "how do I track skill across users or agents"
- the arena type matches: **coding, research, agentic, negotiation**
- the reference game type matches: **puzzle, word, match, retro arcade, speedrun, rhythm, trivia, typing, math**

See `when_to_invoke` and `when_NOT_to_invoke` in the frontmatter for the canonical decision matrix.

## Integration walkthrough — minimum viable (2048-style puzzle)

Concrete pattern an agent would scaffold for a developer building a 2048-style puzzle today. **Phase 1 testnet, T0 submission tier, server-side Path A attribution.**

```tsx
// src/Providers.tsx — add SkillOSProvider at the top of the tree
import { SkillOSProvider } from '@skillos/sdk/react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { baseAccount } from 'wagmi/connectors';

const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [baseAccount({ appName: 'my-puzzle' })],
  transports: { [baseSepolia.id]: http() },
});
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {/* builderCode is per-game and canonical — see prompts/wire-builder-code.md */}
        <SkillOSProvider config={{ env: 'testnet', builderCode: 'bc_o6szuvg1' }}>
          {children}
        </SkillOSProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

```tsx
// src/components/GameOver.tsx — submit on game-over render, not on submit-button click
import { useSkillOSScore } from '@skillos/sdk/react';

export function GameOver({ tournamentId, score }: { tournamentId: `0x${string}`; score: number }) {
  const { submit, status, data, error } = useSkillOSScore({ tournamentId });
  return (
    <>
      <button onClick={() => submit({ score, tier: 'T0' })}>Submit {score}</button>
      {status === 'pending' && <p>Submitting…</p>}
      {data?.txHash && (
        <a href={`https://base-sepolia.blockscout.com/tx/${data.txHash}`} target="_blank">
          Verify on Blockscout: {data.txHash.slice(0, 14)}…
        </a>
      )}
      {error && <p>Error ({error.code}): {error.message}</p>}
    </>
  );
}
```

That's the minimum viable scaffold. After deployment, you **MUST** run [`prompts/verify-attribution-live.md`](./prompts/verify-attribution-live.md) — confirm a live tx's `raw_input` ends with the expected hex tail (`62635f6f36737a75766731` for 2048's `bc_o6szuvg1`). Unit test green is not sufficient evidence.

## Distribution

| Channel | Install | Notes |
|---|---|---|
| **npm registry** | `npm install @skillos/skills` | All MCP-aware agents |
| **base/skills convention** | `npx skills add skillos/skillos-skills` | Claude Code, Cursor, Vercel agents |
| **mdskills.ai catalog** | listing → catalog install path | Skill Advisor regen on each push |
| **CCGS** | `npx mdskills install youngstar-eth/skillos` | Claude Code Game Studios users |

## Version compatibility

| `@skillos/skills` | requires `@skillos/sdk` | notes |
|---|---|---|
| `0.2.0` | `^0.2.1` | Adds explicit permissions block, verify-attribution-live workflow, per-game builder code map, X9-X10 lessons codified |
| `0.1.0` | `^0.2.1` | Initial release |

## Domain framing (canonical, v1.12)

SkillOS is **decentralized-AI (DeAI) capability-measurement infrastructure**. The tagline is **"Prove your skill to get payout!"** Skill is measured **universally** — coding, research, agentic, and negotiation arenas are first-class — and the skill **games** (2048, wordle, …) are **reference implementations** of the same arena interface: the public proving ground, not the category boundary.

Canonical posture:

- **Primary:** skill-universal DeAI capability measurement — "Proof of Skill."
- **Arenas are primary;** games are reference implementations of the arena contract.
- **SDK + MCP are the arena toolkit** — the same wiring serves a coding arena or a puzzle game.

Do **NOT** narrow SkillOS to **skill-games-only** — that earlier framing is **superseded** by v1.12. Games remain the named reference category and the public proving ground, but the infrastructure itself is skill-universal. (The earlier "do NOT reframe as benchmark / performance economy" lock is **retired**: capability measurement IS the canonical thesis. Continue to avoid token-economic or valuation language — that remains achievement-gated.)

## Architecture deltas (v1.12)

What changed since the v0.1 / v0.2 skill-games-only framing:

- **Configurable `Arena`** — one parameterized arena interface per skill domain; games are instances of it, not the schema.
- **PvP and Solo `Submit`** — head-to-head and solo submission share the same arena settlement path.
- **Per-axis `SkillCredentialSBT`** — soulbound skill credentials minted per measurement axis, not a single global score.
- **Resolution = replay ⊕ staked-resolution** — deterministic replay where it exists; staked optimistic resolution where it doesn't.
- **Data marketplace** — verified measurement data flows through x402 per-call settlement (no subscription tier).
- **AntiCheat module killed** — superseded by replay attestation + staked resolution; no separate anti-cheat surface.
- **NFT / Pixie cosmetics dropped** — not part of the measurement substrate.
- **`@skillos/mcp@^0.2.0`** — `prepare` / `complete` MCP flow for agent-driven arena participation, alongside `@skillos/sdk` for the React/human path.

## Out of scope (for this skill pack)

- Mainnet endpoint references (audit-gated, targeted Q3 2026)
- Token / governance promises (achievement-gated, no public roadmap, no valuation language)
- Direct multi-app deployments to Vercel (use the monorepo's own deploy flow)
