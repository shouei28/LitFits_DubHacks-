import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @fitmirror/shared ships TypeScript source, no build step.
  transpilePackages: ['@fitmirror/shared'],
  // Linting runs from the repo root (`pnpm lint`).
  eslint: { ignoreDuringBuilds: true },
  // opencv.js optionally requires Node builtins. The browser build never calls them.
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
