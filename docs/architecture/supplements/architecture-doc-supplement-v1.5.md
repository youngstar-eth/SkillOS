# SkillOS Architecture Doc — Supplement v1.5 (May 18, 2026)

> **Purpose:** Add five sections to `docs/architecture/developer-surface.md`:
> - §2.6 evolution — 3-layer memory-as-spec drift expansion + 5-layer post-merge verification chain (UPDATED in v1.5)
> - §2.7 — Mainnet wallet rotation + multi-sig discipline (NEW in v1.5)
> - §3.15 — X10b end-to-end chain-verify case study (NEW in v1.5)
> - §3.16 — X14 architectural posture (off-chain enforcement) (NEW in v1.5)
> - §3.17 — X20 moves instrumentation discovery + 0a/0b split rationale (NEW in v1.5)
>
> Plus §3.13 F-letter ambiguity cleanup and §4 Sprint Sequence update marking Cluster 1 first sprint (X10b) complete + chain-verified.
>
> **Approval:** Founder approved May 18, 2026 (post X10b chain-verify session ~00:25 local time, post Cluster 1 scoping PR merges).
>
> **Baseline:** v1.4 (May 17, 2026) remains the architectural invariant baseline. v1.5 is the **operational discipline canonicalization + Cluster 1 first sprint chain-evidence** layered on top.

---

## SECTION TO UPDATE — §2.6 evolution

Replace §2.6 (Memory-as-spec drift invariant) with the following expanded version. The original v1.4 §2.6 documented 5 single-layer drift instances. v1.5 expands the framework to 3 operational layers and codifies the 5-layer post-merge verification chain.

---

### 2.6 Memory-as-spec drift — 3-layer framework + 5-layer post-merge verification

This section catalogs the architectural pattern verification rule derived from May 17-18 cumulative learnings. **Spec assumptions (memory entries, prior chat context, documentation, agent claims) drift from reality across THREE operational layers and require cross-check before any high-stakes prompt or sprint kickoff.**

**The three layers (documented May 17-18):**

| Layer | Drift kind | Detection method | Cost | Example |
|---|---|---|---|---|
| **(a)** Agent claim drift | Source-of-truth (memory entry / agent report) vs actual code | `grep` target file for expected change | <30 sec | Agent PR #121 summary cited solo.ts:477 wire; reality confirmed at line 498 post-pull |
| **(b)** Git state drift | Local main vs remote main vs PR merge status | `git fetch && git log --oneline origin/main \| head` | <30 sec | Founder "yaptık merge" (May 17 late evening); local main 5 commits behind origin |
| **(c)** Deploy runtime drift | Merged commit vs deployed Vercel SHA vs production behavior | `vercel ls \| head` + endpoint curl + chain query | 1-2 min | Vercel auto-deploy completion lag pre-X10b chain-verify session |

**5-layer post-merge verification chain (canonical):**

A sprint is operationally complete when ALL FIVE layers verify:

| # | Layer | Verification | Cost |
|---|---|---|---|
| **(a)** | Code wire | `grep -n "<expected pattern>" <target file>` returns expected line | <30 sec |
| **(b)** | Git remote | `git log --oneline origin/main \| head` shows expected commit | <30 sec |
| **(c)** | Deploy SHA | `vercel ls` top deploy matches main HEAD (or prebuilt recipe runtime-behavioral verify for `apps/api`) | 1-2 min |
| **(d)** | Runtime broadcast | Production endpoint emits expected behavior (curl test or natural traffic) | 1-5 min |
| **(e)** | Chain evidence | On-chain calldata / event matches expected attribution (where applicable) | 2-5 min via Blockscout / cast / BlockchainQuery |

**Cumulative cost: 5-15 minutes for full chain. Recovery cost when skipping: 30-120 minutes per layer drift instance.**

**Architectural invariant:**

Any high-stakes operation (deploy, migration, sprint declaration, audit firm packet artifact) **must execute the appropriate layers of the chain before declaring "shipped"**:

