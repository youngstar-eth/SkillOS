#!/usr/bin/env bash
# Print a per-game walkthrough for Farcaster account association.
#
# Output is a plain-text guide that tells the user, for each of the 20 games:
#   1. Where to paste the domain
#   2. How to sign with Warpcast custody wallet
#   3. Which 3 env vars to set and the commands to set them
#
# Usage:
#   scripts/vercel/generate-association-guide.sh > account-association-guide.txt

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$HERE/lib.sh"

cat <<'INTRO'
═══════════════════════════════════════════════════════════════
  MAS — Farcaster Account Association Walkthrough (20 games)
═══════════════════════════════════════════════════════════════

You need to sign a proof-of-domain ownership for each game's Vercel
subdomain. Your Farcaster custody wallet is the signer. Once signed,
the 3 returned fields (header/payload/signature) go into Vercel env.

The deploy step already set everything else — only account
association is left.

General steps for each domain:
  1. Open https://farcaster.xyz/~/developers/mini-apps/manifest
  2. Paste the domain shown below (WITHOUT https://)
  3. Click "Submit" → "Verify"
  4. Approve the signature request in Warpcast
  5. Copy the three values shown (header / payload / signature)
  6. Run the three `vercel env add` commands
  7. Trigger a redeploy so the manifest picks up the new env vars

Per-game instructions below. Estimated: ~1 min signing + ~30s env ops
per game × 20 games = ~30 min total.

───────────────────────────────────────────────────────────────
INTRO

for game in "${GAMES[@]}"; do
  domain="mas-$game.vercel.app"
  cat <<EOF

[$game]
  Domain:       $domain
  Manifest URL: https://$domain/.well-known/farcaster.json

  1. Paste into https://farcaster.xyz/~/developers/mini-apps/manifest:
       $domain
  2. Sign with your Warpcast custody wallet.
  3. Copy the 3 returned values and run:

       cd apps/$game
       printf '%s\n' '<HEADER_VALUE>'    | npx vercel@latest env add FARCASTER_HEADER    production
       printf '%s\n' '<PAYLOAD_VALUE>'   | npx vercel@latest env add FARCASTER_PAYLOAD   production
       printf '%s\n' '<SIGNATURE_VALUE>' | npx vercel@latest env add FARCASTER_SIGNATURE production
       npx vercel@latest --prod --yes

───────────────────────────────────────────────────────────────
EOF
done

cat <<'OUTRO'

After all 20 are signed and redeployed, verify with:

  for g in 2048 wordle snake minesweeper sudoku pong clicker breakout \
           bubble solitaire match3 flappy crossy helix geometry jetpack \
           stickman tower pool hillclimb; do
    code=$(curl -s "https://mas-$g.vercel.app/.well-known/farcaster.json" \
      | python3 -c 'import sys,json; d=json.load(sys.stdin); print("ok" if "accountAssociation" in d else "missing")')
    echo "$g: $code"
  done

Expect: 20 × "ok".
OUTRO
