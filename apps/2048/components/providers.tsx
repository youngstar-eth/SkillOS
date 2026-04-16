"use client";

import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { baseSepolia } from "wagmi/chains";
import type { ReactNode } from "react";

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
