# SkillOS — Δ1 Arena Config Object SPEC (Phase 2)

> **Status:** Draft for founder lock. **Child of** Settlement & Verification SPEC §2 (Δ1 layer).
> **Grounded in:** P2M-0 gap-matrix (struct at `TournamentPool.sol:174-195`, `v2_tournaments`, per-route Zod, SDK `api.gen.ts`).
> **VTP:** build agent MUST read the actual `Tournament` struct + `v2_tournaments` migration before implementing — derive exact field names/placement from real code, not from this SPEC's assumed names.

---

## 1. The 8 dimensions (config schema)

| Dim | Type | Values |
|---|---|---|
| `entry` | enum | `FREE` · `FEE` (+ `feeAmount` when FEE) |
| `prizeSource` | enum | `PLAYER_POOL` · `SPONSOR` · `NONE` |
| `format` | enum | `PVP` · `SOLO_SUBMIT` |
| `verification` | enum | `DETERMINISTIC_REPLAY` · `STAKED_RESOLUTION` |
| `dataTier` | enum | `T0` · `T1` · `T2` · `T3` |
| `creditedAxes` | list | axis IDs (core-5 + custom) + scoring→SP weight each |
| `resolution` | enum (+params) | `HIGHEST_SCORE` · `BRACKET_ELIM` · `THRESHOLD` |
| `dataRights` | struct | disclosed-at-entry consent flags (opt-in) |

Plus `seedCommit` (commit-reveal ref, per Settlement SPEC seam #2).

---

## 2. Validity rules (cross-dim — "legal profile derives from config")

Enforced at config creation (reject/flag non-clean combos):

1. `verification = DETERMINISTIC_REPLAY` ⇒ `dataTier ≥ T2` (input log required to replay).
2. **Legal-clean entry×prize matrix:**
   - `FEE` + `PLAYER_POOL` → skill-contest ✓
   - `FREE` + `SPONSOR` → sweepstakes-clean ✓
   - `FREE` + `NONE` → SP-only, no concern ✓
   - `FEE` + `SPONSOR` → paid-entry + sponsor prize = **flag** (consideration + sweepstakes = messy) — reject by default
3. `format = SOLO_SUBMIT` ⇒ `resolution ∈ {HIGHEST_SCORE, THRESHOLD}` (Solo can't be bracket-elim); `format = PVP` ⇒ `resolution ∈ {BRACKET_ELIM, ...}`.
4. `verification = STAKED_RESOLUTION` ⇒ requires resolver config (SP threshold + USDC stake) — links to Challenge & Dispute Economics SPEC.

---

## 3. On-chain vs off-chain split (gas + bytecode discipline — KEY sub-decision)

Minimize the on-chain struct (every field = bytecode + storage + immutability). Proposed:

- **On-chain (`Tournament` struct, settle/verification/legal-relevant):** `entry` type + `feeAmount`, `prizeSource` discriminator, `format`, `verification` family, `seedCommit`, `resolution` policy.
- **Off-chain (`v2_tournaments` + API, descriptive):** `creditedAxes` + weights, `dataRights` detail, `dataTier`, custom-axis metadata.
- Rationale: settle() + the verification/payout path only need the on-chain set; the rest is descriptive config the API/DB owns.

✅ **LOCKED** (2026-05-28): split confirmed. Build note: if SP crediting at settle needs `dataTier`/`creditedAxes`, pass them as settle calldata rather than storing in the struct (keep struct minimal).

---

## 4. Landing points (from recon)

- **On-chain:** extend `TournamentPool.Tournament` struct → new bytecode → **v2.2 → v2.3 redeploy** (deployed today = v2.1; v2.2 on-disk adds split fee buckets + bracket stub). The redeploy is a separate ceremony (wallet topology + assertion script per Invariants §9).
- **DB:** single forward migration on `v2_tournaments` adding config enums/columns.
- **API:** route Zod schemas (the config object validated here; validity rules §2 live here).
- **SDK:** regenerate `packages/sdk/src/api.gen.ts` from live Hono OpenAPI (`emit-openapi.ts`); CI drift guard at `.github/workflows/codegen-drift-check.yml`. **Fix during regen:** drift-flag #7 — `AgentScoreSubmitInput` missing `game` field (MCP currently inlines it to route around).

---

## 5. Build sequencing + dispatch

1. Lock the on/off-chain split (§3).
2. Struct extension + v2.3 (contract) — **HIGH dispatch-safety** (bytecode + redeploy ceremony).
3. DB migration (forward-only) — MED.
4. API Zod + validity rules — MED.
5. SDK regen + `game`-field fix — LOW-MED (codegen; verify consumer build, pattern-lock β).

**Dispatch:** struct/redeploy = **stage-split workflow + founder sign-off** (touches deployed bytecode). DB/API/SDK can follow as a chained stage once struct lands. Δ1 gates the v2.3 redeploy that Δ2 (bracket) + Δ7 (ArenaCreator) also ride.

---

## 6. Open items

- `creditedAxes` storage shape (column vs join table) — ties to per-axis SBT (Δ-SP) + custom-axis registry (P2.5).
- `dataRights` consent schema detail → reconciles with Δ9 (data-sovereignty RLS).
- Custom-axis support: P2 = core-5 fixed enum; arena-declared custom axes = P2.5 (don't build the registry yet).
