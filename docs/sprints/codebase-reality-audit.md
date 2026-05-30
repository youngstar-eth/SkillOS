# Codebase Reality Audit — v1.12 §10 Gap Map (contract-centric)

**Sprint:** Codebase Reality Audit (Pass 2) · **Date:** 2026-05-30 · **Branch:** `delta1-arena-config` @ `200bc01` (worktree)
**Status:** READ-ONLY audit. No contract / schema / route / deploy change. This artifact + a summary are the only deliverables. **Gate: STOP at report.** Founder + Claude plan phases FROM this map — this document contains **no** phase or sequencing recommendation.

**Authority:** `docs/SkillOS-Strategic-Memory-v1_12.md` (180 lines, on disk) is canonical. `docs/architecture/architecture-planning.md` is the stale pre-v1.12 base — historical only; conflicts are flagged. This pass is contract-centric (per founder redirect mid-audit): primary scope = `contracts/` (Solidity src + `script/` + `test/` + `deployments/`) + the deployed bytecode on Base Sepolia (via `cast`) + `packages/contracts` (ABIs/addresses). Off-chain code is cited only as evidence of whether an on-chain mechanism is actually enforced.

---

## Provenance & method

Three surfaces per row, per the §2.10 Triangulation Budget invariant:

- **Memory** — v1.12 §/Δ canonical decisions; the prior `docs/sprints/p2m-0-recon/gap-matrix.md` (2026-05-28, "P2M-0").
- **Repo** — on-disk Solidity, with `file:line`.
- **Runtime** — live Base Sepolia state via `cast` (chainId 84532, RPC `https://sepolia.base.org`, `cast 1.5.1`).

Engine: one `cast` recon agent (deployed reality) + nine parallel contract investigators (TournamentPool config/format/seed; fee/segregation/anticheat; ChallengeEscrow; DevAttribution/ArcadePool; sponsor stack/sanctions/anchor; missing contracts; deploy scripts/tests; packages/contracts sync; trustless-claim audit).

### Verification provenance (honest-framing-inward)

The subagent session suffered intermittent output-channel drops (one agent's first two structured outputs were corrupt/fabricated and were **superseded** by a corrected third; another could not re-grep and carried the on-chain agent's citations). Because of this, **every headline finding below was independently re-verified first-party this session** by the auditor via `grep -n` over the current source and/or direct `cast` calls that returned real output. Claims that could NOT be auditor-re-verified (a late-session channel degradation) are explicitly tagged **[carried: subagent + 5/28 recon]** and are all off-chain/test-layer secondary details corroborated by the independently-authored 2026-05-28 recon.

**First-party re-verified this session (grep -n on current source + cast):** TournamentConfig struct + enums + nesting; fee constants + absence of any fee setter; bracket stub + error + typehash; the full on-chain anticheat surface; the three segregated accumulators; **the seedCommit-stored-but-never-read settle path** (headline); SkillbaseAnchor's epoch-root shape; ArcadePool orphan pragma + ref set; the stale `packages/contracts` ABI + addresses; and via auditor `cast`: live `owner()`, `SponsorshipModule.POOL()`=v2.1, DevAttribution `name()`/`symbol()`.

---

## Deployed three-way reality — Base Sepolia (chainId 84532), cast-verified 2026-05-30

> **Headline deploy delta vs the 2026-05-28 recon:** the two contracts P2M-0 recorded as **NOT deployed** are now **LIVE and BaseScan-verified.** The Δ1 branch broadcast v2.3 + DevAttributionNFT between 5/28 and 5/30.

