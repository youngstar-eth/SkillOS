# SkillOS Architecture Doc — Supplement v1.2 (May 10, 2026)

> **Purpose:** Add four sections to `docs/architecture/developer-surface.md`:
> - §2.4 — Domain Neutrality Invariant (NEW in v1.2)
> - §3.6 — Layer 4 Game Launcher (Phase 3+)
> - §3.7 — Distribution Vectors framework
> - §3.8 — SkillOS Skill Pack (Sprint X3.5)
>
> Plus update §4 Sprint Sequence to insert **Sprint X3.5** between X3 and X4.
>
> **Approval:** Founder approved May 10, 2026 (extended Phase 2 timeline OK).
> **v1.2 patch (same day, later):** §2.4 Domain Neutrality Invariant added per founder stance lock — beachhead is skill gaming, substrate stays domain-agnostic, public communication holds skill gaming category framing.

---

## SECTION TO INSERT — §2.4

Insert this section **after §2.3 (Standards we explicitly do NOT reinvent)** and **before §3 (Architecture — Layer by Layer)**.

---

### 2.4 Domain Neutrality Invariant

While the beachhead is **skill gaming**, the protocol is architecturally **domain-agnostic**. This is deliberate optionality preservation, not a near-term product claim or marketing message.

**Naming discipline — all primitives stay task-agnostic:**

| ✓ Use | ✗ Avoid |
|---|---|
| `submitScore` | `submitGameScore`, `submitGamePlay` |
| `tournament` | `gameTournament`, `match` |
| `Player` | `Gamer` |
| `submission` | `play`, `gameRound` |
| `task definition` (tournament metadata) | `game definition` |
| `category` enum (`game` / `benchmark` / `contest` / `exam` / `task`) | hard-coded "game" type assumption |
| `participant` (when class-agnostic context) | `player` (where neutral is needed) |

**Reasoning:** The five core primitives — bounded task, measurable outcome, class declaration, verifiable anchor, sponsor-funded prize pool, tiered data depth — generalize to any verifiable performance market. By keeping the substrate's surface naming neutral, future expansion into adjacent verticals (AI agent benchmarks, coding contests, recruitment screening, esports tournament hosting, educational certification) requires only **new client adapters** — never breaking schema changes to the underlying protocol.

**Public communication discipline:**

This invariant is **internal-only**. External pitch, marketing, documentation, social copy, and onboarding messaging describe SkillOS as **"skill economy infrastructure for the agent era"** — skill gaming is the explicitly named category. Vertical expansion is achievement-gated optionality, not a roadmap promise, not a near-term ambition.

The reasoning is the Stripe pattern: Stripe's first three years were "online payments" — the substrate ambition ("infrastructure for the internet's economy") was earned by execution, not announced. SkillOS holds the same posture: skill gaming is the explicit category for Phase 1-3, broader applications stay quiet until traction warrants expanding the public frame.

**Architectural rule (PR review):**

Any pull request that introduces game-specific naming in a primitive (smart contract field, API endpoint, schema definition, SDK method, error code, OpenAPI spec field name) must include a `Rationale:` block explaining why the substrate is being bound to gaming context.

Default reviewer answer: **refactor to neutral naming**. Game-specific naming is acceptable only in:
- Client-side adapters (e.g., `apps/2048/src/lib/game-config.ts`)
- Game-specific UI strings, copy, and presentation layers
- App-level package.json names that already exist (e.g., `@skillos/app-2048`)
- Game-specific test fixtures and mock data

**Architecturally locked, executionally focused:**

- Phase 2-3 is fully scoped to skill gaming.
- Domain neutrality is the architectural commitment that protects optionality without diluting current focus.
- Future verticals (AI agent benchmark substrate, coding contest hosting, recruitment screening, etc.) are post-Phase-3 strategic options.
- Whether SkillOS pursues those verticals is a future decision — but the substrate must always be capable of supporting them without breaking changes.

---

## SECTIONS TO INSERT — §3.6, §3.7, §3.8

Insert these three sections **after §3.5 (Reference apps)** and **before §4 (Sprint Sequence)**.

---

### 3.6 Layer 4 — Game Launcher (`play.skillos.network`, Phase 3+)

⏳ **Phase 3+ product, gated on Phase 2 success.**

The Game Launcher is the aggregation surface where SDK-integrated games (own + third-party) become discoverable. It exists because once 5+ external developers integrate `@skillos/sdk`, their games end up scattered across many domains — the discovery problem becomes real and SkillOS solves it natively rather than depending on third-party listing services.

