# ADR 0004 — Generated Artifacts Are Regen-Only, Never Hand-Edited

**Status:** Accepted — 2026-05-20
**Sprint:** X24 (Codegen Discipline) — sub-sprint 4 of 4 (closure)
**Deciders:** Founder + X24 Codegen Discipline agent session
**Related:** PR #159 (X24.2 pre-commit hook), PR #161 (X24.3 CI guard + bundle), `docs/architecture/supplements/architecture-doc-supplement-v1.8.md` §2.10/§3.28, CLAUDE.md `## Pre-flight gates` + `### Tooling layered defense`

## Context

The repo has multiple categories of generated artifacts. The first and currently load-bearing one is `packages/sdk/src/api.gen.ts` (the TypeScript SDK types, regenerated from the live OpenAPI spec via `generate-types`). Future candidates: contract ABIs from the Foundry build, GraphQL type unions if a gateway is adopted, OpenAPI client stubs in other languages. Every such artifact has a canonical source-of-truth elsewhere — it is a projection of that source, not an independent file.

The discipline problem this ADR closes is documented at v1.8 supplement §3.28 (instance **v1.8-P1**) and §3.27 (Disclosure 5):

- PR #130 (X14.0 `submitSoloScore` class-enforced submit) and PR #141 (X23 ratings server) shipped contract-changing server code to `main` **without** a corresponding `npm run generate-types` step. The committed `api.gen.ts` on `main` lagged the deployed contract by two sprints (+336/−11 when finally reconciled).
- Hand-edit attempts to patch the gap propagated as **uncommitted WIP across three worktrees** (the stale `chore/enable-ratings-cron` mainline checkout, `main`, and the `feat/x23-3-ratings-api` worktree; §3.28 v1.8-S2).
- A stash-queue forensic surveyed by content (not by index) found **four** near-identical x15-era `api.gen.ts` orphan snapshots, not the assumed three (§3.28 v1.8-P2) — a drift cascade, not a single instance.
- Forensic cleanup (X24.1: stash audit + drop, 5 → 1 entries) was required before the structural fix could ship.

The root cause is structural + process: `api.gen.ts` is a single full-contract generated artifact, but no enforcement bound regeneration to the server-side merges that changed the contract. In the absence of a regen gate, the contract delta was carried as hand-edits — and hand-editing a "do not edit by hand" file is precisely the anti-pattern that multiplies across worktrees, erodes the audit trail, and lets the canonical source-of-truth diverge silently from the published artifact. The pattern recurs whenever a contract delta merges without explicit regen discipline.

### This ADR is a recursive canonical case study of its own subject

The §2.10 Triangulation Budget invariant (codified in the v1.8 supplement) mandates checking the canonical disk surface before asserting an identifier. Two numbering slips demonstrate it self-referentially:

- **v1.8-C3** — the draft spec for §2.10 itself proposed number §2.13; an on-disk `grep` showed the latest invariant was §2.9; GATE-4 triangulation renumbered it to **§2.10**. The Triangulation Budget invariant caught its own naming.
- **v1.8-C7** (NEW, this ADR) — the X24.4 sprint prompt assumed this ADR's number was `0001`; the on-disk `docs/adr/` surface showed `0002` (2026-05-14) and `0003` (2026-05-15) present and no `0001`, with this decision dated 2026-05-20 (the newest). Pre-flight Gate 4 triangulation renumbered it to **0004**. A direct recurrence of the v1.8-C3 pattern — inside the very ADR that documents codegen + verification discipline.

The `0001` slot is left empty as a historical artifact (never created, never deleted); filling it is out of scope for this ADR.

## Decision

Generated artifacts are produced exclusively by their codegen script. **Hand-edits are prohibited.** The repo enforces this through three layered defenses, defense-in-depth across planning, commit, and PR time:

### D1 — Pre-commit hook (X24.2, `.husky/pre-commit`)

Blocks commits that stage hand-edits to `*.gen.ts` / `*.generated.ts`. The hook header documents the **one** sanctioned bypass: `git commit --no-verify` for a script-driven regen catch-up, where the diff is the deterministic output of the codegen script — not a hand-edit. PR #161 commit `f8d638d` is the documented precedent for that bypass.

### D2 — CI guard (X24.3, `.github/workflows/codegen-drift-check.yml`)

On every PR touching `apps/api/**` or `packages/sdk/**`, the workflow re-emits the OpenAPI spec in-process from the PR's own `apps/api`, re-runs `generate-types` against that emitted spec, and fails if `git diff packages/sdk/src/api.gen.ts` is non-empty. This is the canonical PR-time enforcement layer and fires **regardless of local hook state**.

### D3 — This ADR

Documents the policy at the architectural-decision layer so the rule is discoverable independent of the tooling and survives tool churn.

### D4 — Hook activation-lifecycle nuance (v1.8-D5)

`core.hooksPath` is currently stored as the absolute mainline path `/Users/inancayvaz/MAS/.husky` (set when a prior `npm install` ran the `prepare` script). In this state the pre-commit hook **is** visible from linked worktrees — contra the initial framing that worktrees would not fire it. A future `npm install` running `prepare` could flip this back to a relative `.husky`, at which point linked worktrees would stop firing the hook locally.