| Contract | Address | cast `code` | Status vs 5/28 | Notes (cast / source) |
|---|---|---|---|---|
| TournamentPool **v2.3** | `0x6c94b94b0A6a05c99AbA7D344097Fa5bF7cb1f78` | yes (30411 hex) | **NEW — now LIVE** | `owner()`=`0x3a4F…95EEe`; `trustedSigner()`=`0xA24f…5692` (canonical three-Ds); `DEV_BPS()`=7000; `PLATFORM_BPS()`=3000; `ENTRY_FEE()`=1e6; `getTournament(bytes32)`, `feeCollected_dev`, `feeCollected_platform`, `excluded` selectors all live; `startBracketRound(…)` **reverts `0x0c8a9d45` = `ReservedForV23()`** |
| DevAttributionNFT | `0x7B132Bfa5Fe682C05E0Ed35b87526C74BA3f95Aa` | yes (6773 hex) | **NEW — now LIVE** | auditor cast: `name()`="**Skillbase Dev Attribution**" (pre-rebrand string baked in bytecode), `symbol()`="SBDEV"; source = ERC-721 + ERC-5192 soulbound |
| TournamentPool v2.1 (old) | `0x52049b812780134d2F69D6c20C2ef881D49702da` | yes (24129 hex) | unchanged | superseded; single `feeCollected`; **still the pool SponsorshipModule points at** (below) |
| ChallengeEscrow | `0x52e5E45456DeC882048b430a968Cda6061575be0` | yes (10057 hex) | unchanged | live 1v1 PvP; env-injected; **not** in sponsor-stack json `[carried]` |
| SponsorshipModule | `0xD76670adB574A4C8D06dfF47127e7143d780ff87` | yes | unchanged | auditor cast: **`POOL()`=`0x52049b81…` (v2.1), NOT v2.3 `0x6c94`** |
| SponsorReceiptSBT | `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768` | yes | unchanged | ERC-5192 soulbound |
| MockSanctionsOracle | `0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC` | yes `[carried]` | now confirmed | only protocol-layer sanctions gate |

Manifest `contracts/deployments/sponsor-stack-base-sepolia.json` (commit `200bc01`) records `v23DeployBlock 42196774`, `v23DeployTx 0xe2b8285c…358ca`, `verification.status:"verified"` (BaseScan, 2026-05-30T19:00Z), `trustedSigner = scoreSigner = 0xA24f9122…`.

> **Naming caveat (cross-cutting):** the manifest labels `0x6c94` "v2.3", but the source self-labels **v2.2 + Δ1 config** (`DeployTournamentPool.s.sol:69-75`: "constructor UNCHANGED from v2.2 … 70/30 split"; `TournamentPool.sol:226-227` "v2.2 layout + Δ1 `config`"). The deployed "v2.3" is **config-bearing v2.2 lineage** — it carries the Δ1 config struct + fee/prize segregation + the DevAttribution mint, but **not** the bracket body. v1.12 §10 Δ2 reserves the "v2.3 (X22.2) redeploy" name for the bracket-bearing build, which does not yet exist.

---

## Gap map — per v1.12 §10 delta + cross-cutting (evidence-based, three-way)

Gap classes: **aligned · partial · missing · drift-naming · drift-semantic**. AHEAD/BEHIND noted in Notes.

### A / Δ1 — Arena = configurable object (§3, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ1: Arena config object on the tournament struct — entry/prizeSource/format/verification/resolution | **ALIGNED.** `struct TournamentConfig` `TournamentPool.sol:217-225` {entry, feeAmount, prizeSource, format, verification, seedCommit, resolution}; enums `:185-210`; nested `TournamentConfig config` on `struct Tournament` `:251`; set at `_createTournament` (`t.config = config`); emitted `TournamentConfigured`; readable `getTournament` `:1130` | `getTournament(bytes32)` selector live on `0x6c94`; legacy id returns the all-zero `_defaultConfig` (FREE/NONE/SOLO_SUBMIT/DETERMINISTIC_REPLAY/HIGHEST_SCORE) | **aligned** | **AHEAD of 5/28** (config was then only in undeployed v2.2). Config **validity** (legal matrix, format↔resolution) is deliberately deferred off-chain (`:558-561` comment) — contract stores intent, API validates |
| Δ1 per-knob: **scoring axes** + **data tier** recorded on the arena | **MISSING from on-chain config.** No `axes`/`dataTier` field in `TournamentConfig:217-225`; struct comment `:176-178` states descriptive dims (dataTier, credited axes, dataRights) stay off-chain in `v2_tournaments` + API | config tuple is exactly 7 fields (no axes/tier member) | **partial** | Deliberate on/off-chain split, but the §10 Δ1 prose lists axes+tier as on-chain dims → a **doc-vs-code framing mismatch** worth reconciling |

