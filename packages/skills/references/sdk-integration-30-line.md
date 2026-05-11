# references/sdk-integration-30-line.md

The minimum-viable `@skillos/sdk` integration for a React skill game. ~30 lines of code; copy-paste-able.

## Install

```bash
npm install @skillos/sdk@^0.2.1
npm install react@^18 react-dom@^18 viem@^2 wagmi@^2 @tanstack/react-query@^5
```

## Wrap your app

```tsx
// src/Providers.tsx
import { SkillOSProvider } from '@skillos/sdk/react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { baseAccount } from 'wagmi/connectors';

const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [baseAccount({ appName: 'my-skill-game' })],
  transports: { [baseSepolia.id]: http() },
});
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SkillOSProvider config={{ env: 'testnet', builderCode: 'bc_xxxxxxxx' }}>
          {children}
        </SkillOSProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

## Sign in (SIWB — human player)

```tsx
import { useSkillOSAuth } from '@skillos/sdk/react';

function SignInButton() {
  const { signIn, signOut, isSignedIn, address } = useSkillOSAuth();
  return isSignedIn
    ? <button onClick={signOut}>Sign out ({address})</button>
    : <button onClick={signIn}>Sign in with Base</button>;
}
```

## Submit a score

```tsx
import { useSkillOSScore } from '@skillos/sdk/react';

function SubmitScore({ tournamentId, score }: { tournamentId: `0x${string}`; score: number }) {
  const { submit, status, data, error } = useSkillOSScore({ tournamentId });

  return (
    <>
      <button onClick={() => submit({ score, tier: 'T0' })}>Submit {score}</button>
      {status === 'pending' && <p>Submitting…</p>}
      {data?.txHash && <p>Submitted: <a href={`https://sepolia.basescan.org/tx/${data.txHash}`}>{data.txHash.slice(0, 14)}…</a></p>}
      {error && <p>Error: {error.message}</p>}
    </>
  );
}
```

## List tournaments + leaderboard

```tsx
import { useSkillOSTournaments, useSkillOSLeaderboard } from '@skillos/sdk/react';

function Tournaments() {
  const { data } = useSkillOSTournaments();
  return <ul>{data?.items.map(t => <li key={t.id}>{t.game} — pool {t.prizePool}</li>)}</ul>;
}

function Leaderboard({ tournamentId }: { tournamentId: `0x${string}` }) {
  const { data } = useSkillOSLeaderboard({ tournamentId });
  return <ol>{data?.items.map((row, i) => <li key={row.player}>{row.player.slice(0, 8)} — {row.score}</li>)}</ol>;
}
```

## That's it

You now have:

- Sign-in flow via Base Account (wagmi connector).
- Score submission with Builder Code attribution baked in (server-signs via `STUDIO_PRIVATE_KEY`, the on-chain `submitSoloScore` tx attaches your Builder Code as `dataSuffix`).
- Tournament list + leaderboard hooks.

## Common questions

**Q: I don't have a Builder Code yet — can I skip it?**
Yes. `builderCode` is optional on `SkillOSProvider`. Submissions work without it; you just don't earn the protocol revenue share until you register and wire one. See [`../prompts/builder-code-wiring.md`](../prompts/builder-code-wiring.md).

**Q: I need to use a private key (Node-side script, agent), not a browser wallet — how?**
Use the vanilla agent client: `createSkillOSAgentClient({ env: 'testnet', agentId, signer })` from `@skillos/sdk`. See [`auth-patterns.md`](./auth-patterns.md) for the SIWA agent flow.

**Q: What if the on-chain submission reverts?**
See [`error-recovery.md`](./error-recovery.md). Short version: the SDK exposes `error.code` strings like `CHAIN_REVERT_TournamentAlreadyEnded` and `CHAIN_REVERT_InsufficientFeePaid` for the standard revert cases; build UI around those codes.

**Q: How do I create a tournament?**
For Phase 1, tournament creation is permissioned through the SkillOS team / configured cron. Phase 2 opens up permissionless creation via `TournamentPool.createTournament()`. Most developers integrate with existing tournaments rather than creating their own.

**Q: What's `useSkillOSSponsor`?**
For your players to fund prize pools directly (sponsor flow). The hook returns `fundCalldata(amountUsdc)` which gives you the calldata for the two-step USDC approve + `sponsorPool` flow. Out of scope for v0.1 game integration; relevant when you also build a sponsor dashboard.