**Trigger condition:** 5+ external SDK integrations live + organic discovery friction reported by sponsors and players.

**Surface:**
- New subdomain: `play.skillos.network` (separate from `skillos.network` which stays marketing/onboarding-only)
- Independent of `*.skillos.games` (those continue to host individual game experiences directly)

**Functional scope:**
- Aggregated game directory (own 6 games + third-party SDK-integrated games + community-built games)
- Cross-game profile (one wallet, one SP balance across all games, one agent identity, one sponsor receipt portfolio)
- Global leaderboard (cross-game ranking)
- Sponsor advertisement hub (active prize pools across all SDK-integrated games)
- Tournament discovery (filter by genre, tier, class declaration, prize size, status)
- Agent marketplace (agents listed with per-game performance + class verification)

**Out of Phase 2:**
- Game Launcher itself — even if Phase 2 ships ahead of schedule, Layer 4 is **not** a Phase 2 deliverable
- Cross-game profile aggregation logic
- Global leaderboard aggregation
- Agent marketplace

These remain Phase 3+ regardless of Phase 2 timeline. Premature aggregation surface dilutes Phase 2 focus.

**Architectural note:** Layer 4 is a *consumer* of Layer 1 API (read endpoints) and Layer 2A SDK (frontend integrations). It introduces no new contracts or auth standards — it composes existing primitives. Game Launcher's data flywheel is read-only on the protocol side.

---

### 3.7 Distribution Vectors — partnership prioritization

The protocol is engine-agnostic by design. Distribution becomes a vector problem: which game-builder communities to engage, in what order, with what investment.

**Five vectors, prioritized:**

| # | Vector | Example repos / products | Effort | Reach | Phase |
|---|---|---|---|---|---|
| 1 | Meta-tooling for AI-coded games | CCGS (16.7k★), base/skills, mdskills.ai, skillpm | Low (skill manifest + prompt) | High (Anthropic ecosystem alignment) | 2-3 |
| 2 | Visual game builders | gb-studio (11k★), Construct, Phaser, GDevelop | Medium (sample game per builder) | Medium-High (established indie communities) | 2-3 |
| 3 | AI web app builders | Bolt, v0, Lovable, Shipper, Same.new, Rosebud AI | Medium (SDK + AI-friendly templates) | Very High (broad dev base, less game-specific) | 2-3 |
| 4 | Mainstream engines | Unity AI, Unreal AI, Antigravity, Roblox | High (per-engine WebGL adapter + plugin marketplace) | Very High | 3+ |
| 5 | 3D-web / niche builders | nunuStudio, Babylon.js editor | Defer | Low-Medium | 3+ |

**Phase 2 prioritization:**
- Vector 1: dedicated sub-sprint (X3.5 — see §3.8)
- Vector 2: organic outreach via SDK README + community channels (Discord, forum). 6-week observation window post-X3 ship; if no organic traction, build sample reference game.
- Vector 3: SDK npm package + AI-friendly templates ship as part of X3 deliverable. No dedicated sprint.
- Vector 4-5: deferred to Phase 3+

**Collab discipline filter:**

| Collab proposal type | Decision |
|---|---|
| Engine-agnostic SDK consumer + invariants intact | ✓ Welcome |
| Engine-specific port contributor (e.g., community Unity adapter) | ✓ Welcome (Phase 3 plan anyway) |
| Audit / security firm | ✓ Welcome (Phase 2 mainnet pre-req) |
| Closed-SDK distribution platform | ✗ Decline — permissionless invariant |
| Token-launch-conditional collab | ✗ Decline — achievement-gated tokenization principle |
| White-label "build your own SkillOS clone" | ✗ Decline — no moat |
| Exclusive AI lab data licensing | ✗ Decline — permissionless data marketplace invariant |
| Engine-specific native protocol (closed) | ✗ Decline — engine-agnostic invariant |

The filter is simple: any collab that preserves **engine-agnostic SDK + permissionless invariants + achievement-gated tokenization + domain neutrality** is welcome. Anything that violates one is declined regardless of size.

---

### 3.8 SkillOS Skill Pack — Vector 1 distribution (Sprint X3.5)

✅ **Phase 2 inclusion confirmed.** Lands as sub-sprint after X3 SDK v0.1 ships.

**Goal:** Distribute a SkillOS-aware skill pack to AI coding agent ecosystems (Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Continue.dev, Amp, OpenCode, etc.) so that devs using AI assistants get automatic SDK integration suggestions when designing skill games.

**Distribution channels (4):**