### B / Δ6 + Δ11 — Verification family (replay ⊕ staked-resolution) (§3, §4, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ6: deterministic-replay = the **real, enforced** verification path — server re-simulates from seedCommit, score = f(verified moves) | **DRIFT-SEMANTIC.** `seedCommit` is **stored** (`TournamentConfig.seedCommit:223`, default `bytes32(0):591`, NatSpec `:214`/`:250` "Settlement SPEC seam #2") but **NEVER read after storage** — auditor grep finds the only `seedCommit` occurrences are struct field + default + NatSpec (`:214,:223,:250,:563,:582,:591`), **zero read sites**. `settle:846` and its helpers read only bestScore/matchCount; **grep confirms settle touches no `.config`/`.seedCommit`/`.verification`** (only writer is `t.config = config` at `:627`) | config stores `seedCommit`/`verification`; no settle-time replay observable; trust root = `trustedSigner` | **drift-semantic** | **HIGHEST-RISK.** On-chain the seed is a **write-only field**. The Δ6 "enforced" claim is not met at the contract layer; trust remains the EIP-712 signature (the documented mainnet plausibility blocker). Δ6 engines exist as off-chain TS (`packages/engines`, PR #177/#178) with **no Solidity settle/score call site** |
| Δ6: replay engine first-class (6 games) | Engines merged off-chain: `packages/engines/src/games/{game2048,wordle,sudoku,minesweeper,clicker,match3}.ts` + registry + golden tests `[carried: prior memory + TRUST agent]` | N/A on-chain | **partial** | Real code, off-chain only, unwired to settlement. Reconciliation flags persist: wordle speed-bonus / clicker trust-client / match3 clamp not skill-pure pending a settlement sprint |
| Δ11: staked-resolution (NEW design surface, "not built") | **MISSING.** `ResolutionPolicy` enum `:205-210` = {HIGHEST_SCORE, BRACKET_ELIM, THRESHOLD} — **no STAKED option**; `VerificationFamily:199-204` has a `STAKED_RESOLUTION` label but no stake/slash/dispute/adjudication code in any `.sol` | nothing deployed | **missing** | Matches canon ("not built"). Of the two trustless families, replay is off-chain-unwired and staked is absent → **zero trustless verification is contract-enforced today** |

### C / Δ2 + Δ3 — Format: PvP / Solo Submit (§3, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ2: PvP = **bracket in TournamentPool**; ChallengeEscrow deprecate | **MISSING (by design for this build).** `startBracketRound(bytes32,uint8,address[],bytes32,bytes)` is `external pure → revert ReservedForV23()` `:1118-1126`; error `:97`; `BRACKET_ROUND_START_TYPEHASH:331` = schema-lock only; `format==PVP` records intent only | **cast-PROOF:** `startBracketRound(…)` reverts `0x0c8a9d45` (= `ReservedForV23()` selector); typehash readable | **missing** | Matches §10 Δ2's explicit deferral to the X22.2 redeploy, but means **PvP arenas are non-functional on-chain today**. The live PvP venue is ChallengeEscrow (below) |
| Δ3: Solo = `submitScore`/`submitSoloScore` stays; first-free + paid-retry; EIP-712 trustedSigner | **ALIGNED.** `submitScore:688`, `submitSoloScore:742`; on-chain paid-retry enforcement (`:764-768`); signature verified via `_verifyTrustedSignerSignature:1243` (EIP-712 + ERC-1271 + ERC-6492) | `trustedSigner()`=`0xA24f…5692`, `ENTRY_FEE()`=1e6 live | **aligned** | Solo path exactly per Δ3. **Caveat:** trust = server signature only; the contract never re-derives the score (feeds the §4/Δ6 finding) |

### D / §6 — SP → per-axis SkillCredentialSBT (§6, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| §6: `SkillCredentialSBT` (ERC-5192 / soulbound-1155), per-wallet axis→accrued SP, core-5 | **MISSING.** No such contract (`contracts/src` = ArcadePool, ChallengeEscrow, DevAttributionNFT, ISanctionsOracle, MockSanctionsOracle, SkillbaseAnchor, SponsorReceiptSBT, SponsorshipModule, TournamentPool); auditor grep `SkillCredential` over `contracts/` = 0 hits. `SkillbaseAnchor.sol` is a **flat global SP-snapshot anchor**: `mapping(uint256 => bytes32) public snapshots:53` (header `:20-21` "one global SP ledger, not per-agent"; `anchorSnapshot:79`, `verifySnapshot:106`) — one SHA-256 hash of the whole ledger per timestamp, **not** a per-axis per-wallet ERC-5192 credential | no SkillCredentialSBT address | **missing** | Net-new contract for mainnet. SP today is off-chain (`packages/sp-engine`); on-chain presence = a global ledger-hash anchor only (§D provenance, not the §6 credential) |