- **Code-only changes** (docs, internal refactor): layers (a) + (b) minimum
- **Backend code changes** (API, cron, indexer): layers (a) + (b) + (c) minimum
- **On-chain attributable changes** (X10, X10b, contract deploys, X11.5): all 5 layers (a)-(e) mandatory
- **Spec / memory updates**: layer (a) drift-check before commit; cross-reference reality before locking

**Cost-of-prevention math:**

Sub-2-min pre-flight prevents 30+ min downstream recovery. May 17-18 thread documented 6+ drift instances. Each prevented saves an order of magnitude in recovery time.

**Living example — X10b end-to-end (May 17-18):**

| Layer | Status | Notes |
|---|---|---|
| (a) Code wire | ✅ Verified post-pull | `solo.ts:498 dataSuffix: dataSuffixForGame(...)` |
| (b) Git remote | ✅ `5c703ab` includes PR #121 (commit `a76c733`) | Initial discovery: local main was 5 commits behind |
| (c) Deploy SHA | ✅ Implicit via runtime behavior | Vercel auto-deploy of game apps completed within 26 min of merge |
| (d) Runtime broadcast | ✅ STUDIO key `0xA24f9122...` tx broadcast 20:37:28 UTC | Server processing latency 10s post user payment |
| (e) Chain evidence | ✅ `bc_o6szuvg1` ASCII hex in calldata tail of tx `0xa454eb5f...0a20` | Direct on-chain attribution evidence |

5-layer verification chain closed within ~3.5 hours of merge. This is the canonical reference for any on-chain attributable sprint going forward.

**Cross-reference:** §3.14 VTP (Verify-Then-Prompt) discipline methodology operationalizes the 3-layer framework into prompt design; §3.15 X10b case study documents the canonical 5-layer evidence chain.

---

## SECTION TO INSERT — §2.7

Insert this section **after §2.6 (Memory-as-spec drift framework)** and **before §3 (Architecture — Layer by Layer)**.

---

### 2.7 Mainnet wallet rotation + multi-sig discipline

This section codifies the mainnet activation invariants for wallet topology. Captured here because mainnet cutover is achievement-gated on funding (per CR1 SYNTHESIS §6 Cluster 3), but discipline itself is binding regardless of timing.

**Wallet rotation discipline (binding for mainnet cutover):**

1. **Zero EOA overlap across role-distinct trust zones.** Deployer, Owner (multi-sig), trustedSigner, STUDIO broadcasters (multiple post-split), AGENT broadcasters (multiple), feeVault, x402 receive — all distinct addresses with no on-chain transfer history between them.

2. **Fresh fiat-onramp origin per role-distinct EOA.** No wallet derived via internal transfer from another SkillOS wallet; each funded via separate fiat onramp transaction.

3. **Testnet wallets NOT mainnet-portable.** All current testnet keys (STUDIO `0xA24f9122...`, AGENT `0xf481b744...`, Legacy AGENT `0x1569A95e...`, etc.) are history-contaminated and replaced at mainnet cutover.

4. **Legacy authorizations revoked.** Pre-X15.3 split AGENT wallet authorizations on ChallengeEscrow must be explicitly revoked before mainnet redeploy (or new mainnet contracts deployed with clean authorization set).

5. **Pre-deploy assertion script.** `forge script` precondition asserting `IPool(deployedAddr).trustedSigner() == manifest.trustedSigner` — manifest drift fails CI. (P2-Pre-Contract scope per CR1.)

**Multi-sig deployment sprint X11.5 — Phase 2 mainnet pre-req:**

Owner role transitions from EOA to multi-sig (Safe Wallet) at mainnet cutover ceremony. **Single-EOA mainnet boot is architecturally rejected.**

**X11.5 sprint scope (~1 week, funding-independent):**

- Safe Wallet deployment on Base mainnet
- Signer key generation + secure distribution (hardware wallets recommended)
- Threshold design (founder decision — typical patterns: 1-of-1 transitional, 2-of-2 founder+counsel, 2-of-3 with advisor or escrow)
- Recovery flow design (signer compromise scenarios)
- Pre-cutover dry-run on Base Sepolia testnet
- Owner role transfer ceremony — single-use, careful (TournamentPool v2.1 + SponsorshipModule + ChallengeEscrow `transferOwnership` calls)
- Documentation + signer responsibility matrix

