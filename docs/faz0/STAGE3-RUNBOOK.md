# Faz 0 Pitch-MVP — Stage 3 Runbook (testnet deploy + live-loop evidence)

> **Standalone challenge-loop demo, B-minimal, Base Sepolia.**
> The **founder broadcasts every keyed transaction.** The private key lives only
> in the founder's local environment and never reaches the agent. The agent's
> role here is prep + key-free (`cast`) verification only.
>
> **Honest label this demo earns:** *"economically-secured optimistic,
> deterministic-auditable."* NOT "cryptographically trustless."

---

## 0. What this proves

Two on-chain loops on the deployed `SettlementDemo`:

1. **Honest:** claim → (unchallenged) → finalize → score credited, bond returned.
2. **Fraud:** claim with `score ≠ replay(inputLog)` → challenge → resolver re-runs
   the public Δ6 2048 engine → `resolve` → **wrong side slashed**.

The two transaction hashes (honest-finalize + fraud-slash) are the pitch evidence.

---

## 1. Prerequisites

- **Foundry** installed (`forge`, `cast`).
- **Two Base Sepolia EOAs**, both funded with a little test ETH (faucet):
  - **A — DEPLOYER / OWNER / CLAIMER / CHALLENGER**
  - **B — RESOLVER** (MUST differ from A — the deploy script enforces it)
  - *(Optional, for a more vivid slash: a third EOA **C** as the challenger, so
    the fraud loop's bond visibly moves from the claimer (A) to a distinct
    challenger (C). With only A+B, the slash still emits + transfers, but A is
    both claimer and challenger so the bond nets out.)*
- Recommended: import both keys as cast keystores so keys never hit your shell
  history:
  ```bash
  cast wallet import deployer --interactive   # paste A's key when prompted
  cast wallet import resolver --interactive   # paste B's key when prompted
  ```

### Constants (precomputed — copy verbatim)

```bash
export RPC=https://sepolia.base.org

# seed commitment: keccak256(bytes("replay-determinism"))  ← 2048 golden vector
export SEED="replay-determinism"
export SEED_COMMIT=0x3d73a8824f5363670690e631fd24e631cf7bca266a6eb0871afc58b7ed16420d

export ARENA_H=0x6c2f124c131d1579ef93323facb395b286e5a62f3273bf0d51a3e9451becd75d  # honest arena
export CLAIM_H=0x52054c761ca2750eaf8204d830c4eb5d1848a83ff634b5f1c833ee7352ca7a14  # honest claim
export ARENA_F=0xf29c596bf664b2649bc001b7ffccc0d15f70696958ee63fa6b936d5f055195bc  # fraud arena
export CLAIM_F=0xc33692cc5c01a5a81c829bb0e3325a8ea0b1c180435da0ab35e9550a9a2dca10  # fraud claim
export INPUT_LOG_HASH=0x9b827b5350e0527473b00a057a279ba364aaa94c3e9116844aa3d243aac02e44

export WINDOW=120                 # challenge window, seconds
export BOND=100000000000000       # 0.0001 ETH (claim + challenger bond)

# honest score = 20 (the golden replay); fraud score = 9999 (a lie)
```

> The `INPUT_LOG_HASH` anchors the off-chain inputLog `left,down,right,up,left,left,down`
> (the 7-move golden sequence on seed `replay-determinism`, which the engine
> scores 20). `resolve` does not read the hash; the resolver replays the moves
> off-chain. Anyone can reproduce: `MOVES="left,down,right,up,left,left,down"
> npx tsx scripts/faz0/run-resolver.ts`.

---

## 2. Deploy (founder broadcasts)

Run from `contracts/`. **Set `RESOLVER_ADDRESS` to B's address.**

```bash
cd contracts

# Optional dry-run first (no broadcast):
DEPLOYER_PRIVATE_KEY=0x<A_KEY> RESOLVER_ADDRESS=0x<B_ADDR> \
  forge script script/DeploySettlementDemo.s.sol:DeploySettlementDemo \
  --rpc-url "$RPC" -vvvv

# Broadcast:
DEPLOYER_PRIVATE_KEY=0x<A_KEY> RESOLVER_ADDRESS=0x<B_ADDR> \
  forge script script/DeploySettlementDemo.s.sol:DeploySettlementDemo \
  --rpc-url "$RPC" --broadcast -vvvv
# (optional source verification: append --verify --etherscan-api-key $BASESCAN_API_KEY)
```

Copy the printed `SettlementDemo:` address, then (from repo root or anywhere):

```bash
export DEMO=0x<deployed-address>
```

**Sanity (key-free):**
```bash
cast call "$DEMO" "owner()(address)"    --rpc-url "$RPC"   # = A
cast call "$DEMO" "resolver()(address)" --rpc-url "$RPC"   # = B (≠ A)
```

---

## 3. Loop (i) — HONEST → finalize → credited

