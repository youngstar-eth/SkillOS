# references/error-recovery.md

Patterns for handling score-submit failures. The SDK exposes structured error codes; build the player-facing UI around those codes, not around HTTP status codes alone.

## The error envelope

All non-2xx responses from the SkillOS API follow this shape (per the OpenAPI spec):

```ts
{
  error: {
    code: string;           // stable machine-readable code
    message: string;        // human-readable
    details?: unknown;      // optional structured detail
  }
}
```

When using `@skillos/sdk`, the SDK wraps these into a `SkillOSApiError` whose `.code` matches the envelope's `error.code`.

## Common codes you'll see on submit

| Code | HTTP | Meaning | Recommended UX |
|---|---|---|---|
| `AUTH_BEARER_MISSING` | 400 | No `Authorization: Bearer` header | Prompt sign-in (`useSkillOSAuth().signIn()`) |
| `AUTH_BEARER_INVALID` | 400 | Token doesn't decode / signature wrong | Sign out, prompt re-sign-in |
| `AUTH_BEARER_EXPIRED` | 400 | Token past `exp` | Sign out, prompt re-sign-in |
| `INVALID_PARAMS` | 400 | Zod validation rejected the request body | Show the field-level error from `error.details` |
| `RATE_LIMITED` | 429 | Per-wallet or per-agent rate cap hit | Disable button briefly; surface `X-RateLimit-Reset` header |
| `CHAIN_REVERT_TournamentAlreadyEnded` | 409 | Tournament's `endsAt` passed before tx mined | Show "Tournament ended" + link to next tournament |
| `CHAIN_REVERT_InsufficientFeePaid` | 409 | Player owes a paid-retry fee from a prior submission | Show paid-retry flow (see "Pattern: paid retry" below) |
| `CHAIN_REVERT_TournamentNotStarted` | 409 | Tournament hasn't crossed `startsAt` yet | Show "Tournament starts in X minutes" |
| `TIER_NOT_IMPLEMENTED` | 400 | Caller passed `tier: 'T1'+` (Phase 2 only) | Switch to `tier: 'T0'`; T1+ deferred |
| `INTERNAL` | 500 | Server-side unexpected error | Retry with backoff; surface a generic "try again" |

## Pattern: paid retry

After a player's first FREE submission to a tournament, subsequent submissions in the same tournament require a small on-chain fee (`PER_RETRY_FEE`, configured per-tournament). If they try to submit without paying, the chain reverts with `InsufficientFeePaid`. The SDK doesn't yet auto-handle the paid-retry flow — your code needs to:

1. Catch `CHAIN_REVERT_InsufficientFeePaid` from `submit()`.
2. Surface a "Pay $X to retry" confirmation UI.
3. Call the explicit paid-retry SDK flow (Phase 2 work — for v0.1, point users at "your first submission counts, pay attention to subsequent attempts").

For v0.1 of most games: **show the player their submission count in this tournament** (1 free per tournament; subsequent ones cost). This sets expectations.

## Pattern: pending submit + page navigation

The `submit()` call returns a `txHash` once the on-chain tx is broadcast — but the tx may not be **confirmed** for several seconds (Base Sepolia ~2s blocktime, can spike). Common race condition: player submits, sees the txHash, navigates away before the leaderboard reflects the score.

Handle this with the **pending state pattern**:

```tsx
const { submit, status, data } = useSkillOSScore({ tournamentId });

// status: 'idle' | 'pending' | 'success' | 'error'
if (status === 'pending') {
  return <p>Submitting your score… (this can take a few seconds)</p>;
}
if (status === 'success' && data?.txHash) {
  return (
    <p>
      Submitted! Tx: <a href={`https://sepolia.basescan.org/tx/${data.txHash}`} target="_blank">{data.txHash.slice(0, 14)}…</a>
      <br />
      Your rank may take a few seconds to appear on the leaderboard.
    </p>
  );
}
```

The leaderboard query (`useSkillOSLeaderboard`) re-runs every 10 seconds by default. To get instant feedback after a submit, invalidate the leaderboard query manually:

```tsx
const queryClient = useQueryClient();
await submit({ score, tier: 'T0' });
// after a brief delay to let the tx mine:
setTimeout(() => {
  queryClient.invalidateQueries({ queryKey: ['skillos', 'leaderboard', tournamentId] });
}, 3000);
```

## Pattern: network / RPC failures

If the SDK's submit fetch itself fails (network down, DNS issue, SkillOS API momentarily unreachable), the SDK throws a plain `Error` (not a `SkillOSApiError`). Recognize this distinction:

```tsx
try {
  await submit({ score, tier: 'T0' });
} catch (err) {
  if (err instanceof SkillOSApiError) {
    // structured error — handle by err.code
  } else {
    // network / unexpected — retry with backoff
  }
}
```

## What NOT to do

- Don't auto-retry on chain reverts. `CHAIN_REVERT_*` codes mean the chain rejected the tx — retrying will just revert again. Surface the error and let the player decide.
- Don't auto-retry on `RATE_LIMITED`. Respect the `X-RateLimit-Reset` header.
- Don't lose the txHash. Store it in URL state or local storage so a navigation/refresh doesn't lose track of the submission.
- Don't pretend a submission "succeeded" before you have a txHash. The hook's `status === 'success'` is the right signal; the txHash is in `data.txHash`.

## When the player is offline

The submission flow requires:
- Network connection to `api.skillos.network`.
- Network connection to Base Sepolia RPC (for the wallet's sign + the server's broadcast).
- The player's wallet (Base Account smart wallet, MetaMask, etc.) being unlocked / available.

If the player loses connection mid-submit, the submission is **not durable** — the SDK doesn't queue pending submissions for retry-on-reconnect today. (That's a Phase 2 enhancement.) For v0.1, surface "you're offline — your score didn't save" and have the player resubmit when back online. Local-storage caching the score before submit is a reasonable defensive UX.
