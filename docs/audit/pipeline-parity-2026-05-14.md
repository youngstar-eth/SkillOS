# Phase 1 Contract Pipeline Parity Audit

**Date:** 2026-05-14
**Branch:** fix/x19b-fee-vault-separation (working tree; `foundry.toml` carries the post-PR#85 X19a pin from commit e8fc6b5)
**Foundry:** forge 1.5.1-stable
**Chain:** Base Sepolia (84532)

## Canonical `foundry.toml` settings (post-PR#85 / X19a)

```
solc = "0.8.26"
optimizer = true
optimizer_runs = 200
via_ir = true
evm_version = "cancun"
bytecode_hash = "ipfs"
remappings = [
  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
  "forge-std/=lib/forge-std/src/",
]
```

## Summary

| Contract | Address | Verdict | Action |
|---|---|---|---|
| TournamentPool v2.1 | 0x52049b…02da | MISMATCH — pipeline drift (`via_ir`) + source drift (v2.2 WIP in `src/`) | (a) `[profile.phase1-legacy]` override pinned to v2.1 source commit eb2bc0d |
| SponsorshipModule | 0xD76670…ff87 | MISMATCH — pipeline drift (`via_ir`) | (a) `[profile.phase1-legacy]` with `via_ir=false` |
| SponsorReceiptSBT | 0xCCC183…e768 | MISMATCH — pipeline drift (`via_ir`) | (a) `[profile.phase1-legacy]` with `via_ir=false` |
| MockSanctionsOracle | 0x0CB38F…B1CC | UNKNOWN — not verified on Blockscout (but local rebuild byte-matches under `via_ir=false`) | (c) accept-as-is; submit a fresh verification using `via_ir=false` profile to establish a Blockscout record |
| SkillbaseAnchor | 0x9d033b…064ca | UNKNOWN — not verified on Blockscout (but local rebuild byte-matches under `via_ir=false`) | (c) accept-as-is; submit a fresh verification using `via_ir=false` profile to establish a Blockscout record |

**Bottom line:** 0 / 5 reproduce under canonical X19a toml. **5 / 5 reproduce under `via_ir = false`** (TournamentPool also requires the v2.1 point-in-time source @ commit `eb2bc0d`).

## Per-contract findings

### 1. TournamentPool v2.1

- **Address:** `0x52049b812780134d2F69D6c20C2ef881D49702da`
- **Source file:** `contracts/src/TournamentPool.sol`
- **Verified on Blockscout:** YES — full match (no twin, no sourcify fallback)
- **On-chain `compiler_settings` (Blockscout):**
  - `evmVersion`: `cancun`
  - `optimizer.enabled`: `true`, `runs`: `200`
  - `metadata.bytecodeHash`: `ipfs`
  - **`viaIR`: `false`**
  - `libraries`: `{}` (no link)
- **Diff vs canonical X19a toml:** `via_ir` differs (`false` on-chain vs `true` canonical). All other settings match.
- **Bytecode body parity under canonical toml:** FAIL — local `via_ir=true` bytecode is 10935 bytes vs on-chain 12063 bytes (delta 1128 bytes, ~9% smaller from the IR pipeline).
- **Bytecode body parity under `via_ir=false` + CURRENT source:** FAIL — sizes equal (12063 bytes) but bytecode body still differs because `src/TournamentPool.sol` has been modified by 5 v2.2 WIP commits since deploy (v2.1 was 718 lines; current is 832 lines):
  - `c004c18` v2.2 PR1 — chargeEntryFee rename + `Tournament.devAddr`
  - `6d8a5b5` v2.2 PR2 — feeCollected storage refactor + 70/30 split
  - `5eb2a92` v2.2 PR3 — withdrawFees split + access control
  - `42fb94b` v2.2 PR4 — DevAttributionNFT (ERC-5192 soulbound)
  - `9a2580d` v2.2 PR5 — full-lifecycle integration tests
- **Bytecode body parity under `via_ir=false` + v2.1 source @ `eb2bc0d`:** **MATCH**
  - Same length: 12063 bytes.
  - 200 byte-level diffs, **all 200 inside `immutableReferences` slot 1652** (10 positions × 32 bytes = 320 bytes window; the diffs are the deployed immutable values — the trusted-signer / USDC address / etc.).
  - Metadata tail (CBOR + ipfs hash): **byte-identical** including the ipfs digest and `081a` (0.8.26) compiler stamp.
- **Verdict:** **MISMATCH — pipeline drift** (`via_ir`) compounded with **source drift** (v2.2 WIP in `src/`).
- **Recommended fix:** **(a) `[profile.phase1-legacy]` override** + audit-firm submission with v2.1 point-in-time source.
  ```toml
  # contracts/foundry.toml — add alongside default
  [profile.phase1-legacy]
  src = "src"
  out = "out-phase1-legacy"
  libs = ["lib"]
  solc = "0.8.26"
  optimizer = true
  optimizer_runs = 200
  via_ir = false               # KEY DIFF from default
  evm_version = "cancun"
  bytecode_hash = "ipfs"
  remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
    "forge-std/=lib/forge-std/src/",
  ]
  ```
  For audit submission, also pin TournamentPool.sol to **commit `eb2bc0d`** (or extract that file content to `contracts/audit-sources/TournamentPool.v21.sol` and document the provenance). Use `forge verify-contract --profile phase1-legacy …` per the X19a discovery — `forge verify` supports `--profile` to mirror the historical compiler config.

---

### 2. SponsorshipModule

- **Address:** `0xD76670adB574A4C8D06dfF47127e7143d780ff87`
- **Source file:** `contracts/src/SponsorshipModule.sol`
- **Verified on Blockscout:** YES — full match.
- **On-chain `compiler_settings`:** identical to TournamentPool above — `viaIR: false`, `evmVersion: cancun`, optimizer 200, bytecodeHash `ipfs`.
- **Diff vs canonical X19a toml:** `via_ir` differs (`false` on-chain vs `true` canonical).
- **Bytecode body parity under canonical toml:** FAIL — local 2054 bytes vs on-chain 2166 bytes (delta 112 bytes).
- **Bytecode body parity under `via_ir=false` + current source:** **MATCH** — 2166 bytes each, 120 diff bytes all inside 3 immutable slots (54997/55001/55005, 6 positions × 32 bytes). Metadata tail byte-identical.
- **Verdict:** **MISMATCH — pipeline drift** (`via_ir` only).
- **Recommended fix:** **(a)** — same `[profile.phase1-legacy]` block from #1. Current `src/SponsorshipModule.sol` is identical to deployed source; no v2.2 source drift here.

---

### 3. SponsorReceiptSBT

- **Address:** `0xCCC183c72D666A16E03bf38E8c2DFa8a68b2e768`
- **Source file:** `contracts/src/SponsorReceiptSBT.sol`
- **Verified on Blockscout:** YES — full match.
- **On-chain `compiler_settings`:** identical to TournamentPool — `viaIR: false`, `cancun`, 200 runs, `ipfs`.
- **Diff vs canonical X19a toml:** `via_ir` differs.
- **Bytecode body parity under canonical toml:** FAIL — local 5751 bytes vs on-chain 6704 bytes (delta 953 bytes).
- **Bytecode body parity under `via_ir=false` + current source:** **MATCH** — 6704 bytes each, 40 diff bytes all inside immutable slot 54559 (2 positions × 32 bytes — the SponsorshipModule address and one other immutable). Metadata tail byte-identical.
- **Verdict:** **MISMATCH — pipeline drift** (`via_ir` only).
- **Recommended fix:** **(a)** — same `[profile.phase1-legacy]` block.

---

### 4. MockSanctionsOracle

- **Address:** `0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC`
- **Source file:** `contracts/src/MockSanctionsOracle.sol`
- **Verified on Blockscout:** **NO** — `is_verified: null`, no twin, no sourcify URL. Blockscout has no ground-truth `compiler_settings` to compare against.
- **Bytecode body parity under canonical toml:** FAIL — local 758 bytes vs on-chain 829 bytes (delta 71 bytes).
- **Bytecode body parity under `via_ir=false` + current source:** **MATCH** — 829 bytes each, **zero immutables**, body before metadata is byte-identical, metadata tail is **byte-identical** including ipfs hash. This is a near-deterministic proof the deployed binary came from the current `src/MockSanctionsOracle.sol` under `via_ir=false`.
- **Verdict:** **UNKNOWN** by the audit-strict criterion (no Blockscout-verified record exists), but **MATCH** by local rebuild evidence.
- **Recommended fix:** **(c) accept-as-is with vendor lock-in.** This is a test-shim oracle (always returns `false`). For Phase 2 audit prep:
  1. Submit a fresh Blockscout verification using the `[profile.phase1-legacy]` profile so a verified record exists. After that, this row upgrades to a clean MATCH.
  2. No re-deploy needed; no source drift; no architectural risk.

---

### 5. SkillbaseAnchor

- **Address:** `0x9d033b3a9ad12955222169b21c8cd487d84064ca`
- **Source file:** `contracts/src/SkillbaseAnchor.sol`
- **Verified on Blockscout:** **NO** — `is_verified: null`, no twin, no sourcify URL.
- **Bytecode body parity under canonical toml:** FAIL — local 1223 bytes vs on-chain 1470 bytes (delta 247 bytes).
- **Bytecode body parity under `via_ir=false` + current source:** **MATCH** — 1470 bytes each, **zero immutables**, body byte-identical, metadata tail byte-identical (ipfs hash + `081a` compiler stamp match exactly).
- **Verdict:** **UNKNOWN** by audit-strict criterion, **MATCH** by local rebuild evidence.
- **Recommended fix:** **(c) accept-as-is.** Same path as MockSanctionsOracle: submit Blockscout verification under `[profile.phase1-legacy]` to establish the verified record. SkillbaseAnchor is a stateless attestation contract — `accept-as-is` is safe.

---

## Cross-cutting findings

1. **All 5 Phase 1 contracts were deployed under `via_ir = false`.** The X19a pin (commit `e8fc6b5`, today 2026-05-14 19:51 +03) flipped the canonical to `via_ir = true` because the newer ChallengeEscrow had been deployed with `via_ir = true`. That fix is correct for ChallengeEscrow but creates audit-reproducibility drift for the entire pre-X19a Phase 1 set. The default profile is now valid for ChallengeEscrow and *invalid* for the 5 contracts here.
2. **All 3 Blockscout-verified Phase 1 contracts have identical compiler_settings** (cancun, 200 runs, ipfs, viaIR=false, same 5-entry remappings list). This means a single `[profile.phase1-legacy]` profile covers all 5 — no per-contract profile needed.
3. **TournamentPool source has v2.2-WIP modifications in `src/`** that were never deployed. PRs #49–#55 (commits `c004c18` through `9a2580d`) are merged to the audit branch. The on-chain v2.1 contract is at the older commit `eb2bc0d` (2026-04-29). For audit-firm submission of TournamentPool, the source must be point-in-time pinned, not pulled from `src/` HEAD.
4. **MockSanctionsOracle and SkillbaseAnchor are unverified on Blockscout** despite the project README saying SkillbaseAnchor went through a verification step (see `deployments/sponsor-stack-base-sepolia.json` — the artifact only claims verification for TournamentPoolV21, SponsorReceiptSBT, SponsorshipModule). The local rebuild evidence is strong but doesn't substitute for a Blockscout-verified record. The audit firm will need verified explorer records as their canonical reference.
5. **Legacy v2.0 TournamentPool (`0x5CadD…aA9d1`)** is mentioned as verified-via-point-in-time-commit `9e0b593` in the deployment artifact — same playbook the audit firm will use for the v2.1 source pinning above. Cross-checking that pattern is already implicit in option (a).
6. **`appendCBOR: true`** is on for all 3 verified contracts. CBOR metadata is appended; the IPFS digest is reproducible under our pipeline (proven by tail-equal in all 5 contracts after using the correct settings). This is the expected Foundry default; no special action needed.
7. **Selector forensics:** Not needed — none of the 5 contracts show selector-count differences. The diffs all fall inside immutable ranges, which is the orthogonal explanation. The "missing function" path the playbook warns against is not relevant here.

## Recommended sequence for Phase 2 audit prep

1. **Add a `[profile.phase1-legacy]` block to `contracts/foundry.toml`** (literal text given in finding #1). One profile covers all 5 contracts. Do NOT remove the default `via_ir = true` — ChallengeEscrow and future Phase 2 deploys depend on it.
2. **Pin TournamentPool v2.1 source point-in-time** by extracting commit `eb2bc0d`'s `contracts/src/TournamentPool.sol` to a fixed location for the audit firm's submission packet. Two options:
   - Copy file to `contracts/audit-sources/TournamentPool.v21.sol` with a brief provenance header comment pointing at commit `eb2bc0d`.
   - Or: instruct the audit firm to checkout `eb2bc0d` and build only TournamentPool there with `--profile phase1-legacy`.
   The other 4 contracts can use HEAD `src/` (they have no source drift).
3. **Submit fresh Blockscout verifications for MockSanctionsOracle (`0x0CB38F…B1CC`) and SkillbaseAnchor (`0x9d033b…064ca`)** under `[profile.phase1-legacy]` so the audit firm has a Blockscout-verified record to point at instead of relying on our local rebuild evidence.
   ```
   forge verify-contract 0x0CB38F0A0511aF07FC34A20DCaB9e2Fc8061B1CC \
     src/MockSanctionsOracle.sol:MockSanctionsOracle \
     --chain 84532 --verifier blockscout \
     --verifier-url 'https://base-sepolia.blockscout.com/api' \
     --profile phase1-legacy
   ```
   (Same shape for SkillbaseAnchor.)
4. **Hand the audit firm a single tuple of standard-JSON inputs per contract.** For each of the 5, the firm submits to their tool: address + source files + compiler version 0.8.26 + the `[profile.phase1-legacy]` settings JSON. Bytecode reproducibility is then a one-shot diff with the parity script in `/tmp/parity-check.py` (or the firm's equivalent). All 5 should byte-match outside immutable slots.
5. **Document the X19a pipeline split in `docs/adr/`** (or wherever Phase 2 ADRs land). Capture: "Default profile uses `via_ir = true` for ChallengeEscrow + Phase 2 deploys. `phase1-legacy` profile uses `via_ir = false` for the 5 pre-X19a Base Sepolia deploys." This is the durable record an auditor or future engineer needs to navigate the dual-profile setup.
6. **(Optional Phase 2 hygiene)** Once mainnet redeploys land, retire `[profile.phase1-legacy]` along with the testnet contracts it covers. The default `via_ir = true` profile is the only one for the mainnet generation.

## Appendix — proof-of-method log

All comparisons used the standard immutables-aware byte-equality test from the playbook (`reference_blockscout_verify_diagnosis_playbook.md`):
- TAIL = 53 bytes (51-byte CBOR + 2-byte length suffix) excluded from body equality test
- `immutableReferences` ranges pulled from `out/<C>.sol/<C>.json`
- Byte offsets inside any immutable range marked exempt; only diffs OUTSIDE those ranges count toward "body diff"
- Metadata tail checked separately for ipfs-hash equality (proves source + settings byte-identical to deployment)

Build sequence used for the audit:
1. `cd contracts && forge build` under post-X19a default profile → all 5 MISMATCH on size
2. `FOUNDRY_VIA_IR=false forge build --skip test --force` → 4/5 byte-match (sizes and metadata tails)
3. For TournamentPool only: `git show eb2bc0d:contracts/src/TournamentPool.sol > src/TournamentPool.sol; FOUNDRY_VIA_IR=false forge build src/TournamentPool.sol --skip test --skip script --force` → byte-match
4. Restored `src/TournamentPool.sol` to working-tree HEAD after extraction (no source on disk was changed permanently by this audit; `forge clean` not run, ChallengeEscrow artifacts preserved).

No git commits, no push, no PR. Working-tree `src/TournamentPool.sol` was temporarily swapped then restored; verify with `git status` shows no modifications from this audit.
