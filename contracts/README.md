# ArcadePool — contracts

Tournament escrow + EIP-712 score attestation for the 2048 Base Mini App.

## Build & test

```bash
forge build
forge test -vvv
forge test --gas-report
```

## Deploy (Base Sepolia)

Fill `.env` from `.env.example`, then:

```bash
export $(grep -v '^#' .env | xargs)

forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --broadcast \
  --verify \
  --etherscan-api-key "$BASESCAN_API_KEY"
```

The script prints the deployed address on stdout. Copy that into
`apps/2048/.env.local` as `NEXT_PUBLIC_ARCADE_POOL_ADDRESS`.

## Env

| Var | Use |
|-----|-----|
| `DEPLOYER_PRIVATE_KEY` | EOA that pays gas + becomes `Ownable.owner()` |
| `USDC_ADDRESS` | `0x036CbD…dCF7e` on Base Sepolia |
| `SCORE_SIGNER_ADDRESS` | Address derived from `SCORE_SIGNER_PRIVATE_KEY` in the Next.js app — MUST match or `submitScore` always reverts |
| `FEE_RECIPIENT` | Receives `protocolFeeBps` (10% default) on settlement |
| `BASESCAN_API_KEY` | For automatic source verification |

## EIP-712 domain (authoritative)

Deployed contract exposes (via `_hashTypedDataV4`):

```
EIP712Domain {
  name:             "ArcadePool"
  version:          "1"
  chainId:          84532
  verifyingContract: <this contract>
}

Score {
  uint256 tournamentId
  address player
  uint256 score
  uint256 nonce
}
```

`apps/2048/lib/signing/score-signer.ts` must match bit-for-bit — any divergence breaks `ecrecover`.
