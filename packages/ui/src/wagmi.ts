import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

// Base Sepolia only — matches NEXT_PUBLIC_CHAIN_ID=84532.
//
// Connector order is intentional:
//   1. farcasterMiniApp — auto-claims the Mini App wallet provider when the
//      app is loaded inside Warpcast / Base App. No-op outside that context.
//   2. coinbaseWallet — Smart Wallet for standalone web users.
//   3. injected — MetaMask / Rabby fallback for standalone web.
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    farcasterMiniApp(),
    coinbaseWallet({
      appName: "Skillbase Duel",
      preference: { options: "smartWalletOnly" },
    }),
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
