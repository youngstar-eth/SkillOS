# Vendored copy of `@skillos/contracts`

These files are byte-copied from `/packages/contracts/src/` because Vercel's Node runtime can't import the workspace package directly:

- `packages/contracts/package.json` declares `"main": "./src/index.ts"` (raw TypeScript)
- Vercel's Node runtime only transpiles the function entry file, not workspace deps
- At runtime, `import 'contracts'` fails because `.ts` is unparseable as JavaScript

Plus the orthogonal Node-ESM-from-CJS issue documented in `apps/api/src/types/skillos-contracts.d.ts` (now deleted alongside this vendoring).

## When to delete this directory

This directory disappears as part of the **ESM consistency cleanup PR** (memory: `project_esm_consistency_pr.md`). That PR:

1. Adds `"type": "module"` to `packages/contracts/package.json`
2. Adds a build step (`tsc` → `dist/`) so the package's `main` points at compiled JS, not TS source
3. Updates `apps/api/src/lib/contracts.ts` and `games.ts` back to `import from '@skillos/contracts'`
4. Deletes this `contracts-vendored/` directory
5. Re-typechecks all 7 game apps + sponsor + orchestrator + sdk

## Drift risk while this exists

If any address in `addresses.ts` changes (e.g., contract redeploy), this copy must be updated alongside the canonical `packages/contracts/src/addresses.ts`. The TournamentPool v2.1 address has been stable since 2026-04-29; expected drift window is small.
