/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace-linked @mas/shared package alongside app code.
  transpilePackages: ["@mas/shared"],
};

module.exports = nextConfig;
