# references/auth-patterns.md

SkillOS supports two auth flows: **SIWB** for human players (Sign-In With Base, EIP-4361) and **SIWA** for AI agents (Sign-In With Agent, ERC-8004 + ERC-8128).

## Which one do I want?

| Caller is | Use | Why |
|---|---|---|
| A human player opening the game in their browser | **SIWB** | Standard human-wallet flow. Base Account smart wallet handles signing. |
| An AI agent (Claude agent loop, Codex-Code-Game-Studios runner, scripted player) | **SIWA** | Per-agent identity via ERC-8004 NFT, per-request signing via ERC-8128. Auditable, attributable to a specific agent. |

Don't try to use SIWB for an agent (wrong primitive — Base Account isn't designed for headless server agents). Don't try to use SIWA for a human (over-engineered — the human has a wallet, just use it).

## SIWB — human player flow

The `useSkillOSAuth` hook from `@skillos/sdk/react` handles the full handshake. The developer just calls `signIn()`:

```tsx
import { useSkillOSAuth } from '@skillos/sdk/react';

function SignInButton() {
  const { signIn, signOut, isSignedIn, address, expiresAt } = useSkillOSAuth();
  if (isSignedIn) {
    return (
      <>
        Signed in as {address}
        <button onClick={signOut}>Sign out</button>
      </>
    );
  }
  return <button onClick={signIn}>Sign in with Base</button>;
}
```

Under the hood, `signIn()`:

1. Connects the wagmi wallet (Base Account by default).
2. Fetches a nonce from `POST /v1/auth/siwb/nonce`.
3. Asks the wallet to sign a SIWE-formatted message (EIP-4361, EIP-6492 wrapped for smart wallets).
4. Posts `{ message, signature, walletAddress }` to `POST /v1/auth/siwb/verify`.
5. Receives a 24h bearer JWT; persists it (localStorage by default, opt-out via `persistAuth: false`).

The bearer is automatically attached to subsequent SDK calls (`useSkillOSScore`, etc.) by the provider.

### Persistence options

```tsx
<SkillOSProvider config={{
  env: 'testnet',
  builderCode: 'bc_xxxxxxxx',
  persistAuth: 'localStorage',  // default
  // OR
  persistAuth: false,            // memory-only (sessions don't survive reload)
}}>
```

### Common SIWB errors

- `AUTH_NONCE_NOT_FOUND` — server doesn't know this nonce; usually means the request was tampered with or the nonce never existed.
- `AUTH_NONCE_CONSUMED` — nonce was used; replay protection caught it. Sign in again to get a fresh nonce.
- `AUTH_NONCE_EXPIRED` — nonce older than 5 minutes. Re-trigger sign-in.

## SIWA — AI agent flow

Used when the caller is an AI agent (not a human). The agent has its own ERC-8004 identity NFT on Base Sepolia and signs requests per-call via ERC-8128.

```ts
import { createSkillOSAgentClient } from '@skillos/sdk';
import { createLocalAccountSigner } from '@buildersgarden/siwa/signer';  // see "Signer construction" below
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const signer = createLocalAccountSigner(account);

const agent = createSkillOSAgentClient({
  env: 'testnet',
  agentId: 5764,    // your ERC-8004 token ID from registration
  signer,
});

const session = await agent.signIn();  // SIWA: nonce → sign → verify → receipt
console.log(session.builderCode);       // e.g. "bc_xxxxxxxx" (auto-fetched server-side)

const result = await agent.scores.submit({
  tournamentId: '0x...',
  score: 1024,
  tier: 'T0',
});
console.log(result.txHash);  // on-chain tx attributing the score to the agent
```

### Registering an agent (one-time)

Before SIWA can work, the agent address must hold an ERC-8004 NFT. Register via the SkillOS monorepo's helper script:

```bash
REGISTER_AGENT_PRIVATE_KEY=0x... \
  npx tsx scripts/register-agent.ts \
  --name "My agent" \
  --description "What this agent does" \
  --endpoint https://my-agent.example.com
```

The script calls `IdentityRegistry.register(agentURI)` directly via `viem.writeContract` (does NOT use the upstream library's `registerAgent` helper — see `project_x4_siwa_library_signer_brittleness.md` in the SkillOS memory for the canonical "direct contract write" pattern). Output includes the assigned `agentId`.

### Signer construction (Node side)

The agent client expects a `Signer` shape with `getAddress()`, `signMessage()`, and `signRawMessage()`. There are two paths:

1. **Use the library's factory** (if you can install `@buildersgarden/siwa/signer`):
   ```ts
   import { createLocalAccountSigner } from '@buildersgarden/siwa/signer';
   ```
   Note: `@buildersgarden/siwa/signer` transitively imports optional peer SDKs (`@circle-fin/...`, `@privy-io/...`, `@openfort/...`). If those aren't installed in your env, this import fails. Either install the peers or use option 2.

2. **Inline 3-method signer** (no extra deps):
   ```ts
   const signer = {
     async getAddress() { return account.address; },
     async signMessage(message: string) { return account.signMessage({ message }); },
     async signRawMessage(rawHex: `0x${string}`) {
       return account.signMessage({ message: { raw: rawHex } });
     },
   };
   ```
   The agent client uses these three methods and no others on the SIWA + ERC-8128 paths.

The SkillOS reference smoke script (`scripts/agent-smoke.mjs`) uses option 2.

### React-side agent flow

For demos where the developer signs in AS an agent via their connected wallet (rather than a Node-side script):

```tsx
import { useSkillOSAgent } from '@skillos/sdk/react';

function AgentDemo({ agentId }: { agentId: number }) {
  const { signInAsAgent, client, isSignedIn, receipt } = useSkillOSAgent({ agentId });
  // signInAsAgent runs the full SIWA handshake using the connected wagmi wallet as the signer.
  // After sign-in, client.scores.submit({...}) is callable.
}
```

Real production agents use the vanilla Node-side client; the React hook is for demos.

## Agent Builder Code attribution

When an agent calls `signIn()`, the SkillOS server fetches the agent's Base Builder Code from `api.base.dev/v1/agents/builder-codes` and returns it in the SIWA verify response. The agent client caches it on the session object.

Today (`@skillos/sdk@0.2.1`), the server-side `dataSuffix` fold-in for agent submissions is **deferred to Phase 2** — the agent's Builder Code is returned client-side for display but NOT yet appended to the `submitSoloScore` calldata. Don't promise agent-side Builder Code revenue share to developers until Phase 2 ships.

## Cross-reference

- For the SDK integration shape: [`sdk-integration-30-line.md`](./sdk-integration-30-line.md)
- For the Builder Code wiring details: [`../prompts/builder-code-wiring.md`](../prompts/builder-code-wiring.md)
- For submit-error handling: [`error-recovery.md`](./error-recovery.md)
