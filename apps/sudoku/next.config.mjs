/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources (no build step). Next must
  // transpile them alongside the app's own src/.
  transpilePackages: [
    "@skillbase/contracts",
    "@skillbase/duel-backend",
    "@skillbase/game-types",
    "@skillbase/lib-shared",
    "@skillbase/ui",
  ],
  webpack: (config) => {
    // We only use coinbaseWallet + injected from @wagmi/connectors. The
    // package barrel-imports optional peer deps (porto, @base-org/account,
    // @metamask/connect-evm, @safe-global/*) that we don't install. Stub
    // their resolution so webpack can tree-shake the dead connectors.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      porto: false,
      "porto/internal": false,
      "porto/core/internal": false,
      "porto/wagmi": false,
      "@base-org/account": false,
      "@metamask/connect-evm": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
      "@walletconnect/ethereum-provider": false,
      accounts: false,
      pino: false,
      "pino-pretty": false,
      encoding: false,
    };
    return config;
  },
};

export default nextConfig;
