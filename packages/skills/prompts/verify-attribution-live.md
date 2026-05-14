# prompts/verify-attribution-live.md

**Use this:** **mandatory post-merge**, after any change that touches the score-submission path, builder-code wiring, or the API's `dataSuffix` helper. Run this BEFORE you (or the user) declare attribution "shipped." Skipping this step is how the X10 attribution gap stayed hidden — unit test green ≠ live tx attribution working.

## Core principle

> **Unit test green ≠ live integration verified.**
>
> Unit tests prove the helper function returns the right hex tail for a builder code. They do NOT prove that production traffic actually flows through that helper. Vercel deployment, function bundling, edge-vs-node runtime, and silent build-skip configurations can all sever the path between green CI and the bytes that hit the chain.

## When to run this

- Immediately after merging any PR that touches: `apps/api/src/lib/games.ts`, `apps/api/src/routes/scores.ts`, `packages/sdk/src/scores/`, any `SkillOSProvider` config, any `app/layout.tsx` builderCode value.
- After any Vercel deployment of `apps/api`.
- Before closing a sprint (sweep all six game subdomains).
- Whenever a developer reports their dashboard "doesn't show their Builder Code earnings."

## Step-by-step procedure

### Step 1 — verify Vercel production commit matches `main` HEAD

```bash
git rev-parse HEAD                      # local main HEAD
cd apps/api && vercel ls --prod | head  # Vercel production deployment
```

The Vercel production deployment's git commit SHA **must equal** the local `main` HEAD SHA. If they diverge: production is stale. Recovery: `vercel --prod` from `apps/api/` (manual deploy). Why this matters: `turbo-ignore` deprecation can silently skip auto-deploy on shared-package changes; the X10 incident traced to exactly this failure mode. See [CLAUDE.md → "Vercel build skip optimization"](../../../CLAUDE.md) for the canonical write-up.

### Step 2 — trigger a live test submission

Choose ONE path:

**Path A — agent-runner (server-side):**
```bash
gh workflow run agent-runner.yml \
  -f game=clicker \
  -f score=42 \
  -f tournament_id=0x...
```

**Path B — client-side:** open the game subdomain (e.g., https://clicker.skillos.games/), play one round, submit the score with a connected Base Account wallet.

Capture the resulting `txHash` from either path (workflow output, browser console, or the SDK's `data.txHash`).

### Step 3 — capture tx hash + game expected tail

| Game | Expected hex tail (last 22 hex chars of `raw_input`) |
|---|---|
| 2048 | `62635f6f36737a75766731` |
| wordle | `62635f6c30647266673737` |
| sudoku | `62635f69787838687a716c` |
| minesweeper | `62635f3667736b76357671` |
| clicker | `62635f6d35397878796b6d` |
| match3 | `62635f69716f7a37387263` |

If your game isn't in the table, compute it: `Array.from('bc_xxxxxxxx').map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('')`.

### Step 4 — Blockscout `raw_input` verification

```bash
TX=0x...  # from Step 2
curl -s "https://base-sepolia.blockscout.com/api/v2/transactions/$TX" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
raw = d['raw_input']
print(f'raw_input length: {len(raw)} hex chars')
print(f'last 22 chars:    {raw[-22:]}')
"
```

**Pass criteria** (BOTH must hold):
- `raw_input` length is **734** hex chars (= 712 ABI-encoded `submitSoloScore` calldata + 22 hex char dataSuffix tail).
- Last 22 chars match the expected hex tail for the game.

**Fail criteria**:
- Length is **712** (no dataSuffix tail): attribution broken — server-side helper not applied OR Vercel deployment stale.
- Length is 734 but tail mismatches: builder code mismatch — wrong code in production config OR client-side and server-side maps drifted.

### Step 5 — declare verified

Only after both Step 4 conditions pass, declare attribution live. Document in the PR thread:

> Live attribution verified on tx `0x...` — raw_input length 734, tail `62635f...` matches expected `bc_xxxxxxxx` for `<game>`.

## Edge case: X10 silent attribution gap (case study)

**Symptom:** PR #82 merged. CI green. Unit tests (`apps/api/test/games.test.ts`) all asserted correct builder code values. But live tx had NO dataSuffix tail.

**Root cause:** Vercel auto-deploy for `apps/api` was silently skipped because the project had a stale `commandForIgnoringBuildStep` configured to use `turbo-ignore`, and `turbo-ignore` returned "no changes" (false negative). Production stayed on a pre-X10 commit even though `main` had the new helper.

**Detection:** Blockscout `raw_input` for tx `0x18446ccf...` showed length 712 (not 734). The expected tail `62635f6d35397878796b6d` was absent — bytes ended in the ABI-encoded `signature` parameter, no trailing ASCII.

**Fix:**
1. `vercel --prod` from `apps/api/` (manual deploy).
2. `vercel project rm --skip-build-config` to clear the stale `commandForIgnoringBuildStep`.
3. Re-fire a test submit. Verify length 734. Verify tail.
4. Plan a Phase 2 migration to Vercel's path-filter monorepo skipping (per CLAUDE.md investigation).

**Lesson codified:** Unit tests assert helpers. **Only live tx verification proves the bytes hit the chain.** Always run this prompt post-merge.

## Common failure modes + recovery

| Symptom | Cause | Recovery |
|---|---|---|
| `raw_input` length 712 (no tail) | Server-side helper not applied OR Vercel stale | Step 1 (commit match check) → `vercel --prod` if mismatched |
| `raw_input` length 734, tail mismatch | Builder code wrong in deployed config | Update `SkillOSProvider` config OR `apps/api/src/lib/games.ts:BUILDER_CODES`; redeploy |
| Tx not found on Blockscout | Tx not mined yet OR wrong chain | Wait 5s, retry; verify chain is Base Sepolia (84532) |
| All transactions in tournament missing tail | Tournament's submit route never deployed | Step 1 commit check; full redeploy of `apps/api` |
| Some transactions have tail, others don't | Mixed deployment state (canary, branch deploy) | Step 1; identify Vercel deployment that emitted the bad tx |

## What NOT to do

- Don't trust CI green as evidence of live attribution. CI proves unit tests pass against the local source tree; it says nothing about what's actually running in production.
- Don't trust a single passing tx. Spot-check across all six game subdomains if the change touched the shared API.
- Don't paper over a missing tail with a code-side fix without first checking Vercel deployment freshness — the source-code fix is often already there, just not deployed.
- Don't silently swallow a Blockscout API 4xx/5xx — retry once with backoff, then escalate; **never** assume "API is flaky, attribution is probably fine."

## Tooling

For repeat verification, the SkillOS monorepo has `scripts/agent-smoke.mjs` which fires a SIWA round-trip submission + verifies raw_input tail end-to-end. Reuse this; don't write a new verification script per app.

## Cross-reference

- Builder code wiring: [`wire-builder-code.md`](./wire-builder-code.md)
- Error recovery (for chain reverts, not attribution drops): [`error-recovery.md`](./error-recovery.md)
- Operational invariants: [`../README.md`](../README.md) → "Operational invariants"