**Threshold open question (founder strategic decision required):**

Solo founder context, common patterns:

| Pattern | Pros | Cons | Audit firm reception |
|---|---|---|---|
| 1-of-1 founder Safe | Multi-sig upgrade path, audit firm sees Safe Wallet | Functionally EOA, no real decentralization | Acceptable as transitional |
| 2-of-2 founder + counsel | Compromise resistance | Counsel signer per-tx | Strong baseline |
| 2-of-3 founder + counsel + advisor | Recovery scenarios covered | 3rd signer selection complexity | Audit firm preference |
| 2-of-3 founder + counsel + escrow service | Less coordination overhead | External party trust | Acceptable |

Audit firm posture preference: 2-of-3 minimum, hardware wallets, geographically distributed signers. Decision deferred to founder pre-X11.5 kickoff.

**Cross-reference:**

- `skillos-wallet-topology.md` audit packet artifact for current state inventory
- §3.13 X20 AntiCheat scope (X11 contract sprint parallel with X11.5)
- CR1 SYNTHESIS §6 Cluster 3 funding-gated mainnet sprint queue

---

## SECTION TO INSERT — §3.15

Insert this section **after §3.14 (VTP discipline methodology)** and **before §4 (Sprint Sequence)**.

---

### 3.15 X10b end-to-end chain-verify case study — Cluster 1 first sprint canonical

✅ **Phase 1 wrap Cluster 1 first sprint operationally + chain-evidentially complete (May 17-18, 2026).**

This section documents the canonical 5-layer verification chain (per §2.6 expansion) applied to the first Phase 1 wrap Cluster 1 sprint. It is the audit firm packet reference for end-to-end attribution evidence.

**Sprint background:**

X10b closed the human-path dataSuffix attribution gap discovered in CR1 R1 Track C F-3.2. X10 PR#82 (May 14) had closed the agent path; X10b PR #121 (May 17 merged 20:11 UTC) mirrors the pattern for human submissions at `packages/duel-backend/src/api/tournaments/solo.ts:498`.

**Path architecture (canonical vocabulary, locked May 18):**

Two distinct attribution paths operate concurrently for any human player retry fee + score submission cycle:

| Path | Function | Broadcaster | dataSuffix mechanism |
|---|---|---|---|
| **Path A — server-side** | `submitSoloScore(...)` | STUDIO key (`0xA24f9122...`) via `walletClient.writeContract` in `packages/duel-backend/src/api/tournaments/solo.ts:498` | X10b wire: `dataSuffix: dataSuffixForGame(config.game as BuilderCodeGame)` |
| **Path B — client-side** | `chargeRetryFee(...)`, `approve(...)` | User's Base Smart Wallet via bundler → ERC-4337 EntryPoint | wagmi `dataSuffix` capability via Base Account SDK provider (e.g., `apps/2048/src/app/layout.tsx:48 builderCode: "bc_o6szuvg1"`) |

Both paths attribute to the same canonical per-game Builder Code. Path A covers server-broadcast score submission; Path B covers client-broadcast retry fee payments and approvals. Independent broadcasters, same builder code attribution, dual on-chain evidence per gameplay session.

**Chain evidence — May 17 20:37 UTC gameplay session:**

| Path | Tx hash | Block | Function | Broadcaster | dataSuffix tail in calldata |
|---|---|---|---|---|---|
| **B** | `0xb7036e824beeae13a04f0a9d8ce6d7558941e353344554122df13b7bcad960c0` | 41640975 | `chargeRetryFee` (via Coinbase Smart Wallet UserOp) | Bundler `0xA0bb6fD8...` relaying user wallet `0x91298019...` | `0x62635f6f36737a75766731` = `bc_o6szuvg1` ✓ |
| **A** | `0xa454eb5f2428a0a6b0b7ed4a94ac9f1d5060634a4e1f8c16348133373f9f0a20` | 41640980 | `submitSoloScore` (selector `0x84c9111a`) | STUDIO key `0xA24f9122...` | `0x62635f6f36737a75766731` = `bc_o6szuvg1` ✓ |

