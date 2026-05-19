/**
 * X19 Schema drift check — compares Supabase `schema_migrations` registry
 * against `supabase/migrations/` filesystem on the current commit.
 *
 * Used by:
 *   - .github/workflows/schema-drift-check.yml (CI gate on PRs + nightly)
 *   - .husky/pre-push (optional — only when DRIFT_CHECK_PREPUSH=1)
 *
 * Exit codes:
 *   0 — registry and filesystem agree
 *   1 — drift detected; report written to DRIFT_REPORT_PATH (default
 *       /tmp/drift-report.json) for downstream consumers (PR comment).
 *   2 — invocation error (missing env, network failure, etc.)
 *
 * Auth:
 *   SUPABASE_PROJECT_REF      = e.g. clizuqvtkekzxiflbsyr
 *   SUPABASE_SERVICE_ROLE_KEY = JWT with at least SELECT on
 *                                supabase_migrations.schema_migrations
 *
 * Per docs/audit-prep/x19-schema-drift-analysis.md §2.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface RegistryRow {
  version: string;
  name: string;
}

interface DriftReport {
  registry_only: RegistryRow[]; // in registry but no file
  filesystem_only: string[];    // file but no registry row
  matched_count: number;
  checked_at: string;
  project_ref: string;
}

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPORT_PATH = process.env.DRIFT_REPORT_PATH ?? '/tmp/drift-report.json';
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ?? 'supabase/migrations';

if (!PROJECT_REF || !SERVICE_KEY) {
  console.error(
    'X19 drift check: SUPABASE_PROJECT_REF and SUPABASE_SERVICE_ROLE_KEY required.',
  );
  process.exit(2);
}

async function fetchRegistry(): Promise<RegistryRow[]> {
  // PostgREST: GET /rest/v1/schema_migrations?select=version,name
  // schema_migrations lives in the `supabase_migrations` schema; route via
  // the Accept-Profile header.
  const url = `https://${PROJECT_REF}.supabase.co/rest/v1/schema_migrations?select=version,name`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Accept-Profile': 'supabase_migrations',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Registry fetch failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as RegistryRow[];
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Filename-to-version mapping mirrors the registry conventions.
 *
 * Two filename patterns coexist in the repo today:
 *   - v{phase}_{YYYYMMDD}[suffix]_{name}.sql  (e.g. v4_20260515b_…)
 *   - vYYYYMMDD_{name}.sql                    (older Phase 1 form)
 *
 * Registry version is the 14-digit timestamp Supabase assigned at apply
 * time (e.g. 20260515173813). The mapping is provided by an explicit
 * inventory in docs/audit-prep/x19-schema-drift-analysis.md Appendix A.
 * Rather than re-derive it brittlely, we compare the FILE-DERIVED `name`
 * field against the registry `name` field, which is stable across both
 * patterns.
 */
function fileNameSlug(file: string): string {
  // Strip `.sql` and the optional `vN_` / `vYYYYMMDD_` prefix.
  return file
    .replace(/\.sql$/, '')
    .replace(/^v\d+_\d+[a-z]?_?/, '')
    .replace(/^v\d{8}_/, '');
}

function registryNameSlug(row: RegistryRow): string {
  // Registry stores names in two forms historically:
  //   1. Pre-rebrand: bare slug (e.g. "ai_layer", "leaderboard")
  //   2. Post-rebrand: full `v{phase}_{date}_{name}` (e.g. "v2_20260421_duels")
  // Normalize to bare slug for the symmetric-diff comparison.
  return row.name
    .replace(/^v\d+_\d+[a-z]?_?/, '')
    .replace(/^v\d{8}_/, '');
}

async function main(): Promise<void> {
  let registry: RegistryRow[];
  try {
    registry = await fetchRegistry();
  } catch (err) {
    console.error('Registry fetch failed:', err);
    process.exit(2);
  }

  const files = listMigrationFiles();
  const fileSlugs = new Set(files.map(fileNameSlug));
  const registrySlugs = new Map(
    registry.map((r) => [registryNameSlug(r), r]),
  );

  const registry_only: RegistryRow[] = [];
  for (const [slug, row] of registrySlugs) {
    if (!fileSlugs.has(slug)) registry_only.push(row);
  }

  const filesystem_only: string[] = [];
  for (const file of files) {
    if (!registrySlugs.has(fileNameSlug(file))) filesystem_only.push(file);
  }

  const matched_count = files.length - filesystem_only.length;
  const report: DriftReport = {
    registry_only,
    filesystem_only,
    matched_count,
    checked_at: new Date().toISOString(),
    project_ref: PROJECT_REF!,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (registry_only.length === 0 && filesystem_only.length === 0) {
    console.log(
      `X19 drift check: OK — ${matched_count} migrations agree between registry and filesystem.`,
    );
    process.exit(0);
  }

  console.error('X19 drift check: DRIFT DETECTED');
  console.error(`Registry-only (no file): ${registry_only.length}`);
  for (const r of registry_only) console.error(`  ${r.version}  ${r.name}`);
  console.error(`Filesystem-only (no registry row): ${filesystem_only.length}`);
  for (const f of filesystem_only) console.error(`  ${f}`);
  console.error(`\nReport: ${REPORT_PATH}`);
  console.error(
    'Triage: docs/audit-prep/x19-schema-drift-analysis.md §5 (incident runbook).',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('X19 drift check: unexpected error', err);
  process.exit(2);
});