### E / Δ8 — Data marketplace (§7, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ8: data-marketplace **contract** + fee + x402 (replaces `/v1/data/*` licensing) | **MISSING (no contract).** No marketplace contract in `contracts/src`. `/v1/data/*` x402 endpoints exist API-side returning `sampleData:true` stubs `[carried: 5/28 recon `data.ts:96`]` — an API stub, not a contract | nothing deployed | **missing** | Net-new contract surface. The x402 payment rail + route shape exist off-chain; the on-chain marketplace + real data source do not |

### F / Δ9 — Data sovereignty (§8, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ9: ownership flags + RLS + consent | **N/A at contract layer** — DB/RLS concern, out of this contract-centric pass. 5/28 recon found it fully absent (no ownership/consent columns; RLS uniform, no per-wallet policies) `[carried: 5/28 recon, surface D]` | N/A | **missing** `[carried]` | Flagged for a DB-surface pass; not a contract artifact |

### G / §5 — Sweepstakes narrowing (sponsor dimension) (§5, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| §5 / INV1: `feeCollected ⊥ prizePool`; sponsors fund pools directly; fees physically cannot reach the pool | **ALIGNED.** Three disjoint accumulators: `Tournament.prizePool:244`, `feeCollected_dev:410`, `feeCollected_platform:417`. `chargeEntryFee` writes only the two fee buckets (`:817-818`), docstring `:792` "Does NOT touch prizePool under any code path"; `fundPrizePool:673` writes only `prizePool`; settle pays from `prizePool` only; withdrawals are bucket-scoped | `feeCollected_dev`/`feeCollected_platform` selectors live (both 0 for fresh id) → segregation in deployed bytecode | **aligned** | **AHEAD of 5/28** (segregation was then only in undeployed v2.2 — now DEPLOYED). Δ1 config addition did not perturb segregation |
| §5 / G: sponsor funds route to the pool, disjoint from fees | **ALIGNED.** `SponsorshipModule.sponsorPool()` pulls sponsor USDC then calls `POOL.fundPrizePool` → only `prizePool` `[carried: SPONSOR agent line cites :122-146; the fundPrizePool→prizePool-only half is auditor-verified]` | **auditor cast: `SponsorshipModule.POOL()` = `0x52049b812780134d2F69D6c20C2ef881D49702da` (v2.1), NOT v2.3 `0x6c94`** | **aligned** (funding) | **NEW deploy-coherence flag:** the live SponsorshipModule's immutable `POOL` still points at the **old v2.1 pool** — sponsor funds do not reach v2.3 without a new module deploy/rebind |
| §2: sanctions oracle is the only protocol-layer gate; screens entrants | **PARTIAL — coverage gap.** Gate wired into the **sponsor** path only: `SponsorshipModule` imports `ISanctionsOracle` (`:9`), holds rotatable `sanctionsOracle` (`:64`), reverts `SponsorSanctioned()` (`:46`). **`TournamentPool` has zero sanctions call** — auditor grep finds one comment hit (`:651` "wraps this call with sanctions screening"), no `isSanctioned` on `submitSoloScore`/`chargeEntryFee`/`fundPrizePool` | `MockSanctionsOracle` live; bound into SponsorshipModule only | **partial** | Sponsor on-ramp screened on-chain; **solo player-entry / score paths are NOT** — player sanctions screening, if any, is off-chain. BEHIND-spec on the player dimension for real-USDC mainnet |

### H / Δ7 — Arena creator (DevAttribution → ArenaCreator + splitter) — KNOWN DRIFT (§7, §9, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ7 (§7,§9): `DevAttribution → ArenaCreator + splitter`; fee % **settable params, not hardcoded** | **DRIFT-SEMANTIC + BEHIND.** Fee % are immutable constants: `DEV_BPS=7000:300`, `PLATFORM_BPS=3000:303`, `TOTAL_BPS=10_000:306`; `:294` comment "any change here is an audit-rescope event". **Only setters in the whole contract are `flagScore:829` + `setTrustedSigner:879` — NO fee setter** (auditor grep). No `ArenaCreator`/`splitter` abstraction; `TournamentConfig` carries no per-arena fee-split knob | `DEV_BPS()`=7000, `PLATFORM_BPS()`=3000, `TOTAL_BPS()`=10000 live; hardcoded 70/30 | **drift-semantic** | Directly contradicts §7 "settable, not hardcoded". Changing the split needs a redeploy + audit re-scope |
| Δ7: attribution artifact = ArenaCreator | **PARTIAL / drift-naming.** Shipped artifact is `DevAttributionNFT` (`:53` ERC-721 + ERC-5192 soulbound; `:66` name "Skillbase Dev Attribution", symbol "SBDEV"; mint `onlyTournamentPool`); bound as immutable `devNFT`, minted idempotently to `devAddr` in `createTournament:643-645` | **DEPLOYED `0x7B13`** (NEW); auditor cast confirms name "Skillbase Dev Attribution" / symbol "SBDEV" | **partial** | Attribution/identity half **present** (soulbound, deterministic tokenId, attributable creator role) under the "dev" name; the **settable-splitter half is missing**. So the gap is partial-semantic, not pure naming. **Pre-rebrand "Skillbase" string is baked into deployed + BaseScan-verified bytecode** |

