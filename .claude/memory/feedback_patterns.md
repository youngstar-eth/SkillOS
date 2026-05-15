# Feedback Patterns — SkillOS Monorepo

Project-level pattern memory accumulated across sprints. Each pattern records a recurring operational gotcha, its trigger, detection cue, and the fallback or fix that worked.

> **Provenance note:** Patterns #1–#15 originated in the agent's user-level auto-memory (`/Users/inancayvaz/.claude/projects/-Users-inancayvaz/memory/`) before this file existed. This file is the canonical project-level log from #16 onward; earlier patterns remain in auto-memory and are referenced by their slug there. New patterns should be added here so they live alongside the code they describe.

---

## PATTERN #16 — Multi-worktree `gh` PR merge cleanup quirk

**Trigger:** `gh pr merge --admin` invoked from inside a child `git worktree` while a parent worktree (typically `/Users/inancayvaz/MAS`) still has the target branch (`main`) checked out.

**Symptom:** Command exits non-zero with `fatal: 'main' is already used by worktree at '/Users/inancayvaz/MAS'`.

**Reality:** The remote merge succeeded on GitHub. Only the *local* `main` fast-forward step inside `gh pr merge` failed, because the worktree shell cannot check out `main` while the parent holds it. The PR is merged; the source branch may or may not be deleted depending on the `--delete-branch` flag and where it ran.

**Detection cue:** Immediately after the failure, `gh pr view <#> --json state,mergedAt -q '.state + " " + .mergedAt'` shows `MERGED <timestamp>`. Confirms the remote-side completed.

**Fallback:**
- Branch cleanup: `git push origin --delete <branch>` (skip the local cleanup; main is already updated on the parent worktree once you `git pull` there).
- Avoid the quirk entirely by running `gh pr merge` from the parent checkout, or by exiting the worktree first.

**Discovered:** X15.4 sprint ship — May 15, 2026.

---

## PATTERN #17 — Hidden prior-apply state in migration files

**Trigger:** A Supabase migration file exists on disk AND was already applied to the production database in a previous sprint with a *different* schema than the file's current contents. Common when a migration was edited in-place after partial apply, or when two parallel sessions touched the same forward-only file.

**Symptom:** `supabase db push` (or `apply_migration`) succeeds but the resulting schema does not match the file's intent. Subsequent code that depends on the file's declared schema fails at runtime, often with column-not-found or constraint-mismatch errors that don't surface in CI (because CI runs against a clean DB).

**Detection (mandatory pre-apply):** Pre-apply `information_schema` check. Inventory tables + columns + constraints for the touched object *before* running the migration. Compare against the file's intended state. A non-empty diff means the file is not a fresh application — it's a partial-prior-apply.

**Resolution:**
- Do NOT edit the original migration file in place — it's a forward-only historical record.
- Create a reconciliation follow-up migration with a `_canonical_lock` suffix (e.g. `v4_20260515b_x15_payment_attempts_canonical_lock.sql`).
- The follow-up migration's job is to bring the existing-in-prod schema to match canonical intent, idempotently.

**Idempotency discipline:** Use guarded drops (`IF EXISTS` checks, `DO $$ ... END $$` blocks that introspect `information_schema`) rather than blanket `DROP TABLE IF EXISTS`. A guarded drop on a column that's already been migrated away is a no-op; a blanket drop on a table that holds different data is destructive. Re-running the canonical lock should be a no-op when the schema is already correct.

**Discovered:** X15.8 canonical schema lock for `x15_payment_attempts` — May 15, 2026.

---

## PATTERN #18 — Latent dependency surfaces with call frequency

**Trigger:** A function added in an earlier sprint is invoked from a conditional branch (rare path). A later sprint refactors a hot path through the same function, making its calls unconditional. Compile-time and unit-test surface area looks unchanged; production fails because a runtime dependency the rare branch tolerated being missing is now required on every request.

**Symptom:** First request to the redeployed hot path returns 5xx with an unambiguous "X is not set" / "Y not configured" error. The function works locally if the developer's `.env.local` has the var; CI passes because unit tests inject mocks.

