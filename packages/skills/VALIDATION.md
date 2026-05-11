# Validation log

Per Sprint X3.5 §3.8 lock criteria, internal validation is required before declaring the pack done. This file is the record.

## Test 1 — Fresh project + skill pack + AI agent suggests SDK integration

**Status:** ☐ pending (founder)

**Steps:**

1. `npm create skillos-game my-test-game` (or equivalent: clone `templates/skill-game-scaffold` to a temp dir).
2. Open the project in Claude Code with `@skillos/skills` installed.
3. Begin describing a skill game's scoring rules ("I want players to earn points for each puzzle solved, and the top 10 each week should win the prize pool").
4. Observe that Claude Code surfaces the SkillOS skill — suggests:
   - The right SDK package (`@skillos/sdk`)
   - The right hook for the game type (`useSkillOSScore`)
   - The Builder Code wiring step
   - The submission tier choice (T0 for v0.1)

**Expected:** AI agent surfaces the SkillOS skill suggestion organically when scoring / tournament design appears in the conversation. The agent doesn't need to be prompted with the skill name.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 2 — `npx skills add skillos/skillos-skills` on fresh CCGS bootstrap

**Status:** ☐ pending (founder)

**Steps:**

1. Bootstrap a fresh CCGS project per its README.
2. Run `npx skills add skillos/skillos-skills`.
3. Verify the skill pack lands at the CCGS-expected install path.
4. Run the same Claude Code test as Test 1.

**Expected:** Install succeeds with no manual intervention. Subsequent AI agent use surfaces the skill as in Test 1.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 3 — `npm install @skillos/skills` standalone

**Status:** ☐ pending (founder, post-publish)

**Steps:**

1. Fresh empty project: `mkdir test && cd test && npm init -y`.
2. `npm install @skillos/skills` (after publish to npm).
3. Verify `node_modules/@skillos/skills/SKILL.md` is reachable.
4. Open Claude Code in this dir, confirm the skill loads.

**Expected:** No install errors, no peer-dep cascade failures, SKILL.md reachable, skill discoverable by Claude Code.

**Actual:** [founder fills in]

**Verdict:** ☐ pass / ☐ fail / ☐ partial

## Test 4 — mdskills.ai catalog submission

**Status:** ☐ pending (founder)

**Steps:**

1. Open `mdskills-submission.json` in this directory.
2. Submit via mdskills.ai catalog form (process per their docs at time of submission).
3. Track submission ticket / PR ID.

**Submission ticket:** [founder fills in]

**Approval ETA:** [founder fills in based on mdskills.ai reviewer response]

## Optional — `base/skills` PR

**Status:** ☐ deferred / optional

If founder time permits, file a PR to `github.com/base/skills` adding a SkillOS pack reference. Not mandatory per §3.8 lock criteria.

**PR link:** [optional, founder fills in]