### I / Δ5 — AntiCheat removal (§9, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ5 / inv.4: AntiCheat heuristic **KILLED** (incl. on-chain `flagScore`/`excluded`); validity is structural/disputed, not policed; substrate doesn't police participants | **BEHIND-SPEC / drift-semantic — fully present + load-bearing.** `mapping … excluded` public `:383`; `event ScoreFlagged:490`; `flagScore(bytes32,address) onlyOwner` sets `excluded[id][player]=true` `:829-835`; `settle` computes `expectedCount` via `_countNonExcluded:852/:1255`; `_verifyRanking` reverts `PlayerExcluded:1274`; excluded score → 0 in effective-score | `excluded(id,addr)` selector live on `0x6c94` → the Δ5-killed surface **is in deployed bytecode** | **drift-semantic** | The owner can exclude a player from settlement by fiat — an operator power inv.4 disavows. Off-chain: `packages/anti-cheat` was **rebuilt** (`docs/sprints/x20-anticheat-rebuild`) and the settle cron calls `flagScore` (`tournaments.ts:986`) `[carried: SCRIPT-TEST + 5/28]`. Δ5 NOT applied on either surface |

### J / Δ10 — NFT / Pixie REMOVED (§0, §9, §10)

| Canonical (v1.12) | Code reality (file:line) | Deployed (cast) | Gap | Notes |
|---|---|---|---|---|
| Δ10: no Item NFT / Auction / Pack / Vault / burn-to-enter | **ALIGNED — clean.** Only two NFTs exist: `DevAttributionNFT` (attribution) + `SponsorReceiptSBT` (sponsor receipt, ERC-5192) — **neither is the Pixie item-NFT.** ERC-1155/Auction hits are vendored OZ/forge-std mocks under `contracts/lib`; "Vault" = `ChallengeEscrow.feeVault` only `[carried: MISSING + 5/28; cross-checked against contracts/src file list]` | only DevAttribution + SponsorReceipt NFTs on-chain | **aligned** | No residue. (`ArcadePool` is a tournament pool, not an item contract — see below) |
| Δ10-adjacent: `ArcadePool.sol` orphan | **Orphan delete-candidate.** `pragma ^0.8.24:2` (looser/older than the `0.8.26` pin on every live contract); **zero `apps/`+`packages/` refs** (auditor grep); referenced only by legacy `script/Deploy.s.sol` (can still `new ArcadePool(...)`) + its own tests | NOT deployed (absent from manifest) | **aligned** (housekeeping) | Dead code + **audit-surface risk**: a stray `Deploy.s.sol` run could broadcast a superseded v1 pool. Clean delete candidate before external audit |

### K / Hermes integration (§3, §10)

| Canonical (v1.12) | Code reality | Deployed | Gap | Notes |
|---|---|---|---|---|
| Δ: `@skillos/mcp` plugin/skill + agentskills.io | **Out of contract scope this pass.** Packages `mcp`, `hermes-mcp-wrapper`, `skills` exist; `docs/hermes-mcp-validation.md` present. Not a contract artifact — deferred to a packages-surface pass | N/A | **unknown (deferred)** | Flagged, not audited in this contract-centric pass |

### L / Positioning (§1, §10)

| Canonical (v1.12) | Code reality | Deployed | Gap | Notes |
|---|---|---|---|---|
| §1: tagline "Prove your skill to get payout!"; DeAI; skill-universal; Scale/Polymarket | **Out of contract scope this pass.** One concrete on-chain residue: deployed + verified DevAttribution bytecode bakes the **pre-rebrand "Skillbase"** string (auditor cast). Broader positioning (README/pitch/apex/OG taglines) deferred to a docs-surface pass | "Skillbase Dev Attribution" on-chain | **partial (pre-rebrand residue)** | apex is a separate repo (`/Users/inancayvaz/skillbase-apex`) — out of scope; sister-update tracking noted |