This is exactly why the layering matters: the CI guard (D2) is the canonical PR-time enforcement and does not depend on any local hook activation. The pre-commit hook (D1) is defense-in-depth, not the sole layer.

### D5 — In-process emit, not live-prod fetch (v1.8-P9)

The X24.3 CI guard does **not** fetch live production for the spec source-of-truth. It loads the PR's `apps/api`, calls `app.request('/openapi.json')`, dumps to a temp file, sets `SKILLOS_OPENAPI_URL=file://…`, and runs regen against that (see `apps/api/scripts/emit-openapi.ts`).

Rationale: `generate-types` fetches live prod by default. Using live prod in CI introduces both false-reds (a legitimate spec-leading PR fails because prod hasn't caught up) and false-greens (a repo-leading prod state passes). In-process emit scopes the check to **same-commit** spec ↔ SDK consistency — exactly the X24.3 intent. Pattern source: the x23-3 fold (`833c621`), reused at X24.3.

## Consequences

### Positive

- **Hand-edit drift is eliminated** at two independent layers (D1 hook + D2 CI guard).
- **Catch-up gaps close in a single PR.** The X14.0 + X23.3 bundle (PR #161 commit `f8d638d`, +336/−11) is the proof: two sprints of lagging SDK types reconciled canonically from the in-process spec.
- **Audit-firm narrative is clean and self-demonstrating.** Layered defense is the canonical artifact; the §2.10 / v1.8-C3 / v1.8-C7 recursion is published as evidence the discipline catches its own slips, not hidden.
- **Future codegen scopes inherit the pattern.** Contract ABIs and GraphQL unions can adopt the same enforcement by extending the hook regex and the CI workflow path filters.

### Negative

- **The `--no-verify` bypass relies on review discipline.** The commit message must justify the bypass (D1); the tool does not enforce that the justification is genuine. PR #161 `f8d638d` sets the documented standard, but a careless future bypass is a review-catch, not a tool-catch.
- **`apps/api/scripts/emit-openapi.ts` is a new maintenance surface** coupled to `apps/api` startup conventions. If the API's bootstrap changes, the emit script must track it.
- **CI latency.** The guard adds ~30s to PRs touching `apps/api/**` or `packages/sdk/**`.

### Neutral

- **Bypass precedent is set, not open-ended.** PR #161 `f8d638d` is the one sanctioned, documented spec-catch-up bypass; future bypasses cite this ADR + that commit rather than inventing fresh justification.
- **No on-chain or runtime surface changes.** This is a tooling + policy decision; the contract, the API, and the SDK consumers are untouched beyond the regenerated types themselves.

## Alternatives Considered

**Live-prod fetch in the CI guard.** Rejected (D5): it conflates same-commit consistency with prod-deployment lag, producing both false-reds and false-greens. In-process emit is network-free and scopes the check correctly.

**Hook-only enforcement (no CI guard).** Rejected: the v1.8-D5 activation-lifecycle nuance means local hook state is not guaranteed across `npm install` runs or worktree configurations. A PR-time CI layer that is independent of local state is required for the guarantee to hold.

**Policy-only (ADR with no tooling).** Rejected: the X14.0 → X23.3 gap is precisely the failure mode of relying on documented intent without an enforcement gate. The structural enabler (missing regen gate) had to be closed in tooling, not just described.

## Future scope (not in this ADR)

Future codegen surfaces requiring the same discipline:

- Contract ABIs (`packages/contracts/abis/*.json`, if generated from the Foundry build)
- GraphQL union types (if a GraphQL gateway is adopted)
- OpenAPI client stubs in other languages (Python, Go) if added

Each addition extends the pre-commit hook regex (D1) and adds a CI guard step / path filter (D2). Document each as ADR-0005+ when implemented.

## References

- v1.8 supplement §2.10 — Triangulation Budget invariant (canonical)
- v1.8 supplement §3.27 Disclosure 5 — spec-codegen drift operational chain (X14.0 SDK catch-up → X24)
- v1.8 supplement §3.28 — drift catalog (instances v1.8-P1, v1.8-S2, v1.8-P2, v1.8-C3; v1.8-C7 NEW this ADR)
- CLAUDE.md `## Pre-flight gates` + `### Tooling layered defense`
- PR #159 — X24.2 pre-commit hook (`.husky/pre-commit`)
- PR #161 — X24.3 CI guard (`.github/workflows/codegen-drift-check.yml` + `apps/api/scripts/emit-openapi.ts`) + bundle commit `f8d638d`
- Commit `833c621` — x23-3 SDK-types catch-up fold (in-process emit pattern source)
- Commit `f8d638d` — X14.0 + X23.3 SDK bundle regen (the documented `--no-verify` precedent)
- ADR 0002 — dual-profile Foundry pipeline split
- ADR 0003 — agent x402 retry payments

## Sign-off

- **Founder:** 2026-05-20 — approved in the X24 Codegen Discipline sprint closure; ADR number reconciled 0001 → 0004 via §2.10 pre-flight triangulation (catalogued v1.8-C7).
