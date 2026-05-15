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