### Cross-cutting

| # | Concern | Reality (file:line / cast) | Gap | Notes |
|---|---|---|---|---|
| X1 | Naming discipline (neutral primitives) | Deployed solo fn = `submitSoloScore`; fee/creator concept named **"dev"** (`DEV_BPS`, `devAddr`, `DevAttributionNFT`/`SBDEV`) where v1.12 wants neutral **ArenaCreator** | drift-naming | Folds into Δ7. Pre-rebrand "Skillbase" string on-chain (L) |
| X2 | bytes32 tournament IDs | TournamentPool ABI id params are `bytes32`; `packages/contracts` treats consistently (`game-slug.ts`, `match-id.ts`) `[carried: PKG-SYNC]` | aligned | No ID-type drift across contract/package layer |
| X3 | Legal model enforcement (entry × prizeSource) | **Deferred off-chain by design** — contract stores raw config intent; validity (legal matrix, FEE+SPONSOR reject, sweepstakes→sponsor-only) enforced in API/Zod, NOT on-chain (`TournamentPool.sol:558-561`) | partial | On-chain stores intent without validation; the legal-combination guard lives off-chain (verify in an API-surface pass) |
| X4 | Skill-purity / seed-equalization (§4) | `seedCommit` stored in config (`:223`) but **never read/enforced** at settle (auditor-verified) | partial / drift-semantic | Same root as Δ6 (B). Seed-equalization asserted off-chain, not contract-enforced |
| X5 | Auth taxonomy (SIWB/SIWA/x402) + Builder Codes | Out of contract scope; trust root on-chain = single `trustedSigner` (cast `0xA24f…5692`) | n/a (deferred) | Auth implementations are off-chain; deferred |
| X6 | Trustless-claim audit | See dedicated section below | — | Headline: claims outrun on-chain mechanisms |

---

## packages/contracts — published ABI/address sync (cross-cutting, mainnet-relevant)

`packages/contracts` (`@skillos/contracts`) is **hand-maintained** (no codegen, no live re-export from `contracts/out`). **Double staleness at the v2.3 generation** (auditor-verified):

- **ABI is the pre-Δ1 v2.1 surface:** `abi.ts` has flat `createTournament:161`, `getTournament:220`, **single-slot** `feeCollected:377` — and **no** `TournamentConfig`, `startBracketRound`, `feeCollected_dev`/`_platform`, `DEV_BPS`, or `DevAttribution` (auditor grep returned zero matches). It cannot speak Δ1 config and risks a decode mismatch against v2.3's longer `getTournament`.
- **Addresses still default to v2.1:** `addresses.ts:47` `TOURNAMENT_POOL_V2_ADDRESS = "0x52049b81…"` (and `:84` `TOURNAMENT_POOL_V21_ADDRESS` same); **no** reference to live v2.3 `0x6c94` or DevAttribution `0x7B13` (both shipped 5/30, after this file).

Sync gap **widened a full generation**: deployed set + on-disk source advanced to v2.3 while the published consumer package stayed v2.1. (The `null` mainnet-throw hard-blocker from the 5/28 drift list lives in `packages/sdk`, not here `[carried]`.)

---

## Vision ↔ reality divergence summary — ranked by mainnet-criticality

