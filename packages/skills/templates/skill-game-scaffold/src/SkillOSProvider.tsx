// Providers wrapper — composes WagmiProvider + QueryClientProvider + SkillOSProvider.
//
// Replace `BUILDER_CODE` with your registered Base Builder Code. See the docs:
//   https://docs.base.org/ai-agents/setup/agent-builder-codes
// Without a Builder Code, submissions still work — you just don't earn the
// protocol revenue share.
//
// The `injected` connector works with any browser-installed EVM wallet.
// For Base Account smart wallet flow specifically, swap to:
//   import { baseAccount } from '@base-org/account/wagmi';
//   connectors: [baseAccount({ appName: 'my-skill-game' })]

import type { ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SkillOSProvider } from '@skillos/sdk/react';

// TODO: replace with your registered Base Builder Code (bc_xxxxxxxx).
// Leave undefined if you don't have one yet — submissions still work.
const BUILDER_CODE: `bc_${string}` | undefined = undefined;

const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SkillOSProvider
          config={{
            env: 'testnet',
            ...(BUILDER_CODE ? { builderCode: BUILDER_CODE } : {}),
          }}
        >
          {children}
        </SkillOSProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
