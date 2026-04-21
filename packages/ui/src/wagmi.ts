import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

// Base Sepolia only — matches NEXT_PUBLIC_CHAIN_ID=84532.
// Coinbase Smart Wallet is the primary connector; `injected` is a fallback
// for users running MetaMask/Rabby.
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
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