Block delta: 5 blocks = 10 seconds. Server-side processing latency between user retry fee broadcast and STUDIO submitSoloScore broadcast.

**5-layer verification chain (per §2.6):**

| Layer | Status | Evidence |
|---|---|---|
| (a) Code wire | ✅ | `grep -n "dataSuffix" packages/duel-backend/src/api/tournaments/solo.ts` → line 498 |
| (b) Git remote | ✅ | `git log --oneline origin/main` includes commit `a76c733 feat(x10b): wire human path dataSuffix server-side attribution` |
| (c) Deploy SHA | ✅ | Game Vercel projects auto-deployed within 26 min of PR #121 merge (20:11 UTC merge → 20:37 UTC tx broadcast) |
| (d) Runtime broadcast | ✅ | STUDIO key broadcasted submitSoloScore at block 41640980, 10s after user chargeRetryFee |
| (e) Chain evidence | ✅ | Calldata of tx `0xa454eb5f...0a20` ends with `0x62635f6f36737a75766731` (bc_o6szuvg1 ASCII hex) |

**Full surface attribution status (post-X10b):**

| Surface | Path A (server) | Path B (client) |
|---|---|---|
| 2048 | ✅ X10b wire active | ✅ Base Account SDK provider |
| wordle | ✅ X10b wire active | ✅ |
| sudoku | ✅ X10b wire active | ✅ |
| minesweeper | ✅ X10b wire active | ✅ |
| clicker | ✅ X10b wire active | ✅ |
| match3 | ✅ X10b wire active | ✅ |
| apex (marketing) | N/A | ✅ |
| sponsor (funding dashboard) | N/A | ✅ |

**Operational learnings locked:**

1. **5-layer methodology is the chain-verify canonical** — adopted as default for any on-chain attributable sprint going forward (X14, X20, X11.5, mainnet contracts).
2. **Founder-controlled audit firm packet evidence** — the X10b case can be replicated for audit firm under NDA via the same query pattern (`evm_get_logs` filter at TournamentPool block range + `evm_get_transaction` calldata inspection).
3. **Vercel auto-deploy latency ≤30 min validated for game apps** — game project deploys are git-connected (not prebuilt-only like `apps/api`); auto-deploy completes within the window for production rollout.
4. **Path B coverage predates X10b** — wagmi `dataSuffix` capability via Base Account SDK was always working on client-side; X10b closed the parallel server-side gap. Both paths verified independently.
5. **The 26-minute deploy-to-broadcast window** is the natural pre-rollout settle interval — formalize as observation period before declaring sprint shipped (avoid declaring shipped pre-deploy completion).

**Cross-reference:**

- §2.6 5-layer verification chain canonical
- §3.14 VTP discipline (pre-flight verification before deploy)
- CR1 R1 Track C F-3.2 (origin gap discovery)
- X10 PR#82 (May 14 agent path equivalent)

---

## SECTION TO INSERT — §3.16

Insert this section **after §3.15 (X10b chain-verify case study)** and **before §4**.

---

### 3.16 X14 architectural posture — off-chain enforcement preserves class-agnostic substrate