```bash
# owner (A) sets up the arena with the seed COMMITMENT, then reveals the seed
cast send "$DEMO" "createArena(bytes32,bytes32,uint64,uint256,uint256)" \
  "$ARENA_H" "$SEED_COMMIT" "$WINDOW" "$BOND" "$BOND" \
  --rpc-url "$RPC" --account deployer

cast send "$DEMO" "revealSeed(bytes32,string)" \
  "$ARENA_H" "$SEED" \
  --rpc-url "$RPC" --account deployer

# claimer (A) submits the HONEST score (20) + claim bond → opens the window
cast send "$DEMO" "submitClaim(bytes32,bytes32,uint256,bytes32,bytes32)" \
  "$CLAIM_H" "$ARENA_H" 20 "$SEED_COMMIT" "$INPUT_LOG_HASH" \
  --value "$BOND" --rpc-url "$RPC" --account deployer

# wait out the challenge window (no challenge comes)
sleep "$WINDOW"; sleep 5

# anyone finalizes → score credited, bond returned   ← capture this tx hash
cast send "$DEMO" "finalize(bytes32)" "$CLAIM_H" \
  --rpc-url "$RPC" --account deployer
```

**Verify (key-free):**
```bash
# claim state should be 3 (Finalized); creditedScore should be 20
cast call "$DEMO" \
  "claims(bytes32)(bytes32,address,uint256,bytes32,bytes32,uint256,uint256,address,uint64,uint8,uint256)" \
  "$CLAIM_H" --rpc-url "$RPC"
# → ...,state=3,creditedScore=20
```

---

## 4. Loop (ii) — FRAUD → challenge → resolver re-run → slash

```bash
# owner (A) sets up + reveals a second arena
cast send "$DEMO" "createArena(bytes32,bytes32,uint64,uint256,uint256)" \
  "$ARENA_F" "$SEED_COMMIT" "$WINDOW" "$BOND" "$BOND" \
  --rpc-url "$RPC" --account deployer
cast send "$DEMO" "revealSeed(bytes32,string)" \
  "$ARENA_F" "$SEED" \
  --rpc-url "$RPC" --account deployer

# claimer (A) submits a FRAUDULENT score (9999, ≠ the real replay of 20)
cast send "$DEMO" "submitClaim(bytes32,bytes32,uint256,bytes32,bytes32)" \
  "$CLAIM_F" "$ARENA_F" 9999 "$SEED_COMMIT" "$INPUT_LOG_HASH" \
  --value "$BOND" --rpc-url "$RPC" --account deployer

# challenger (A, or C) disputes within the window + posts challenger bond
cast send "$DEMO" "challenge(bytes32)" "$CLAIM_F" \
  --value "$BOND" --rpc-url "$RPC" --account deployer

# resolver re-runs the PUBLIC engine off-chain to get the true score (20):
CLAIM_ID="$CLAIM_F" CLAIMED_SCORE=9999 npx tsx scripts/faz0/run-resolver.ts
#   → verdict: { replayedScore: 20, engineValid: true, fraud: true }

# RESOLVER (B) posts the replayed score → contract slashes the claimer  ← capture this tx hash
cast send "$DEMO" "resolve(bytes32,string,uint256)" \
  "$CLAIM_F" "$SEED" 20 \
  --rpc-url "$RPC" --account resolver
```

**Verify (key-free):**
```bash
# claim state should be 5 (ResolvedFraud); creditedScore 0
cast call "$DEMO" \
  "claims(bytes32)(bytes32,address,uint256,bytes32,bytes32,uint256,uint256,address,uint64,uint8,uint256)" \
  "$CLAIM_F" --rpc-url "$RPC"
# → ...,state=5,creditedScore=0

# inspect the ClaimResolved(fraud=true,...) event on the resolve tx
cast receipt 0x<resolve-tx-hash> --rpc-url "$RPC"
```

---

## 5. Evidence (the pitch artifact)

Capture both transaction hashes:

| Path | Tx | Expected end state |
|---|---|---|
| **(i) honest** | `finalize(CLAIM_H)` | claim state `3` (Finalized), creditedScore `20`, bond returned |
| **(ii) fraud** | `resolve(CLAIM_F, …)` | claim state `5` (ResolvedFraud), creditedScore `0`, `ClaimResolved(fraud=true)`, claimer bond → challenger |

```bash
cast receipt 0x<finalize-tx> --rpc-url "$RPC" | grep -E "transactionHash|status|blockNumber"
cast receipt 0x<resolve-tx>  --rpc-url "$RPC" | grep -E "transactionHash|status|blockNumber"
```

---

## 6. Deterministic-auditability note (one line — this is what makes B-minimal honest)

> Anyone can re-run the public, deterministic 2048 engine
> (`MOVES="left,down,right,up,left,left,down" npx tsx scripts/faz0/run-resolver.ts`)
> on the on-chain-revealed seed (`replay-determinism`, committed as
> `SEED_COMMIT` and re-checked by `resolve`) plus the anchored inputLog, and
> independently confirm the resolver's report — the result is verifiable by
> challenge + replay, not by trust in the operator.
