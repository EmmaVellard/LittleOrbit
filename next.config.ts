import type { NextConfig } from 'next';

const isGitHubPages = process.env.LITTLE_ORBIT_GITHUB_PAGES === 'true';
const basePath = isGitHubPages ? '/LittleOrbit' : '';

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: 'export' as const,
        basePath,
        assetPrefix: basePath,
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
