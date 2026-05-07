/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TS sources; Next must transpile them with the app.
  // No @skillbase/ui or @skillbase/game-types here — orchestrator has no UI
  // and game-types is only reached transitively (no direct imports).
  transpilePackages: [
    "@skillbase/contracts",
    "@skillbase/duel-backend",
    "@skillbase/lib-shared",
    "@skillbase/sp-engine",
  ],
};

export default nextConfig;
