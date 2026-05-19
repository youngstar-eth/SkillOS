/**
 * X19 schema-integrity test
 *
 * Static-only: validates that the X19 reconciliation artifacts are
 * consistent and the supporting scripts parse without throwing.
 *
 * What this test does NOT do (deferred per founder-gate):
 *   - Apply migrations to a real database (requires Supabase MCP auth +
 *     founder authorization per spec Phase 7).
 *   - Diff registry against filesystem at test time (covered by the
 *     CI workflow .github/workflows/schema-drift-check.yml, which has
 *     network + secret access this unit-test runner doesn't).
 *
 * What it DOES check:
 *   1. All 9 X19-tracked migration files exist with non-trivial content.
 *   2. Idempotent guard markers present in each Class A2 migration.
 *   3. Pre-push hook syntax parses via `sh -n`.
 *   4. CODEOWNERS includes the supabase/migrations/ pin.
 *   5. CI workflow has the secret-presence soft-skip.
 *
 * Run via: npx tsx --test packages/duel-backend/test/x19-schema-integrity.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

describe('X19 schema reconciliation — file presence', () => {
  const expected = [
    // Class A2 backfill (4)
    'supabase/migrations/v1_20260419_payouts_instant_scope.sql',
    'supabase/migrations/v1_20260419_challenges.sql',
    'supabase/migrations/v1_20260419_challenges_preplay_duel.sql',
    'supabase/migrations/v1_20260419_challenges_onchain_escrow.sql',
    // Class C committed (1)
    'supabase/migrations/v4_20260515b_x15_payment_attempts_canonical_lock.sql',
    // Lock policy artifacts (3)
    'CODEOWNERS',
    '.github/workflows/schema-drift-check.yml',
    '.husky/pre-push',
    // Drift-check script
    'scripts/x19-schema-drift-check.ts',
    // Sprint doc
    'docs/audit-prep/x19-schema-reconciliation.md',
  ];

  for (const path of expected) {
    it(`exists and is non-empty: ${path}`, () => {
      const full = resolve(REPO_ROOT, path);
      assert.ok(existsSync(full), `missing: ${path}`);
      assert.ok(statSync(full).size > 100, `near-empty (< 100 bytes): ${path}`);
    });
  }
});

describe('X19 Class A2 migrations — idempotent guards', () => {
  const a2Files = [
    'supabase/migrations/v1_20260419_payouts_instant_scope.sql',
    'supabase/migrations/v1_20260419_challenges.sql',
    'supabase/migrations/v1_20260419_challenges_preplay_duel.sql',
    'supabase/migrations/v1_20260419_challenges_onchain_escrow.sql',
  ];

  for (const path of a2Files) {
    it(`has idempotent shape: ${path}`, () => {
      const sql = read(path).toLowerCase();
      // At least one of these idempotent markers must be present.
      const hasGuard =
        sql.includes('if not exists') ||
        sql.includes('do $$') ||
        sql.includes('if exists');
      assert.ok(hasGuard, `${path}: no idempotent guard found (if not exists / do $$ / if exists)`);
    });

    it(`references X19 audit-trail header: ${path}`, () => {
      const sql = read(path);
      assert.match(sql, /X19/i, `${path}: missing X19 provenance header`);
    });
  }
});

describe('Pre-push hook — syntax', () => {
  it('parses cleanly via `sh -n`', () => {
    const full = resolve(REPO_ROOT, '.husky/pre-push');
    // `sh -n` parses the script without executing it — equivalent to
    // shellcheck for syntax-level validation in environments without
    // shellcheck installed.
    assert.doesNotThrow(() => {
      execFileSync('sh', ['-n', full], { stdio: 'pipe' });
    });
  });
});

describe('CODEOWNERS — supabase migrations pin', () => {
  it('pins supabase/migrations/ to a code owner', () => {
    const owners = read('CODEOWNERS');
    assert.match(
      owners,
      /^supabase\/migrations\/\s+@/m,
      'CODEOWNERS: supabase/migrations/ must be pinned to a code owner',
    );
  });
});

describe('CI drift workflow — secret-presence soft-skip', () => {
  it('skips with warning when secrets are unset (avoids chaos on first land)', () => {
    const wf = read('.github/workflows/schema-drift-check.yml');
    assert.match(
      wf,
      /HAS_PROJECT_REF/,
      'workflow: missing the secret-presence guard',
    );
    assert.match(wf, /paths:\s*\n\s*-\s*'supabase\/migrations\/\*\*'/, 'workflow: missing the path-scoped trigger');
  });
});

describe('X19 drift-check script — basic structure', () => {
  it('exits non-zero when env vars are missing', () => {
    // Spawn the script with NO env vars; expect exit 2.
    const result = (() => {
      try {
        execFileSync(
          'npx',
          ['tsx', 'scripts/x19-schema-drift-check.ts'],
          {
            cwd: REPO_ROOT,
            env: { PATH: process.env.PATH, NODE_PATH: process.env.NODE_PATH ?? '' },
            stdio: 'pipe',
          },
        );
        return { code: 0 };
      } catch (err: unknown) {
        const e = err as { status?: number };
        return { code: e.status ?? -1 };
      }
    })();
    assert.equal(result.code, 2, 'expected exit 2 when SUPABASE_* env unset');
  });
});