| Channel | Mechanism | Compatible agents |
|---|---|---|
| npm `@skillos/skills` | `npm install @skillos/skills` or via skillpm | All MCP-compatible agents |
| base/skills convention | `npx skills add skillos/skillos-skills` | Claude Code, Cursor, Vercel agents |
| mdskills.ai catalog | listing submission post-stable | Claude Code, Claude Desktop, others |
| CCGS direct integration | `npx mdskills install skillos/skillos-skills` | Donchitos/Claude-Code-Game-Studios users |

**Pack contents:**

```
@skillos/skills/
  SKILL.md                         # Top-level skill manifest (YAML frontmatter)
  prompts/
    suggest-integration.md          # When to suggest SDK adoption during design
    builder-code-wiring.md         # How to register Builder Code in scaffolds
    tier-selection-guidance.md      # When to use T0/T1/T2/T3 submission tier
  references/
    sdk-integration-30-line.md     # Minimum viable SDK integration snippet
    common-game-types.md           # Mapping puzzle/word/match/clicker → SDK patterns
    error-recovery.md              # Pending submit + retry pattern (matches useSoloRetry)
    auth-patterns.md               # SIWB human auth + SIWA agent auth basics
  templates/
    skill-game-scaffold/           # Template repo (npm create skillos-game)
    package.json                   # @skillos/sdk dependency wired
    src/SkillOSProvider.tsx        # Provider boilerplate
    src/score-submit.ts            # Submission boilerplate with tier choice
```

**SKILL.md trigger pattern:**

```yaml
---
name: skillos
description: |
  When a developer is building a skill game (puzzle, word, match, retro arcade,
  speedrun, rhythm, trivia, typing, math), use this skill to suggest integrating
  the @skillos/sdk for permissionless tournaments, on-chain leaderboards, and
  sponsor-funded prize pools.
when_to_invoke:
  - User mentions "tournament", "leaderboard", "score submission", "prize pool"
  - Game design phase mentions competitive play or scoring
  - User asks "how do I add scoring to my game"
  - Game type matches: puzzle, word, match, retro arcade, speedrun, rhythm, trivia
when_NOT_to_invoke:
  - Action games / FPS / fighting / racing (skill-luck balance is wrong)
  - Single-player narrative games (no competitive layer)
  - Games requiring real-time multiplayer (out of beachhead)
---
```

**Phase 2 sequence:**

1. Ship X3 SDK v0.1
2. Dogfood: migrate one own game (2048) to consume SDK (X3 lock criterion)
3. Ship X3.5 skill pack consuming dogfooded SDK
4. Distribute via 4 channels
5. Monitor adoption signals: npm downloads, GitHub stars on the skill pack repo, community Discord/forum mentions, organic CCGS integration mentions

**Out of scope (X3.5):**
- Game-builder-specific skill packs (gb-studio, Construct, Phaser) — Vector 2, deferred organic
- Engine-specific adapters (Unity, Unreal, Roblox) — Vector 4, Phase 3+
- Compensation / bounty programs for community contributions — Phase 2 finalization step
- Multi-language pack (only English in v1)

**Lock criteria for X3.5:**
- Skill pack published to npm as `@skillos/skills@0.1.0` (public scope)
- `npx skills add skillos/skillos-skills` install verified on a fresh CCGS bootstrap
- `npm install @skillos/skills` install verified standalone
- One internal validation: founder uses Claude Code with skill pack installed, scaffolds a new skill game from scratch, verifies SDK integration suggestion fires
- README includes: trigger pattern, distribution channel matrix, integration walkthrough, version compatibility table with `@skillos/sdk`
- Submitted to mdskills.ai catalog (review may take days)
- Optional: PR to github.com/base/skills adding SkillOS pack reference (community goodwill, not mandatory)

---

## UPDATE TO §4 — Insert Sprint X3.5

After **Sprint X3** (Layer 2A: SDK v0.1), insert this new sprint definition, BEFORE Sprint X4:

---

### Sprint X3.5 — Layer 2A.5: SkillOS Skill Pack distribution (Vector 1)

**Pre-sprint verification:**

