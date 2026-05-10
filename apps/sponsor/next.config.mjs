/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TS sources; Next must transpile them with the app.
  transpilePackages: [
    "@skillos/contracts",
    "@skillos/duel-backend",
    "@skillos/lib-shared",
    "@skillos/ui",
  ],
  webpack: (config) => {
    // Stub optional connector peers we don't use (mirrors apps/2048).
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
