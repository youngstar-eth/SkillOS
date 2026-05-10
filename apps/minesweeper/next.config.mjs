/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources (no build step). Next must
  // transpile them alongside the app's own src/.
  transpilePackages: [
    "@skillos/contracts",
    "@skillos/duel-backend",
    "@skillos/game-types",
    "@skillos/lib-shared",
    "@skillos/ui",
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
  // Browsers, RSS readers, scrapers, and link-preview tools hit /favicon.ico
  // regardless of <link rel="icon"> hints. 307 to /icon (the metadata route)
  // kills the 404 noise and keeps a single source of truth. Non-permanent so
  // we can swap in a real multi-size .ico later without poisoned caches.
  redirects: async () => [
    {
      source: "/favicon.ico",
      destination: "/icon",
      permanent: false,
    },
  ],
};

export default nextConfig;
