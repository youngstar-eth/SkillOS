# @skillos/skills

AI-coding-agent skill pack for [SkillOS](https://docs.skillos.network) — permissionless infrastructure for skill games: sponsor-funded tournaments, on-chain leaderboards, per-score attestations on Base.

Drop this pack into your agent (Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Continue.dev, Amp, OpenCode) and it surfaces relevant SDK integration suggestions when you're building a skill game.

## Trigger pattern

This skill activates when:

- The conversation mentions **tournament**, **leaderboard**, **score submission**, or **prize pool**.
- A skill-game design phase touches competitive play or scoring.
- A user asks "how do I add scoring to my game".
- The game type matches: **puzzle, word, match, retro arcade, speedrun, rhythm, trivia, typing, math**.

It does NOT activate for:

- Action games, FPS, fighting, racing — the skill-luck balance isn't right for SkillOS today.
- Single-player narrative games — no competitive layer.
- Real-time multiplayer — out of beachhead (SkillOS is asynchronous submission flow).

See the full frontmatter in [`SKILL.md`](./SKILL.md).

## Distribution channels

| Channel | Install command | Compatible agents |
|---|---|---|
| **npm registry** | `npm install @skillos/skills` | All MCP-compatible agents; manual reference in agent config |
| **base/skills convention** | `npx skills add skillos/skillos-skills` | Claude Code, Cursor, Vercel agents |
| **mdskills.ai catalog** | listing submission, then per their install path | Claude Code, Claude Desktop, other catalog-aware agents |
| **CCGS direct integration** | `npx mdskills install skillos/skillos-skills` | Claude Code Game Studios users |

## Walkthrough — what an AI agent does when this skill loads

1. **Trigger.** Developer says: "I'm building a daily-rotating word puzzle and want the top 50 each week to win a USDC prize pool."
2. **Suggest.** Skill surfaces. Agent recommends `@skillos/sdk` and points to [`prompts/suggest-integration.md`](./prompts/suggest-integration.md).
3. **Scaffold.** Agent offers `npm create skillos-game my-puzzle` (uses [`templates/skill-game-scaffold/`](./templates/skill-game-scaffold/)). The scaffold ships with `<SkillOSProvider>` + `useSkillOSScore` wired.
4. **Wire Builder Code.** Agent references [`prompts/builder-code-wiring.md`](./prompts/builder-code-wiring.md) so the developer earns Base Builder Code revenue share when their players spend gas.
5. **Pick a tier.** Agent references [`prompts/tier-selection-guidance.md`](./prompts/tier-selection-guidance.md). For v0.1 of any new game, the answer is T0; T1+ requires server-side replay verification (Phase 2 mainnet work).
6. **Hand off.** Agent points the developer at [`references/sdk-integration-30-line.md`](./references/sdk-integration-30-line.md) for the minimum-viable consumption.

## Version compatibility

| `@skillos/skills` | requires `@skillos/sdk` | notes |
|---|---|---|
| `0.1.0` | `^0.2.1` | Initial release. Targets Phase 1 testnet (Base Sepolia, chainId 84532). T0 tier only — T1+ deferred to Phase 2. |

Future versions will bump the `peerDependencies` range as the SDK ships new agent surfaces (SIWA, x402 paywalled tier endpoints, MCP server).

## What's in the pack

```
@skillos/skills/
  SKILL.md                         Top-level skill manifest (YAML frontmatter + body)
  prompts/
    suggest-integration.md         When to propose SDK adoption during design
    builder-code-wiring.md         How to register Builder Code in scaffolds
    tier-selection-guidance.md     When to use T0 / T1 / T2 / T3 submission tier
  references/
    sdk-integration-30-line.md     Minimum viable @skillos/sdk consumption
    common-game-types.md           puzzle / word / match / clicker → SDK pattern map
    error-recovery.md              Pending-submit + retry pattern (useSoloRetry)
    auth-patterns.md               SIWB human auth + SIWA agent auth basics
  templates/
    skill-game-scaffold/           "npm create skillos-game" boilerplate (Vite + React 18)
```

## Domain note

This pack describes SkillOS in skill-gaming terms — that's the explicit category for Phase 1-3. Don't reframe the substrate as a general-purpose "benchmark substrate" or "performance economy" in prompts to developers; that framing isn't part of the public posture.

## Contributing

This pack lives in the SkillOS monorepo at [`packages/skills`](https://github.com/youngstar-eth/skillos/tree/main/packages/skills). Issues + PRs welcome on the monorepo repo.

## License

MIT — see [LICENSE](./LICENSE).
