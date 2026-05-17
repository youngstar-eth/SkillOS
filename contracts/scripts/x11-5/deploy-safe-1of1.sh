#!/bin/bash
# X11.5 — Safe Wallet 1-of-1 deployment script
# Deploys Safe Wallet on Base Sepolia (testnet) for rehearsal
# Mainnet usage: change RPC + network env

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <single-signer-address>"
  exit 1
fi

SIGNER_ADDR=$1
NETWORK=${NETWORK:-base-sepolia}
RPC_URL=${RPC_URL:-https://sepolia.base.org}

echo "Deploying Safe Wallet 1-of-1 on $NETWORK"
echo "Single signer: $SIGNER_ADDR"
echo "Threshold: 1"
echo ""

# Safe SDK deployment via TypeScript helper
# (full implementation deferred to post-PR sprint cutover; this is the script stub)
echo "TODO: implement Safe SDK call via npx @safe-global/protocol-kit"
echo "Reference: https://docs.safe.global/sdk/protocol-kit"
echo ""
echo "For now: deploy manually via https://app.safe.global on $NETWORK"
echo "  1. Connect signer wallet"
echo "  2. Create new Safe"
echo "  3. Single signer: $SIGNER_ADDR"
echo "  4. Threshold: 1"
echo "  5. Pay deployment gas"
echo "  6. Record Safe address for downstream ownership transfer"
