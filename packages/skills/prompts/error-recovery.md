# prompts/error-recovery.md

**Use this when:** the developer's `submit()` call is failing OR you're scaffolding the result-page error UX. This prompt is action-oriented (what to do, in what order). For the full code-table of error codes, see [`../references/error-recovery.md`](../references/error-recovery.md) — kept separate so this prompt stays scannable.

## Core principle (X9 lesson)

> **Never swallow errors silently. Match by error code, never by substring.**
>
> Sprint X9's silent-swallow bug landed because a generic try/catch matched on substring (`err.message.includes('not found')`) and treated unrelated failures as "tournament missing." That hid a real settle-path bug for days. **Always** branch on the structured `error.code` field; surface anything you don't recognize.

## Step-by-step error handling flow

### Step 1 — distinguish structured vs network errors

```ts
try {
  await submit({ score, tier: 'T0' });
} catch (err) {
  if (err instanceof SkillOSApiError) {
    // structured — server returned an error envelope; branch on err.code
  } else {
    // network / unexpected — retry with backoff
  }
}
```

`SkillOSApiError.code` is a stable machine-readable string. The full table is in [`../references/error-recovery.md`](../references/error-recovery.md).

### Step 2 — branch by error code (not message)

For the high-frequency codes:

```ts
switch (err.code) {
  case 'AUTH_BEARER_MISSING':
  case 'AUTH_BEARER_INVALID':
  case 'AUTH_BEARER_EXPIRED':
    // re-trigger sign-in
    await signIn();
    break;

  case 'CHAIN_REVERT_TournamentNotFound':
    // tournament not created yet — usually a timing race with the daily cron
    // DO NOT auto-retry the submit; the tournament won't exist any sooner
    showUserMessage("Today's tournament hasn't started yet — try again in a few minutes.");
    break;

  case 'CHAIN_REVERT_TournamentAlreadyEnded':
    showUserMessage('This tournament has ended. Next round opens at 00:00 UTC.');
    break;

  case 'CHAIN_REVERT_InsufficientPrizePool':
    // sponsor balance issue — alert the operator, not the player
    console.error('[SkillOS] InsufficientPrizePool — sponsor sweep failed?', err);
    showUserMessage('Submission temporarily unavailable. Try again shortly.');
    break;

  case 'CHAIN_REVERT_InsufficientFeePaid':
    // player owes a paid-retry fee from a prior submission in this tournament
    showPaidRetryConfirm({ feeUsdc: err.details?.fee, onAccept: () => retry() });
    break;

  case 'TIER_NOT_IMPLEMENTED':
    // developer error: passed tier T1/T2/T3 before Phase 2 is shipped
    console.error('[SkillOS] T1+ not supported in 0.2.1 — use T0');
    break;

  case 'RATE_LIMITED':
    // respect X-RateLimit-Reset header from the response
    disableSubmitUntil(err.details?.resetAt);
    break;

  default:
    // CRITICAL: do NOT silently swallow unknown codes
    console.error('[SkillOS] Unrecognized error code:', err.code, err);
    showUserMessage('Submission failed — please refresh and try again.');
}
```

### Step 3 — network failures (5xx, ECONNRESET, fetch reject)

Exponential backoff retry, **capped at 3 attempts**:

```ts
async function submitWithBackoff(args: SubmitArgs): Promise<SubmitResult> {
  let delay = 500;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await submit(args);
    } catch (err) {
      if (err instanceof SkillOSApiError) throw err;  // structured — don't retry
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error('unreachable');
}
```

Only retry on **network/unknown** errors, never on structured `SkillOSApiError` (the chain rejected; retrying makes it worse).

### Step 4 — useSoloRetry hook pattern (matches 6 in-monorepo games)

The 6 in-monorepo games all use a shared `useSoloRetry` hook for pending-submit + retry. Pattern:

```tsx
const { submit, status, data, error } = useSkillOSScore({ tournamentId });
const { canRetry, retry, retriesRemaining } = useSoloRetry({ status, error });

// `pending` → show spinner
// `success` → show txHash + Blockscout link
// `error` AND canRetry → show "Try again ({retriesRemaining} left)" button
// `error` AND !canRetry → show error.message + "Refresh page" CTA
```

Source: see `apps/2048/src/components/GameOver.tsx` for the canonical implementation.

## What NOT to do

- **Don't** match errors on substring (`err.message.includes(...)`). Match on `err.code`. X9 lesson.
- **Don't** auto-retry chain reverts. They will revert again.
- **Don't** auto-retry on `RATE_LIMITED`. Respect the reset header.
- **Don't** lose the txHash. Store it in URL state or localStorage so a navigation/refresh doesn't lose track of an in-flight submission.
- **Don't** declare success before `data.txHash` is present. The hook's `status === 'success'` is necessary; the txHash field is the sufficient condition.
- **Don't** invent error codes that don't exist in the API. The full canonical list is in [`../references/error-recovery.md`](../references/error-recovery.md).

## When in doubt

If you encounter an error code not listed here or in the reference table:

1. Surface it to the user (don't swallow).
2. Log the full error to console.
3. **Do not invent recovery logic.** Ask the developer; better: open an issue on [`github.com/youngstar-eth/skillos/issues`](https://github.com/youngstar-eth/skillos/issues) with the txHash.

## Cross-reference

- Full error code table + structured envelope shape: [`../references/error-recovery.md`](../references/error-recovery.md)
- Auth flows (SIWB human, SIWA agent): [`../references/auth-patterns.md`](../references/auth-patterns.md)
- Live attribution verification (separate concern from runtime errors): [`verify-attribution-live.md`](./verify-attribution-live.md)
