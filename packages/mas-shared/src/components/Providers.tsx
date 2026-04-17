"use client";

import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { baseSepolia } from "wagmi/chains";
import type { ReactNode } from "react";

/**
 * Root provider — wraps the app with OnchainKit's MiniKitProvider
 * (which also seeds a wagmi + react-query config wired to Base Sepolia).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MiniKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={baseSepolia}
    >
      {children}
    </MiniKitProvider>
  );
}
