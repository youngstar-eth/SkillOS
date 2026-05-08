# Branch Protection — main

This document records the full branch-protection posture for `main` and how each layer is configured.

## Layer 1 — Claude Code local deny rules (checked in)

`.claude/settings.json` (repo root) contains deny rules that block Claude Code from pushing directly to `main`:

```json
{
  "permissions": {
    "deny": [
      "Bash(git push*origin main*)",
      "Bash(git push*:main*)"
    ]
  }
}
```

The first pattern blocks `git push [flags] origin main [flags]` (standard push and force-push).  
The second pattern blocks `git push origin <ref>:main` (explicit refspec pushes).

These rules fire inside any Claude Code session that loads this repo. A human using the terminal directly is **not** blocked by this layer — that is intentional (emergency break-glass).

## Layer 2 — GitHub branch protection (apply manually after merge)

Admins can enable server-side enforcement with the `gh` CLI. Run once from any machine with admin access:

```bash
# Require at least 1 approving PR review before merge; dismiss stale on new push.
# enforce_admins=false so owner can bypass in emergencies.
gh api repos/youngstar-eth/skillbase/branches/main/protection \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  --field enforce_admins=false \
  --field required_status_checks=null \
  --field restrictions=null \
  --field 'required_pull_request_reviews={"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":false}'
```

To verify the rule was applied:

```bash
gh api repos/youngstar-eth/skillbase/branches/main/protection
```

To remove the rule (if ever needed):

```bash
gh api repos/youngstar-eth/skillbase/branches/main/protection --method DELETE
```

## Context

Direct-to-main pushes were explicitly authorized during the April–May 2026 submission sprint (`89c5f6c..a26890d`) to accelerate deploy cadence. That authorization was sprint-scoped. Layer 1 was reinstated via PR `chore: submission-sprint tech debt cleanup`; Layer 2 is documented here for the founder to apply via the `gh` CLI snippet above.
