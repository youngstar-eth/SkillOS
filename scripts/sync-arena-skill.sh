#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sync the skillos-arena distribution copy from its canonical source.
#
# Canonical source:   packages/arena/{SKILL.md,LICENSE}   (the @skillos/arena pkg)
# Distribution copy:   skills/skillos-arena/{SKILL.md,LICENSE}
#
# skills/skillos-arena/ is the npx-skills-discoverable surface (vercel-labs/skills
# scans the repo-root skills/ container). It MUST stay byte-identical to the
# canonical package so users never install a stale spec.
#
# This is the one-command fix when arena-skill-drift-check.yml (§4 drift guard)
# fails: edit the canonical packages/arena copy, then run this to refresh the
# distribution copy.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Resolve repo root so this works from any CWD.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANON="$ROOT/packages/arena"
DIST="$ROOT/skills/skillos-arena"

mkdir -p "$DIST"
for f in SKILL.md LICENSE; do
  cp "$CANON/$f" "$DIST/$f"
  echo "synced: skills/skillos-arena/$f  <-  packages/arena/$f"
done

echo "✓ arena skill distribution copy is in sync with packages/arena"