1. **[HIGH · Δ6/§4] Deterministic-replay is not enforced on-chain — settlement trusts a server signature.** `seedCommit`/`verification` are stored but never consumed; `settle` reads only signed scores (auditor-verified: settle path touches no `.config`/`.seedCommit`). Real-USDC payouts at mainnet would rest solely on the `trustedSigner` EIP-712 signature with no on-chain skill/seed verification — the documented plausibility blocker. The §10 Δ6 "real, enforced verification path" claim is, on-chain, a write-only seam.
2. **[HIGH · Δ5/inv.4] The killed AntiCheat surface is live in deployed v2.3.** `flagScore`/`excluded`/`_countNonExcluded`/`PlayerExcluded` are present and load-bearing in `settle` (`excluded()` selector live on-chain). Owner-by-fiat exclusion contradicts "substrate doesn't police participants." Off-chain anti-cheat was *rebuilt*, not deleted.
3. **[HIGH · Δ7/§7] Fee split is hardcoded, not settable; ArenaCreator unrealized.** `DEV_BPS`/`PLATFORM_BPS` are immutable constants with **no setter** (auditor-verified), audit-rescope-locked; config carries no per-arena split knob. The shipped artifact is an attribution NFT, not a splitter.
4. **[HIGH · §6] `SkillCredentialSBT` does not exist.** `SkillbaseAnchor` is a global ledger-hash snapshot anchor (`mapping(uint256 => bytes32) public snapshots:53`, one SHA-256 of the whole SP ledger per timestamp), not a per-axis per-wallet ERC-5192 credential. Net-new contract for mainnet.
5. **[HIGH · Δ8 + Δ11] Two net-new contract surfaces absent:** data-marketplace contract (only API stubs exist) and staked-resolution/dispute (only enum labels record intent).
6. **[MED · §2 compliance] Sanctions gate covers only the sponsor on-ramp, not players.** `SponsorshipModule` screens sponsors; `TournamentPool` has no `isSanctioned` call on the solo entry/score path (auditor grep). For real-USDC mainnet, player sanctions screening is off-chain only — a protocol-layer coverage gap.
7. **[MED · deploy-coherence] `SponsorshipModule.POOL()` still points at v2.1 `0x52049b81`** (auditor cast) — sponsor funds do not reach the new v2.3 pool without a module redeploy/rebind.
8. **[MED · Δ4/Δ2] ChallengeEscrow is the live PvP venue and cannot be retired** until bracket-in-TournamentPool exists (Δ2 is a cast-proven reverting stub). Its CI-enforced `settle-guard` tripwire must be re-pointed at the bracket path, not deleted, on deprecation `[carried: CE agent + 5/28; canon tags both P2/audit]`.
9. **[MED · packages/contracts] Published ABI + addresses are a full generation stale** (v2.1), risking decode mismatch + wrong-pool resolution for consumers.
10. **[LOW · hygiene] `ArcadePool.sol` orphan** (`^0.8.24`, zero refs) with a live deploy script — audit-surface noise; clean delete candidate.

**Aligned / AHEAD (no gap):** Δ1 Arena config on-chain (genuinely landed + deployed + readable); §5 fee⊥prize segregation (three disjoint accumulators, deployed); Δ3 solo path; Δ10 no NFT/Pixie residue; SponsorReceiptSBT ERC-5192.

---

## Trustless-claim audit — where claims outrun mechanisms (inv.8, honest-framing-inward)

The single on-chain trust root for scores is the EIP-712 `trustedSigner` (`0xA24f…5692`). The contract accepts a server-signed score as ground truth and never re-derives it.

