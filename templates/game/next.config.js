/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile source-TS workspace packages alongside app code.
  transpilePackages: ["@mas/shared"],
  // Silence noisy wagmi/viem transitive warnings in dev
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    // MetaMask SDK optional peer dependency — only used in React Native builds.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

module.exports = nextConfig;
