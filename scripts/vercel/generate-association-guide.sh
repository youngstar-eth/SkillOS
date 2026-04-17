#!/usr/bin/env bash
# Print a per-game walkthrough for Base App (base.dev) account association.
#
# Output is a plain-text guide that tells the user, for each of the 20 games:
#   1. Where to paste the domain (base.dev)
#   2. How to sign with Coinbase Wallet
#   3. Which 4 env vars to set (FARCASTER_HEADER/PAYLOAD/SIGNATURE + NEXT_PUBLIC_BASE_BUILDER_ADDRESS)
#
# Usage:
#   scripts/vercel/generate-association-guide.sh > account-association-guide.txt

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$HERE/lib.sh"

cat <<'INTRO'
═══════════════════════════════════════════════════════════════
  MAS — Base App Account Association Walkthrough (20 games)
═══════════════════════════════════════════════════════════════

Each mini app needs a signed proof that you own its Vercel
subdomain. Base App (base.dev) issues the signature via your
Coinbase Wallet. Once signed, 4 values go into Vercel env +
one redeploy makes the manifest pick them up.

General steps for each domain:
  1. Open https://base.dev (sign in with Coinbase account)
  2. Navigate: Preview → Account Association
  3. Paste the domain shown below (WITHOUT https://)
  4. Click Submit → Verify → Sign in Coinbase Wallet
     (use the Coinbase Wallet already linked to your Farcaster
     FID if you have one; otherwise any Coinbase Wallet)
  5. Copy the returned object: { header, payload, signature }
     plus the verified signing address (baseBuilder)
  6. Run the 4 `vercel env add` commands from apps/<game>
  7. Redeploy so the manifest picks up the new env vars

Estimated: ~1 min signing + ~30s env ops + ~3 min redeploy
per game × 20 games = ~90 min total (or parallelize redeploys).

───────────────────────────────────────────────────────────────
INTRO

for game in "${GAMES[@]}"; do
  domain="mas-$game.vercel.app"
  cat <<EOF

### GAME: $game
URL:     https://$domain
Manifest: https://$domain/.well-known/farcaster.json

  1. Open:      https://base.dev
  2. Login:     Coinbase account
  3. Navigate:  Preview → Account Association
  4. Domain:    $domain
  5. Submit → Verify → Sign (Coinbase Wallet)
  6. Copy: { header, payload, signature } + verified address

Terminal (from apps/$game):

  cd apps/$game
  echo "<HEADER>"    | /opt/homebrew/bin/npx vercel env add FARCASTER_HEADER               production
  echo "<PAYLOAD>"   | /opt/homebrew/bin/npx vercel env add FARCASTER_PAYLOAD              production
  echo "<SIGNATURE>" | /opt/homebrew/bin/npx vercel env add FARCASTER_SIGNATURE            production
  echo "<0xADDRESS>" | /opt/homebrew/bin/npx vercel env add NEXT_PUBLIC_BASE_BUILDER_ADDRESS production
  /opt/homebrew/bin/npx vercel --prod --yes --scope simpl3s-projects

Verify after redeploy:

  curl -s https://$domain/.well-known/farcaster.json \\
    | jq '.accountAssociation, .baseBuilder'

Expected:
  { "header": "...", "payload": "...", "signature": "..." }
  { "allowedAddresses": ["0x..."] }

───────────────────────────────────────────────────────────────
EOF
done

cat <<'OUTRO'

After all 20 are signed and redeployed, verify in bulk:

  for g in 2048 wordle snake minesweeper sudoku pong clicker breakout \
           bubble solitaire match3 flappy crossy helix geometry jetpack \
           stickman tower pool hillclimb; do
    result=$(curl -s "https://mas-$g.vercel.app/.well-known/farcaster.json" \
      | python3 -c 'import sys,json
d=json.load(sys.stdin)
aa = isinstance(d.get("accountAssociation"),dict)
bb = d.get("baseBuilder",{}).get("allowedAddresses",[])
print("ok" if aa and bb else "missing")')
    echo "$g: $result"
  done

Expect: 20 × "ok".

Tip: env vars propagate to new deployments only. The curl above will
show the old manifest until the redeploy finishes. Vercel builds are
~2-3 min cold, ~30s warm (build cache reused).
OUTRO