| Claim | Location (file:line) | Mechanism exists? | Assessment |
|---|---|---|---|
| Deterministic-replay verification / seed-equalization (Δ6, §4) | `TournamentConfig.seedCommit:223`, `VerificationFamily.DETERMINISTIC_REPLAY:199-204`; settle path `:846`/`:1200`/`:1255` | **No** | `seedCommit` stored, **zero read sites** after storage; settle reads bestScore/matchCount only. NatSpec honestly calls it a "seam," but the §10 Δ6 "enforced" claim is unmet on-chain |
| "Results no party needs to trust" (L3 thesis) | `submitSoloScore:742`/`submitScore:688` → `_verifyTrustedSignerSignature:1243`; `settle:846` | **No** | Single-trusted-signer custody; no multi-party/dispute/challenge/replay fallback. Settlement SPEC concedes on-chain trust = server EIP-712 today |
| PvP bracket supported on-chain (Δ2 / Format.PVP) | `startBracketRound:1118-1126`; typehash `:331` | **No** | Reverting `ReservedForV23()` stub (cast `0x0c8a9d45`). `config.format=PVP` records intent only |
| Settable per-arena fee split (Δ7) | `DEV_BPS`/`PLATFORM_BPS`/`TOTAL_BPS` constants `:300/:303/:306` | **No** | Immutable constants, no setter; a test pins them. Δ7 "settable" has no on-chain surface |
| Staked-resolution dispute/slashing (Δ11) | `VerificationFamily.STAKED_RESOLUTION` label; `ResolutionPolicy:205-210` | **No** | Enum label only; no stake/slash/dispute/adjudication code anywhere |
| Per-axis skill credential (§6) | — | **No** | `SkillCredentialSBT` absent; `SkillbaseAnchor` is an epoch-root hash anchor, not a per-axis credential |
| Δ6 replay engines back the result | `packages/engines/src/games/*` `[carried]` | **Partial (off-chain, unwired)** | Real TS engines, but **no Solidity/settle caller** (the only `verify` consumer is `siwe.ts`, for auth). Reconciliation flags (wordle speed / clicker trust-client / match3 clamp) remain open |
| fee⊥prize segregation ("sweepstakes-safe") | `:246`/`:410`/`:417`, `chargeEntryFee:817-818`, `:792` | **Yes** | Genuinely enforced: three disjoint accumulators, deployed (cast selectors live). The hardcoded split is, ironically, *safer* for §5 than an arbitrary settable one |
| `settle-guard` tripwire enforces §2.10 segregation | `settle-guard.ts:104-126` + 2 CI-gated tests `[carried: CE agent]` | **Yes (but narrower)** | Real + CI-enforced, but its actual job is settle-state **lie-prevention** (DB flips only when escrow `Accepted`), not a literal fee/prize-slot assertion — don't over-read the §2.10 framing |
| Soulbound dev attribution is permanent/non-transferable | `DevAttributionNFT.sol:53` (ERC-721+ERC-5192), `_update` revert, `locked()=true`, mint `onlyTournamentPool` | **Yes** | Genuinely trustless; the attribution half of Δ7 is real |
| §9 post-deploy assertion proves Δ1 config defaults | `AssertTournamentPoolV23.s.sol` (CANARY_ID-gated) `[carried: SCRIPT-TEST]` | **Partial** | Immutables + fee constants always asserted; config-default proof is gated behind an optional `CANARY_ID` — a clean run with it unset passes while only logging a NOTE |

**Bottom line:** of v1.12's two trustless verification families, **deterministic-replay is off-chain and unwired, and staked-resolution is absent** — so **no trustless verification is contract-enforced today**; settlement is trusted-operator custody via a single signer. The contract's own NatSpec is honest about this ("seam", "Settlement SPEC"), but the §10/L3 framing of replay as the *current, enforced* path overstates the deployed reality.

---

## Reconciliation vs the 2026-05-28 P2M-0 recon

| Subject | P2M-0 (5/28) | This pass (5/30, cast-verified) |
|---|---|---|
| v2.3 TournamentPool | NOT deployed (source only) | **DEPLOYED + BaseScan-verified** `0x6c94`, code 30411 hex |
| DevAttributionNFT | NOT deployed | **DEPLOYED** `0x7B13`, name "Skillbase Dev Attribution"/"SBDEV" |
| Δ1 Arena config | only in undeployed v2.2; struct `:174-195` | **on-chain + readable**; struct moved to `:217-225`, nested `:251` |
| Fee/prize segregation | only in undeployed v2.2 | **deployed** (selectors live); `feeCollected_dev:410`/`_platform:417` |
| Δ2 bracket | reverting stub `:990-998` | still a reverting stub `:1118-1126`, **now cast-proven** (`0x0c8a9d45`) |
| Δ7 fee % | hardcoded 70/30 `DEV_BPS`/`PLATFORM_BPS`, no setter | unchanged + **cast-confirmed live** 7000/3000 |
| Δ5 anticheat | `flagScore`/`excluded` `:701-709`/`:724` | unchanged behavior, lines moved (`:383`/`:829`/`:852`/`:1274`); **`excluded` selector live** |
| Δ6 replay enforcement | none on-chain | unchanged — `seedCommit` now *stored* in config but **still never read** at settle |
| SponsorshipModule.POOL | (not probed; no RPC) | **NEW: cast = v2.1 `0x52049b81`, not v2.3** |
| packages/contracts ABI | (not the focus) | **NEW: confirmed pre-Δ1 v2.1, addresses default v2.1** |

Net: the 5/28→5/30 deploy **advances Δ1 (config) + §5 segregation + the Δ7 attribution token**, while leaving **unchanged vs v1.12**: Δ2 bracket (stub), Δ7 settable-fee (hardcoded), Δ5 anticheat (live), Δ6 replay (off-chain only), Δ8/Δ11/§6 (absent).

---

## Gate

Read-only audit complete. **No contract, schema, route, or deploy artifact was changed; no transaction broadcast.** Per the sprint gate: **STOP + report.** This map contains no phase or sequencing recommendation — founder + Claude plan phases from here.
