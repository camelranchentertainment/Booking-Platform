/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // ESLint is run separately in CI; don't let it block production builds.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