**Example — X15.6 ship (May 15, 2026):** `getAgentAccount()` was added in X15.3 as part of `chargeRetryFeeIfRequired`, behind a `priorSolo > 0` branch (skipped on free-first-slot runs). X15.6's `reserveSoloRun` then started calling `getAgentAccount().address` unconditionally on every solo-match POST. Production began returning `502 RESERVE_FAILED { "AGENT_PRIVATE_KEY is not set" }` because the env var had never been provisioned for the conditional X15.3 path. Surfaced one X15.6 deploy after PR #94 merged.

**Prevention:** During PR review, when a hot path begins calling a previously-conditional helper unconditionally, audit *all* of that helper's runtime dependencies (env vars, network endpoints, IAM permissions, service-role keys, on-chain prerequisites). Production verification ("does `vercel env ls production | grep <KEY>` return a non-empty row?") is the canonical proof for env-var dependencies, not "the function compiles."

**Discovered:** X15.6 production smoke — May 15, 2026.

---

## PATTERN #19 — Env paste ≠ env wired

**Trigger:** `vercel env add <KEY> production` opens an interactive value-paste prompt. Operator pastes the value, sees the shell return to a prompt, assumes the value landed.

**Symptom:** Subsequent deployments behave as if the env var is unset. Operator's mental model is "I added that key, I saw the prompt accept it" — but the value may not have been submitted (terminal scrollback obscures whether the final newline reached `vercel`, or the paste was truncated, or the operator typed `Ctrl-C` instead of `Enter` at the confirmation step).

**Detection (mandatory verify after every `vercel env add`):**

```
vercel env ls production | grep <KEY>
```

Expected output: a row with `Encrypted` and `Production` columns. *No row = the value did not land, regardless of what the interactive prompt appeared to do.* The grep output is the canonical proof; an "I added it" claim from the operator (or from yourself, in a transcript review) is not.

**Anti-pattern:** Claiming the env var was added in a sprint report without surfacing the `vercel env ls` output in the same report. Future-you reading the transcript can't audit the claim.

**Discovered:** X15.6 smoke blocker — May 15, 2026.

---

## PATTERN #20 — Generated secret save discipline

**Trigger:** Running `cast wallet new` (or any one-shot key generator) prints the secret to stdout. Terminal scrollback retains it briefly; closing or restarting the terminal loses it.

**Symptom:** Operator generates a fresh wallet for an X-sprint role (agent-signer, fee-vault rotation, sponsor cold storage), uses the address immediately for env wiring and on-chain funding, then later cannot recover the private key. Testnet outcome: orphan wallet with stuck balance, identity must be rotated. Mainnet outcome: real-value loss + role-rotation incident.

**Fix — save in the same code block that generates:**

