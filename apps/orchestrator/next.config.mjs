/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TS sources; Next must transpile them with the app.
  // No @skillos/ui or @skillos/game-types here — orchestrator has no UI
  // and game-types is only reached transitively (no direct imports).
  transpilePackages: [
    "@skillos/contracts",
    "@skillos/duel-backend",
    "@skillos/lib-shared",
    "@skillos/sp-engine",
  ],
};

export default nextConfig;
