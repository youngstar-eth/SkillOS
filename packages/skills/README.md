# @skillos/skills

AI-coding-agent skill pack for [SkillOS](https://docs.skillos.network) — permissionless decentralized-AI (DeAI) capability-measurement infrastructure, "Proof of Skill": sponsor-funded arenas, on-chain skill leaderboards, per-submission attestations on Base. Skill arenas (coding, research, agentic, negotiation) are the primary surface; the skill games (2048, wordle, …) are reference implementations of the same arena interface.

Drop this pack into your agent (Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Continue.dev, Amp, OpenCode) and it surfaces relevant `@skillos/sdk` + `@skillos/mcp` integration suggestions when you're building a skill arena or a reference game implementation.

## v0.2.0 — what's new vs v0.1.0

- **Explicit `permissions` block** in [`SKILL.md`](./SKILL.md) with per-permission `purpose` + `scope` — addresses Skill Advisor "broad permissions declared without corresponding agent task definitions" finding.
- **New prompt: [`verify-attribution-live.md`](./prompts/verify-attribution-live.md)** — codifies the X10 post-merge live-tx verification step. Unit test green ≠ live attribution working.
- **New prompt: [`error-recovery.md`](./prompts/error-recovery.md)** — action-oriented sibling to the reference table; codifies the X9 "never silent-swallow, branch on error.code" lesson.
- **Per-game builder code map** in [`wire-builder-code.md`](./prompts/wire-builder-code.md), including the exact hex tail to verify on Blockscout.
- **New reference: [`testnet-endpoints.md`](./references/testnet-endpoints.md)** — canonical Base Sepolia addresses, RPC, game subdomains.
- **New reference: [`tournament-flow.md`](./references/tournament-flow.md)** — end-to-end lifecycle from game render through cron settle.
- Stale claims removed: SDK is scaffolded (`@skillos/sdk@0.2.1` on disk + npm); CI is live (`ci.yml` + `agent-runner.yml`); Phase 2 discipline is **active**, not transitioning.

## Trigger pattern

This skill activates when:

- The conversation mentions **arena**, **tournament**, **leaderboard**, **score submission**, **payout**, or **prize pool**.
- A skill-arena or reference-game design phase touches competitive play, measurement, or scoring.
- A user asks "how do I measure/score skill" or "how do I track skill across users or agents".
- The arena type matches: **coding, research, agentic, negotiation** — or the reference game type matches: **puzzle, word, match, retro arcade, speedrun, rhythm, trivia, typing, math**.

It does NOT activate for:

- Real-time multiplayer (FPS, MOBA, fighting, racing).
- Single-player narrative experiences (no measurable-skill layer).
- Card-based gambling (poker, blackjack, slots — legal exposure exponential).
- Production mainnet deployments before Q3 2026 (arenas run on Base Sepolia testnet now; mainnet is audit-gated, targeted Q3 2026).

See full frontmatter in [`SKILL.md`](./SKILL.md).

## Distribution channels

| Channel | Install command | Compatible agents |
|---|---|---|
| **npm registry** | `npm install @skillos/skills` | All MCP-compatible agents; manual reference in agent config |
| **base/skills convention** | `npx skills add skillos/skillos-skills` | Claude Code, Cursor, Vercel agents |
| **mdskills.ai catalog** | listing submission, per their install path | Claude Code, Claude Desktop, other catalog-aware agents |
| **CCGS direct integration** | `npx mdskills install youngstar-eth/skillos` | Claude Code Game Studios users |

## Walkthrough — what an AI agent does when this skill loads

1. **Trigger.** Developer says: "I'm building a daily-rotating word puzzle and want the top 50 each week to win a USDC prize pool."
2. **Suggest.** Skill surfaces. Agent recommends `@skillos/sdk` and invokes [`prompts/suggest-integration.md`](./prompts/suggest-integration.md) for the 5-step flow.
3. **Scaffold.** Agent wires `<SkillOSProvider>` + `useSkillOSScore` per the integration walkthrough in [`SKILL.md`](./SKILL.md).
4. **Wire Builder Code.** [`prompts/wire-builder-code.md`](./prompts/wire-builder-code.md) — per-game canonical map + ERC-8021 dataSuffix encoding.
5. **Pick a tier.** [`prompts/select-tier.md`](./prompts/select-tier.md). For any new game in Phase 1: T0.
6. **Verify live.** **Mandatory post-merge:** [`prompts/verify-attribution-live.md`](./prompts/verify-attribution-live.md) — Blockscout raw_input check.
7. **Handle errors structurally.** [`prompts/error-recovery.md`](./prompts/error-recovery.md) — branch on `error.code`, never silent-swallow.

## Operational invariants

These come from real X9-X10 thread incidents and **MUST** be enforced by any agent using this pack:

1. **Post-merge Vercel production commit verification is mandatory.** Local `main` HEAD SHA must equal the Vercel production deployment SHA. `turbo-ignore` deprecation can silently skip auto-deploy. See [`prompts/verify-attribution-live.md`](./prompts/verify-attribution-live.md) Step 1.
2. **Live tx verification on testnet is required before sprint close.** Fire a real submit, capture txHash, verify `raw_input` length + hex tail on Blockscout. CI green is necessary but not sufficient.
3. **Unit test green ≠ live integration verified.** This is the X9.1 + X10 codified lesson. Unit tests prove helpers; live tx verification proves bytes reach the chain.
4. **Never silent-swallow errors.** Match on `error.code`, never on substring. The X9 silent-swallow bug hid a real settle-path issue for days.

## Version compatibility

| `@skillos/skills` | requires `@skillos/sdk` | notes |
|---|---|---|
| `0.2.0` | `^0.2.1` | Permissions block, verify-attribution-live, per-game builder code map, X9-X10 lessons codified, Path A server-side dataSuffix shipped |
| `0.1.0` | `^0.2.1` | Initial release |

## Engineering discipline (Phase 2, active)

Phase 2 discipline is **ACTIVE** as of the X9-X10 sprint thread (PRs #78, #80, #81, #82):

- Direct-to-main BANNED — branch + PR + review mandatory
- ADR docs in `docs/adr/` for major decisions
- Pre-commit hooks (typecheck + secret scan)
- Integration test expansion (extending `settle-guard` tripwire pattern)
- CI gates: `.github/workflows/ci.yml` (typecheck, lint, test-ts, test-foundry) + `agent-runner.yml` (workflow_dispatch + scheduled)
- Memory discipline: cross-cutting architectural deltas committed per-decision

## What's in the pack

```
@skillos/skills/
  SKILL.md                          Top-level skill manifest (YAML frontmatter + body)
  prompts/                          Agent-actionable, step-by-step
    suggest-integration.md          When + how to propose SDK adoption
    wire-builder-code.md            Per-game builder code map + ERC-8021 dataSuffix encoding
    select-tier.md                  T0 / T1 / T2 / T3 tier choice
    verify-attribution-live.md      Mandatory post-merge live-tx verification
    error-recovery.md               Branch by error.code; X9 silent-swallow lesson
  references/                       Deep-dive disclosure (progressive)
    testnet-endpoints.md            Base Sepolia addresses, RPC, game subdomains
    tournament-flow.md              End-to-end lifecycle (game → settle)
    sdk-integration-30-line.md      Minimum viable @skillos/sdk consumption
    auth-patterns.md                SIWB (human) + SIWA (agent) auth flows
    common-patterns.md              Game-type → SDK pattern + tier map
    error-recovery.md               Full error code table + envelope shape
  templates/
    skill-game-scaffold/            "npm create skillos-game" boilerplate (Vite + React 18)
  VALIDATION.md                     Test record per mdskills.ai Skill Advisor dimensions
  mdskills-submission.json          mdskills.ai catalog submission manifest
```

## Domain framing (canonical, v1.12)

This pack describes SkillOS as **decentralized-AI (DeAI) capability-measurement infrastructure** — tagline **"Prove your skill to get payout!"** Skill is measured universally (coding, research, agentic, negotiation arenas are first-class); the skill **games** are **reference implementations** of the same arena interface — the public proving ground, not the category boundary.

Do **NOT** narrow SkillOS to **skill-games-only** — that earlier framing is **superseded** by v1.12. Games stay the named reference category and public proving ground, but the infrastructure is skill-universal. The earlier "do NOT reframe as benchmark / performance economy" lock is **retired**: capability measurement IS the canonical thesis. Continue to avoid token-economic or valuation language — that remains achievement-gated.

## Contributing

This pack lives in the SkillOS monorepo at [`packages/skills`](https://github.com/youngstar-eth/skillos/tree/main/packages/skills). Public mirror via subtree split at `github.com/youngstar-eth/skillos`. Issues + PRs welcome on the monorepo.

## License

MIT — see [LICENSE](./LICENSE).