- **Foundry keystore (preferred, encrypted at rest):** `cast wallet import <name> --private-key <hex>` immediately after generation, then verify via `cast wallet list`. The keystore lives at `~/.foundry/keystores/`; encrypted under an operator-chosen passphrase.
- **Password manager:** paste the private key into 1Password / Bitwarden / equivalent before the next shell command. Tag with the role name + chain + date of generation.
- **Encrypted local file:** `gpg --symmetric --output <role>.key.gpg` from a heredoc. Keep the unencrypted file out of disk write entirely (pipe through gpg's stdin).

Never rely on terminal scrollback. Never leave the key in a plaintext `.env` file outside the local-development context. Mainnet roles require the encrypted-at-rest path; testnet may tolerate password-manager-only if rotation is cheap.

**Discovered:** X15.6 agent wallet generation — May 15, 2026.

---

## PATTERN #21 — Cross-RPC race on first transaction per address

**Trigger:** Orchestrator code reads contract state via the *public* RPC (read endpoint), broadcasts a state-changing tx via a *premium* RPC (write endpoint, e.g. Alchemy), waits for the receipt via the public RPC, then immediately broadcasts a dependent second tx via the premium RPC. The premium RPC's state-index has not yet picked up the just-confirmed first tx; the premium RPC's pre-broadcast simulation of the second tx sees stale state and rejects.

**Symptom:** Second tx never broadcasts. viem (or the equivalent client) throws a `ContractFunctionRevertedError` with a `revert` reason that contradicts the state your code just verified — typical example: `chargeRetryFee` reverts with `ERC20: transfer amount exceeds allowance` *despite* `allowance()` having just been read as `maxUint256` immediately after the approve receipt landed. Nonce on the broadcaster wallet matches the count of broadcast txs (the failed simulation never incremented it), but the dependent state IS already on-chain via the public RPC's view.

**Example — X15.7 Run 1 (May 15, 2026):** Run 1's `chargeRetryFeeIfRequired` (X15.3) issued an `approve(USDC → TournamentPool, maxUint256)` via Alchemy, awaited the receipt via `sepolia.base.org`, then issued `chargeRetryFee` via Alchemy. Simulation rejected with `exceeds allowance`. Approve tx itself was confirmed (nonce 0 → 1, allowance maxUint256 visible from the public RPC); chargeRetryFee never reached the mempool. The agent's $1.05 x402 had already settled (facilitator-broadcast, no nonce impact on agent wallet). Row marked `needs_manual_review=true` per ADR D9.

**Fix candidates:**

- **Wait 2-3 blocks after approve before broadcasting the dependent call.** Cheapest fix; trades latency for reliability. Implement as `publicClient.waitForBlock({ blockNumber: receipt.blockNumber + 2n })` after the approve receipt.
- **Retry-with-backoff inside the dependent call.** Retry simulation 2-3 times with 1-second backoff; if the premium RPC's state has caught up by retry 2 or 3, the simulation succeeds.
- **Pin the dependent pair to a single RPC endpoint.** Use the same RPC client for the approve broadcast AND the dependent simulation. Premium RPC's view of its own just-accepted transactions is self-consistent; the cross-RPC view is what introduces the race.

Race fires only on the *first* paid retry per agent wallet (after that, allowance is maxUint256 forever and the approve path is skipped). Single-fire per agent identity.

**Discovered:** X15.7 Run 1 — May 15, 2026.

---

## PATTERN #22 — x402 facilitator transient `invalid_exact_evm_transaction_failed`

**Trigger:** A second x402 settlement call from the same agent identity hits the x402.org testnet facilitator within ~2 minutes of a previous successful settlement. Facilitator's mempool / nonce-tracking state lags its acceptance-decision logic.

**Symptom:** Facilitator returns `success: false` with `errorReason: 'invalid_exact_evm_transaction_failed'` and an opaque `errorMessage`. The EIP-3009 payload structure is identical to a previously-accepted payload; the agent's USDC balance is sufficient; the EIP-712 signature verifies correctly; the authorization nonce is fresh-random. An identical request issued 2-5 minutes later cleanly anchors.

**Example — X15.7 Run 3a (May 15, 2026):** First attempt at Run 3, issued ~109 seconds after Run 2 anchored, returned `invalid_exact_evm_transaction_failed`. No USDC moved (facilitator self-aborted before broadcasting `transferWithAuthorization`). Retry attempt 3 minutes later (Run 3b) anchored with identical payload shape. Row from the first attempt remained `status='failed'`, `error_code='X402_SETTLE_FAILED'`; row from the second attempt is the canonical demo runId.

**Fix:** Single retry-with-backoff inside `settleX402Payment` in `apps/api/src/lib/x402-client.ts`. Wait 30 seconds, regenerate authorization nonce (the original may not be safely reusable), re-sign, re-POST to the facilitator. Bail after 2 attempts; the failure mode beyond retry-2 is more likely a structural payload bug than a transient facilitator state lag.

**Caveat:** A retry-with-backoff in this code path needs to be paired with a fresh `randomBytes(32)` nonce for each attempt — replaying the original authorization is unsafe (USDC's `_authorizationStates` map could have the nonce marked used by a delayed first-attempt landing, even if the facilitator returned `success=false`).

**Discovered:** X15.7 Run 3 first attempt — May 15, 2026.

---