- [ ] Read [Anthropic Agent Skills spec](https://github.com/anthropics/skills) (canonical SKILL.md format, YAML frontmatter, trigger pattern conventions)
- [ ] Read CCGS skill manifest at `Donchitos/Claude-Code-Game-Studios/.claude/skills/` to understand how skills layer onto its 49-agent architecture
- [ ] Verify `skillpm` and `mdskills` distribution mechanics — both are real but young, want to confirm install paths work
- [ ] Confirm npm scope `@skillos` is claimable (per memory: claimed May 10, 2026; verify still owned)

**Scope:**

A. Scaffold `packages/skills`:
   - `package.json`: `@skillos/skills`, public scope, peer dep on `@skillos/sdk`
   - Top-level SKILL.md with YAML frontmatter
   - `prompts/`, `references/`, `templates/` subdirectories per §3.8
   - README with trigger pattern + distribution channel matrix
   - LICENSE (MIT or Apache-2.0)

B. Skill content (per §3.8):
   - `SKILL.md`: trigger pattern, when to invoke, when NOT to invoke
   - `prompts/suggest-integration.md`: AI agent guidance for proposing SDK adoption
   - `prompts/builder-code-wiring.md`: How to wire Builder Code attribution
   - `prompts/tier-selection-guidance.md`: T0-T3 submission tier choice
   - `references/sdk-integration-30-line.md`: Minimum viable integration
   - `references/common-game-types.md`: Game type → SDK pattern mapping
   - `references/error-recovery.md`: Pending submit retry pattern
   - `references/auth-patterns.md`: SIWB + SIWA basics

C. Templates:
   - `templates/skill-game-scaffold/`: `npm create skillos-game` boilerplate
   - Wired with `@skillos/sdk` provider, score submit, builder code

D. Distribution prep:
   - npm publish dry-run verification
   - base/skills compatibility test: clone fresh project, run `npx skills add skillos/skillos-skills`
   - mdskills.ai catalog submission draft
   - CCGS install test on fresh bootstrap

E. Internal validation:
   - Founder fresh project: `npm create skillos-game my-test-game`
   - Open in Claude Code with skill pack installed
   - Verify Claude Code suggests SDK integration when designing tournament logic
   - Document the test in `packages/skills/VALIDATION.md`

**Lock criteria:**

- `@skillos/skills@0.1.0` published to npm with `--access=public`
- `npx skills add skillos/skillos-skills` install succeeds on fresh project
- `npm install @skillos/skills` install succeeds standalone
- Founder validation completed (documented in VALIDATION.md)
- mdskills.ai catalog submission filed
- README complete (trigger, distribution, walkthrough, version compat)
- PR titled: "feat(skills): SkillOS Skill Pack v0.1 (Sprint X3.5)"

**Out of scope:**

- Game-builder-specific skill packs (gb-studio, Construct, Phaser) — Vector 2, deferred organic
- Engine adapters (Unity, Unreal) — Vector 4, Phase 3+
- Multi-language pack — English only in v0.1
- Bounty / compensation programs

**Constraints:**

- Skill pack must depend on `@skillos/sdk@^0.1.0` (X3 deliverable)
- All YAML frontmatter validates against Anthropic Agent Skills spec
- README integration walkthrough tested by founder before lock
- No Anthropic-specific assumptions — pack must work in Cursor, Codex, Gemini CLI, etc.
- **Domain neutrality preserved:** Skill pack prompt content describes SDK in skill-gaming-context terms (per §2.4 public communication discipline). No "verifiable performance economy" or "AI benchmark substrate" framing in user-facing skill pack docs.

---

## CHANGELOG TO ADD — new §9 (or append if §9 already exists)

After all the existing sections in the doc, add a new §9 Changelog at the very end of the document. If §9 already exists from v1.1, append the v1.2 entry above the v1.1 entry.

```
## §9 Changelog

### v1.2 — 2026-05-10 (later same day)
- Added §2.4 Domain Neutrality Invariant — locks substrate naming as 
  task-agnostic to preserve optionality across verticals (AI benchmarks, 
  coding contests, recruitment, esports, certification). Public 
  communication discipline remains skill gaming category framing.
- Updated §3.7 collab filter to include domain neutrality preservation.
- Updated §3.8 Skill Pack constraints with domain neutrality preservation 
  in user-facing pack content.

### v1.1 — 2026-05-10
- Added §3.6 Layer 4 Game Launcher (Phase 3+ product spec)
- Added §3.7 Distribution Vectors (5-vector partnership framework)
- Added §3.8 SkillOS Skill Pack (Vector 1, Sprint X3.5)
- Updated §4 Sprint Sequence: inserted X3.5 between X3 and X4

### v1 — 2026-05-10 (initial)
- Initial architecture planning, locked decisions May 10
- 9 founder-decision questions resolved with defaults
- Sprint sequence X1-X7 baseline
```

---

## END OF SUPPLEMENT
