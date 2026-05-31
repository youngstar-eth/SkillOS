# Faz 0 Pitch-MVP — Stage 3 Evidence (executed on Base Sepolia)

> **Standalone challenge-loop demo, B-minimal, Base Sepolia (chain `84532`).**
> Honest label this demo earns: **"economically-secured optimistic,
> deterministic-auditable."** — NOT "cryptographically trustless." A score is
> *claimed* (not re-executed on-chain); anyone may challenge within a window,
> and a resolver re-runs the **public, deterministic Δ6 2048 engine** on the
> on-chain-revealed seed to adjudicate. The lever is auditability: anyone can
> independently re-run the same engine and reproduce the verdict.

All keyed transactions were **keystore-signed** (`cast`/`forge --account … --password-file`).
The raw private keys stayed encrypted at rest in `~/.foundry/keystores` and never
entered the agent context or the shell — only the keystore name + a password-file
path were passed. (This supersedes the runbook's original "founder broadcasts
manually" wording; the trust property is unchanged — the key is never exposed.)

## Deployment

| Field | Value |
|---|---|
| Contract | `SettlementDemo` |
| Address (`DEMO`) | **`0xD7323fCCa888793D5c92F006911DB06Af3CF8B1E`** |
| Deploy tx | `0xbd0cc98e8976bf79c0a5a321aea62708336732092a243fbf40fd69d943f4f522` |
| Chain | Base Sepolia (`84532`) |
| `owner()` | `0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe` (A) |
| `resolver()` | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` (B) — distinct from owner |

### Roles (distinct EOAs)

| Role | Address |
|---|---|
| **A** — deployer / owner / claimer | `0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe` |
| **B** — resolver | `0xA24f9122568e98b72f4dDD61119C7D92D0975692` |
| **C** — challenger | `0x724fCfeE408e0f05068feD0Bb5d1245EDd3a16F5` |

Seed `"replay-determinism"`, committed as
`SEED_COMMIT = 0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d`
(= `keccak256(bytes(seed))`, verified). Golden 7-move vector
`left,down,right,up,left,left,down` replays to score **20**.

## Loop (i) — HONEST → finalize → credited  ★

| Field | Value |
|---|---|
| Arena | `0x6c2f124c131d1579ef93323facb395b286e5a62f3273bf0d51a3e9451becd75d` |
| Claim | `0x52054c761ca2750eaf8204d830c4eb5d1848a83ff634b5f1c833ee7352ca7a14` |
| Claimed score | 20 (truthful) |
| **finalize tx** | **`0xc3653355d35d90b1912b77ae984cafa4d07d436b63562a25c12cdd91de1dfc39`** (block 42230908, status 1) |
| Final state | **`3` (Finalized)** |
| `creditedScore` | **20** |
| Bond | returned to claimer (unchallenged) |

## Loop (ii) — FRAUD → challenge → resolver re-run → slash  ★

| Field | Value |
|---|---|
| Arena | `0xf29c596bf664b2649bc001b7ffccc0d15f70696958ee63fa6b936d5f055195bc` |
| Claim | `0xc33692cc5c01a5a81c829bb0e3325a8ea0b1c180435da0ab35e9550a9a2dca10` |
| Claimed score | 9999 (a lie) |
| challenge tx (C) | `0x7ab769d66c37369494b25016d6bb9f733f3300c41a910f3ca5eeab3110377f8c` (block 42230880) |
| Off-chain resolver verdict | `{ replayedScore: 20, engineValid: true, fraud: true }` |
| **resolve tx (B)** | **`0xc40372614aa656f5d2407464fc91f54daa2e3cf98508787197992538b20ae2fb`** (block 42230897, status 1) |
| Final state | **`5` (ResolvedFraud)** |
| `creditedScore` | **0** |

`ClaimResolved` event (decoded from the resolve tx):

```
fraud         = true
replayedScore = 20
claimedScore  = 9999
slashed (A)   = 0x3a4F9eB7fBa1A0015a6F070259F3B9E883d95EEe
rewarded (C)  = 0x724fCfeE408e0f05068feD0Bb5d1245EDd3a16F5
pot           = 200000000000000   (2 × 0.0001 ETH bond)
```

Bond movement confirmed: challenger **C** balance rose `1000000000000000` →
`1099578411271252` wei (+pot − own bond − gas); the fraudulent claimer **A**
forfeited its claim bond. The wrong side was slashed.

## All transactions (in order)

| # | Step | Signer | Tx hash | Block |
|---|---|---|---|---|
| 1 | deploy SettlementDemo | A | `0xbd0cc98e8976bf79c0a5a321aea62708336732092a243fbf40fd69d943f4f522` | — |
| 2 | createArena (honest) | A | `0x6193a2a98e747003c14d8bc3b9a3b5b7d776d6d2b99430127317b3a256dcb61c` | 42230756 |
| 3 | revealSeed (honest) | A | `0xe64604cdb3bf58fe351ed39f6dda61506f9bd1d45f0ef5320f893a4454097583` | 42230803 |
| 4 | submitClaim 20 (honest) | A | `0xde2984f1ca924c2bea449d9a7263ee24e0d26bcbf7d1f78208f300d5be03c714` | 42230814 |
| 5 | createArena (fraud) | A | `0xeb1231c9522e891040b46cbd8024bc989ef80393bb67782e01b50e779c8ad18b` | 42230851 |
| 6 | revealSeed (fraud) | A | `0xe2d6e47d1ad5fb6df89c1af014a0853cf6114c1b09ef90046700679a3216019c` | 42230859 |
| 7 | submitClaim 9999 (fraud) | A | `0x40e8b7e2e337d3a0880080466b9a7db38f735316b196992c85e10c3efa47bd2f` | 42230871 |
| 8 | challenge (fraud) | C | `0x7ab769d66c37369494b25016d6bb9f733f3300c41a910f3ca5eeab3110377f8c` | 42230880 |
| 9 | **resolve → slash (fraud)** ★ | B | `0xc40372614aa656f5d2407464fc91f54daa2e3cf98508787197992538b20ae2fb` | 42230897 |
| 10 | **finalize → credit (honest)** ★ | A | `0xc3653355d35d90b1912b77ae984cafa4d07d436b63562a25c12cdd91de1dfc39` | 42230908 |

## Deterministic-auditability note

Anyone can re-run the public, deterministic 2048 engine on the on-chain-revealed
seed plus the anchored inputLog and independently confirm both verdicts — the
result is verifiable by **challenge + replay**, not by trust in the operator:

```bash
# honest claim → score 20, fraud:false
npx tsx scripts/faz0/run-resolver.ts
# fraud claim → replayedScore 20 ≠ claimed 9999 ⇒ fraud:true
CLAIMED_SCORE=9999 npx tsx scripts/faz0/run-resolver.ts
```