✅ **X14 scoping pass complete (PR #123, May 17). Architectural lock: off-chain enforcement.**

This section documents the architectural decision surfaced by the X14 scoping agent (PR #123) and approved as the binding posture for class-aware fairness implementation. The architectural insight is significant enough to lock into the architectural invariants set.

**Architectural lock (binding):**

X14 (class-aware fairness X8) implementation **adds no class-aware logic to smart contracts**. TournamentPool v2.1, ChallengeEscrow, SponsorshipModule, and all derivative contracts remain class-agnostic at the storage and execution layer. Class declaration, enforcement, and audit trail live entirely in off-chain surfaces (API + DB + dishonor SBT).

**What this means concretely:**

| Layer | Class-aware? | Mechanism |
|---|---|---|
| TournamentPool v2.1 storage | NO | Tournament struct does not differentiate human-only / agent-only / mixed-declared |
| TournamentPool v2.1 execution | NO | `submitSoloScore` accepts any signed score, regardless of declared class |
| Tournament metadata (off-chain DB) | YES | `class_declaration` field on tournaments table: `human-only` / `agent-only` / `mixed-declared` |
| API auth + submit | YES | SIWB (human) / SIWA (agent) check at submit time; mismatch → reject with dishonor flag |
| Extension whitelist (client-side) | YES | Wallet extension allowlist for human-only tournaments |
| AI browser detection (client-side) | YES | Comet / Atlas / Antigravity / Claude-in-Chrome detection for human-only |
| Behavioral biometrics (opt-in) | YES | Mouse + keyboard signal capture, opt-in tournament-scoped |
| Dishonor SBT (ERC-5192) | YES | Separate contract; minted on class violation; soulbound, irreversible |

**Rationale:**

CLAUDE.md invariant #3 states: *"Class-agnostic substrate: Human and agent players run same infra. Storage layer doesn't differentiate. Cross-class matches generate most valuable data."*

X14 preserves this invariant. The substrate stays class-agnostic; tournaments declare their class commitment honestly (or default to mixed-declared) and enforcement runs at the API + client + audit layer. Violations produce immutable on-chain evidence (dishonor SBT) without polluting the core contract surface with class-aware logic.

**Audit firm narrative:**

> *"SkillOS's class-aware fairness layer is entirely off-chain. Contracts know nothing about player class. Tournaments declare their class commitment via off-chain metadata; the API enforces declarations at submit time; violations mint an on-chain dishonor SBT (ERC-5192 soulbound). This separation preserves a class-agnostic substrate while enabling honest tournament class declaration as a transparency feature."*

Strong audit posture: contracts are minimal + class-agnostic, enforcement is auditable + class-aware, separation is architectural rather than policy.

**X14 sub-sprint breakdown (per PR #123):**

| Sub-sprint | Scope | Effort (parallel-calibrated) |
|---|---|---|
| X14.0 | Tournament-level class declaration (DB schema + API surface) | 1-2 days |
| X14.1 | Extension whitelist (client-side wallet allowlist) | 1 day |
| X14.2 | AI browser detection (Comet / Atlas / Antigravity / Claude-in-Chrome fingerprints) | 1-2 days |
| X14.3 | Behavioral biometrics (opt-in mouse + keyboard signal capture) | 2-3 days |
| X14.4 | Dishonor SBT (ERC-5192 contract + mint flow on violation) | 2-3 days |
| X14.5 | Integration test + class boundary regression suite (un-skip `settle-guard.integration.test.ts`) | 1-2 days |

Total: ~7-14 days, parallel-able with X20 (no shared surface).

**12 founder strategic questions queued (per PR #123 SCOPING.md §5):** highest-impact items are Q-1 (mixed-declared opt-in vs opt-out — per CLAUDE.md invariant #3 the recommended default is opt-out so untagged tournaments are mixed-declared by default, preserving transparency-first ethos), Q-8 (biometric retention 90-day vs forever — GDPR + audit firm reception), Q-12 (parallelism strategy — sequential 14d vs parallel 7d).

**Cross-reference:**

- v1.4 §3.13 X20 AntiCheat rebuild (parallel sprint, also off-chain primary)
- v1.4 §2.4 Domain neutrality invariant (preserved)
- CLAUDE.md invariant #3 (class-agnostic substrate)
- PR #123 SCOPING.md for full sub-sprint breakdown

---

## SECTION TO INSERT — §3.17

Insert this section **after §3.16 (X14 architectural posture)** and **before §4**.

---

### 3.17 X20 moves instrumentation discovery — pre-formula plumbing prerequisite

✅ **X20 scoping pass complete (PR #122, May 17). Moves instrumentation gap surfaced as canonical memory-as-spec drift case (§2.6 layer (a) example).**

This section documents the pre-implementation discovery that reshaped X20.0 (F0 formula implementation) from "1 week pure-function work" into a multi-component plumbing prerequisite. The discovery is itself a canonical instance of §2.6 memory-as-spec drift detection methodology.

**The discovery:**

X20.0 was scoped in v1.4 §3.13 as F0 Formula implementation — "duration × moves × score plausibility, both solo + duel paths, 1 week effort." The X20 scoping agent (PR #122) verified this assumption via pre-flight grep:

```bash
grep -rn "moves" packages/duel-backend/src/ apps/ \
  --include="*.ts" | grep -i "submit\|settle\|anticheat"
```

Result: **zero hits in submit / settle / anticheat code paths.** Moves data was never captured, never stored, never transmitted to the AntiCheat surface.

**Implication:**

F0 formula needs `moves` as input. If moves isn't captured in the existing data flow, formula implementation is blocked on upstream plumbing:

- 6 game frontend changes (capture moves count, transmit in submit payload)
- Backend payload schema migration (add moves field, version bump)
- DB schema migration (add `moves` column on `solo_runs` or equivalent)
- API endpoint update (validate moves, persist)
- Cron settle update (read moves for AntiCheat formula evaluation)

This is multi-component plumbing, not a pure function. The agent split X20.0 into two sub-sprints:

| Sub-sprint | Scope | Effort (parallel-calibrated) |
|---|---|---|
| **X20.0a** | Moves instrumentation plumbing (frontend + payload + DB + API + cron read path) | 3-5 days |
| **X20.0b** | F0 formula function implementation (pure function consuming captured moves) | 1-2 days |

**X20 sub-sprint sequence (post-discovery, per PR #122):**

| Sub-sprint | Scope | Effort |
|---|---|---|
| X20.0a | Moves instrumentation plumbing | 3-5 days |
| X20.0b | F0 formula pure function | 1-2 days |
| X20.1 | Solo path AntiCheat enforcement (formula gate at submit; no on-chain flag) | 3-5 days |
| X20.2 | F1 confidence gate (Haiku verdict threshold) — *conditional on Q §5.1* | 1-2 days |
| X20.3 | F2 per-tournament circuit-breaker | 2-3 days |
| X20.4 | F4 Haiku → off-chain advisory queue (Option F target architecture) | 3-5 days |

Total: ~10-14 days, parallel-able with X14.

**5 architectural questions surfaced for founder (per PR #122 SCOPING.md §5):**

1. F1 (X20.2) vs F4 (X20.4) sequence — does F4-first obsolete F1?
2. Per-game formula coefficient source — founder-spec vs data calibration sub-step vs hybrid
3. F1 confidence threshold granularity — global 0.7 vs per-game
4. ~~Moves instrumentation as bundled X20.0 step or split X20.0a sub-sprint~~ **(RESOLVED — split per agent finding; X20.0a / X20.0b structure adopted)**
5. Solo path formula scope — minimum cap-only vs full formula

**Pattern lock — pre-implementation grep methodology:**

The agent's discovery exemplifies §2.6 layer (a) drift detection: **memory-as-spec said "F0 formula 1 week"; reality (grep) revealed plumbing prerequisite.** Without pre-flight grep, X20.0 would have been dispatched as pure-function sprint and hit the moves-data-missing block mid-implementation.

**Generalized pattern (audit-prep wisdom):**

For any sprint whose scope claims "pure function" or "isolated change," pre-flight grep the assumed input/output surface. If the grep returns fewer hits than expected, the sprint likely has plumbing prerequisites. Surface the gap as a sub-sprint split BEFORE implementation kickoff.

**Cross-reference:**

- §2.6 3-layer drift framework (this is layer (a) — agent claim drift / memory-as-spec drift)
- v1.4 §3.13 X20 AntiCheat F0-F4 scope
- v1.4 §3.11 UR Pass 1 retrospective (4-track parallel pattern application)
- PR #122 SCOPING.md for full sub-sprint breakdown

---

## SECTION TO UPDATE — §3.13 F-letter ambiguity cleanup

Replace the X20 sub-sprint table in §3.13 with the canonical structure below. The original v1.4 §3.13 conflated F-letters as both **scope kinds** (F0 = formula, F1 = confidence gate, F2 = circuit-breaker, F3 = forensic columns, F4 = off-chain advisory, F5 = anomaly alerting) and **sequence numbers** (X20.0 = F0 implementation, X20.1 = solo enforcement, X20.2 = F1, X20.3 = F2, X20.4 = F4, X20.5 = F3 post-mainnet, X20.6 = F5 post-mainnet).

The dual use was caught by the X20 scoping agent (PR #122). Below is the canonical mapping that disambiguates the two.

---

#### Canonical X20 sub-sprint ↔ F-letter mapping (post-cleanup)

| Sub-sprint | F-letter scope | Description | Effort | Phase |
|---|---|---|---|---|
| X20.0a | (plumbing, no F-letter) | Moves instrumentation prerequisite | 3-5 days | Pre-mainnet |
| X20.0b | F0 | Formula implementation (pure function) | 1-2 days | Pre-mainnet |
| X20.1 | (enforcement, no new F-letter) | Solo path formula gate at submit | 3-5 days | Pre-mainnet |
| X20.2 | F1 | Confidence gate (Haiku verdict threshold) | 1-2 days | Pre-mainnet (conditional) |
| X20.3 | F2 | Per-tournament circuit-breaker | 2-3 days | Pre-mainnet |
| X20.4 | F4 | Haiku → off-chain advisory queue | 3-5 days | Pre-mainnet |
| X20.5 | F3 | Forensic columns (audit trail) | TBD | Post-mainnet |
| X20.6 | F5 | Anomaly alerting (op-level monitoring) | TBD | Post-mainnet |

**Reading rule:** the F-letter is the scope kind (architectural milestone); the X20.N number is the sequence/sub-sprint identifier. **F-letters are NOT sequence indices.** Some sub-sprints have no F-letter (X20.0a plumbing, X20.1 enforcement) because they are not architectural milestones themselves but operational prerequisites or applications of an existing milestone.

---

## SECTION TO UPDATE — §4 Sprint Sequence

Update §4 Sprint Sequence current state (post-May 17-18 Cluster 1 first sprint chain-verify):

---

**Sprint Sequence — current state (May 18, 2026, post-X10b chain-verify):**

| Sprint | Status | Notes |
|---|---|---|
| X1-X7 — Layer 1A through Layer 3 reference apps | ✅ COMPLETE | Phase 1 dev surface foundation |
| X3.5 — SkillOS Skill Pack | ✅ COMPLETE | npm, mdskills.ai listing |
| Skill Pack v0.2 | ✅ COMPLETE | Capabilities + Quality + Security improved |
| X9 + X9.1 + X9.2 | ✅ COMPLETE | Tournament data layer, wallet preflight, burn rate |
| X10 — Server-side dataSuffix attribution (agent path) | ✅ COMPLETE + chain-verified | PR #82 May 14, clicker tx `0xd371ba4c` |
| **UR Pass 1 (Tracks A/B/C/D + T5-3 verification + X19 schema drift scope)** | ✅ COMPLETE | PRs #104-#112 May 17 |
| **Tier 0 hotfixes** (C1 SIWA gate, D top-3a RLS, Y1 env rename) | ✅ COMPLETE + verified prod | PRs #107, #108, #109 |
| **Quick-win PRs (architecture supplements + Q-W1 manifest fix + agent-runner cron)** | ✅ COMPLETE | PRs #118, #119, #120 May 17 |
| **CR1 Codebase Reality Pass 1 (R1/R2/R3/R4 + SYNTHESIS)** | ✅ COMPLETE | PRs #113-#117 May 17 |
| **X10b — Server-side dataSuffix attribution (human path)** | ✅ **COMPLETE + chain-verified** | **PR #121 May 17, submitSoloScore tx `0xa454eb5f...0a20` block 41640980, bc_o6szuvg1 attribution evidenced on-chain** |
| **X20 scoping — AntiCheat rebuild F0-F4** | ✅ COMPLETE | PR #122 May 17, sub-sprint breakdown + 5 founder questions |
| **X14 scoping — Class-aware fairness X8** | ✅ COMPLETE | PR #123 May 17, sub-sprint breakdown + 12 founder questions |

**Phase 1 wrap Cluster 1 — remaining sprints (parallel-able, funding-independent):**

| Sprint | Effort | Status |
|---|---|---|
| X14.0-X14.5 — Class-aware fairness sub-sprints | ~7-14 days | Queued post strategic Q resolve |
| X20.0a-X20.4 — AntiCheat sub-sprints | ~10-14 days | Queued post strategic Q resolve |
| Duel reactivation | 2-4 days | Post-X14 (depends on class declaration) |

**Phase 2 mainnet pre-req queue (funding-independent unless flagged):**

| Sprint | Effort | Status |
|---|---|---|
| **X11.5 — Multi-sig deployment (Safe Wallet on Base mainnet)** | ~1 week | NEW v1.5 — funding-independent, threshold decision pending founder |
| X11 — v2.2 developer fee splitter contract | 1-2 weeks | Queued |
| X14 + X20 implementation (per above) | Parallel | Queued |
| X15 — Agent retry payments | 1 week | Queued |
| X15.5 — Rate limit infra (Upstash KV) | 1 week | Queued (mainnet blocker) |
| X16 — Vercel path-filter migration | 3-5 days | Queued |
| X19 — Schema reconciliation (9-item) | 3-5 days | In progress |

**Phase 2 funding-gated (Cluster 3 per CR1 SYNTHESIS):**

| Sprint | Effort | Cost | Status |
|---|---|---|---|
| X12 — External audit (Trail of Bits / OpenZeppelin / Spearbit / Cyfrin) | 4-8 weeks | $50-150K | Pending fundraise (templates in `skillos-audit-firm-outreach-templates.md`) |
| X13 — Cayman Foundation structuring | 4-8 weeks | $30-80K | Pending fundraise |

---

## CHANGELOG TO APPEND — §9

After all existing changelog entries (v1.4, v1.3, v1.2, v1.1, v1) at the end of the doc, prepend the v1.5 entry:

```
### v1.5 — 2026-05-18
- Updated §2.6 Memory-as-spec drift to 3-layer framework: agent claim 
  drift, git state drift, deploy runtime drift. Added 5-layer post-merge 
  verification chain (code wire + git remote + deploy SHA + runtime 
  broadcast + chain evidence). Cumulative cost 5-15 min, recovery cost 
  per layer drift 30-120 min. Living example: X10b end-to-end (May 17-18).
- Added §2.7 Mainnet wallet rotation + multi-sig discipline — codifies 
  zero EOA overlap, fresh fiat-onramp origin, testnet non-portability,
  legacy authorization revocation, pre-deploy assertion. Introduces 
  X11.5 Multi-sig deployment sprint as Phase 2 mainnet pre-req 
  (funding-independent, ~1 week). Threshold open question deferred to 
  founder strategic decision.
- Added §3.15 X10b end-to-end chain-verify case study — canonical 
  reference for on-chain attributable sprint verification. Path A 
  (server-side via STUDIO key + X10b wire) and Path B (client-side 
  via wagmi dataSuffix capability + Base Account SDK) both 
  chain-evidenced on May 17 20:37 UTC gameplay session. 5-layer 
  verification chain closed within ~3.5 hours of merge.
- Added §3.16 X14 architectural posture — off-chain enforcement lock. 
  Contracts stay class-agnostic per CLAUDE.md invariant #3. Class 
  declaration + audit trail + dishonor SBT (ERC-5192) live in API + DB 
  layer. Strong audit firm narrative: substrate class-agnostic, 
  enforcement class-aware, separation architectural.
- Added §3.17 X20 moves instrumentation discovery — pre-formula 
  plumbing prerequisite. F0 formula sprint reshaped from "1 week pure 
  function" to X20.0a (plumbing ~3-5d) + X20.0b (formula ~1-2d) per 
  X20 scoping agent's grep methodology. Canonical §2.6 layer (a) drift 
  detection example.
- Updated §3.13 — X20 F-letter ambiguity cleanup. F-letters are scope 
  kinds (architectural milestones), X20.N numbers are sub-sprint 
  sequence identifiers. F-letters NOT sequence indices. Canonical 
  mapping table replaces dual-use ambiguity.
- Updated §4 Sprint Sequence — Cluster 1 first sprint (X10b) COMPLETE + 
  chain-verified. X14 + X20 scoping PRs merged. X11.5 Multi-sig 
  deployment added to Phase 2 mainnet pre-req queue.
```

---

## END OF SUPPLEMENT
