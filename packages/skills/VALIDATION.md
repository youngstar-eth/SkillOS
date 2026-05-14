# Validation log

Per Sprint X3.5 §3.8 lock criteria, internal validation is required before declaring the pack done. This file is the record.

## v0.2.0 goal

Raise mdskills.ai **Skill Advisor** score from **3.2 (Weak band)** to **7+ (Strong band — actionable, well-structured, immediately usable)**. The three Skill Advisor dimensions:

1. **Capabilities** — actionable, well-scoped, executable without guessing
2. **Quality** — trigger conditions, step-by-step, examples, edge cases, progressive disclosure
3. **Security** — appropriate permissions, no over-scope, no injection surface, credential safety

## What changed (v0.1.0 → v0.2.0)

### Capabilities
- Added explicit step-by-step procedures to every prompt (5 prompts, all with numbered steps).
- Added concrete `npm install` + `curl` + Blockscout API commands the agent can execute directly.
- Added the canonical per-game builder code map with computed hex tails — no agent guessing.
- Added an integration walkthrough example in [`SKILL.md`](./SKILL.md) (2048 game, T0 tier, Phase 1 testnet).

### Quality
- Frontmatter `when_to_invoke` and `when_NOT_to_invoke` expanded with concrete trigger conditions and refusal templates.
- New prompt: [`verify-attribution-live.md`](./prompts/verify-attribution-live.md) — codifies the X10 case study as edge case with detection + recovery.
- New reference: [`testnet-endpoints.md`](./references/testnet-endpoints.md) — flat lookup table separated from prose.
- New reference: [`tournament-flow.md`](./references/tournament-flow.md) — end-to-end lifecycle, progressive disclosure from prompts.
- Cross-references from every prompt → next prompt + relevant reference, so the agent has a clear navigation path.

### Security
- Added `permissions` block to [`SKILL.md`](./SKILL.md) frontmatter with per-permission `purpose` + `scope`.
- Each permission narrowed: filesystem_write restricted to `app/src/` subtree; shell_execution whitelisted to specific commands; network_access whitelisted to specific hosts.
- Credential safety explicit: never write `.env`, only `.env.example`. Never run `cast send` (state-changing); only `cast call` (read-only). Never run `git push` without explicit user approval.

## Test 1 — Skill Advisor regen on mdskills.ai

**Status:** ☐ pending (founder)

**Steps:**
1. Push `feat/skill-pack-v0-2` to the public mirror (subtree-split from `packages/skills` → `github.com/youngstar-eth/skillos`).
2. Trigger mdskills.ai catalog refresh (push triggers regen automatically per their catalog docs).
3. Re-check Skill Advisor score at `https://www.mdskills.ai/skills/skillos`.

**Expected:** Score ≥ 7 across all 3 dimensions. Findings related to "broad permissions" and "no agent-executable instructions" cleared.

**Actual:** [founder fills in after mdskills.ai regen]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 2 — Fresh project + skill pack + Claude Code suggests SDK integration

**Status:** ☐ pending (founder)

**Steps:**
1. `npm create vite@latest test-skill-game -- --template react-ts`
2. `cd test-skill-game && npx mdskills install youngstar-eth/skillos`
3. Open the project in Claude Code; describe a skill game's scoring rules ("I want players to earn points for each puzzle solved, and the top 10 each week should win the prize pool").
4. Observe whether Claude Code surfaces the SkillOS skill organically (no manual prompt for the skill name).

**Expected:**
- Claude Code suggests `@skillos/sdk` integration.
- Suggestion includes builder code wiring step + tier choice + post-merge verification reminder.
- The agent does NOT need to be prompted with the skill name explicitly.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 3 — `npx skills add skillos/skillos-skills` on fresh CCGS bootstrap

**Status:** ☐ pending (founder)

**Steps:**
1. Bootstrap a fresh CCGS project per its README.
2. Run `npx skills add skillos/skillos-skills`.
3. Verify the skill pack lands at the CCGS-expected install path.
4. Run the Test 2 scenario.

**Expected:** Install succeeds without manual intervention. Subsequent AI agent use surfaces the skill as in Test 2.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 4 — `npm install @skillos/skills` standalone

**Status:** ☐ pending (founder, post-publish)

**Steps:**
1. Fresh empty project: `mkdir test && cd test && npm init -y`.
2. `npm install @skillos/skills` (after npm publish).
3. Verify `node_modules/@skillos/skills/SKILL.md` is reachable.
4. Open Claude Code in this dir; confirm the skill loads (look for the SKILL.md frontmatter being parsed).

**Expected:** No install errors, no peer-dep cascade failures, SKILL.md reachable, skill discoverable by Claude Code.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 5 — Permissions block respected by Claude Code

**Status:** ☐ pending (founder)

**Steps:**
1. With the skill loaded, ask Claude Code to "scaffold the SkillOS integration."
2. Observe the tools it requests permission for.
3. Verify the requested permissions match the scopes declared in `SKILL.md` frontmatter:
   - Filesystem writes: confined to `app/`, `src/`, `components/`.
   - Shell execution: only `npm install`, `npm run dev`, `cast call`, `curl`, `git status/diff`.
   - Network: only the whitelisted hosts (sepolia.base.org, base-sepolia.blockscout.com, etc.).

**Expected:** Claude Code respects the narrower permissions declared; doesn't auto-request system-level writes or state-changing shell commands.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Optional — base/skills PR

**Status:** ☐ deferred / optional

If founder time permits, file a PR to `github.com/base/skills` adding a SkillOS pack reference. Not mandatory per §3.8 lock criteria.

**PR link:** [optional, founder fills in]

## Sign-off

Lock criteria for v0.2.0:
- ☐ Skill Advisor score ≥ 7 across all 3 dimensions (Test 1)
- ☐ Skill surfaces organically in Claude Code (Test 2)
- ☐ Permissions block respected by Claude Code (Test 5)
- ☐ PR merged to main

Once all four are checked, declare v0.2.0 shipped and bump `@skillos/skills` to `0.2.0` on npm.
