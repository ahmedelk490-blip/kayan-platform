import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@erp/brand', '@erp/motion', '@erp/utils', '@erp/ui-market'],
  /**
   * تخزين مؤقت يسمح للنشر بأن يُرى.
   *
   * Next stamps fully-static pages with `s-maxage=31536000` — one year — on
   * the assumption that the CDN in front of it is purged on every deploy.
   * Hostinger's CDN is not: measured on the live site, an ordinary visitor
   * kept receiving the previous build while a cache-bypassing request already
   * saw the new one. Left alone, every future deploy would be invisible to
   * real users for a year.
   *
   * So HTML gets a short shared cache with revalidation, and `/_next/` keeps
   * Next's own immutable caching — those filenames carry a content hash, so
   * they are safe to pin forever and expensive to re-fetch.
   */
  async headers() {
    return [
      {
        source: '/:path((?!_next/).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
          },
        ],
      },
    ];
  },
  experimental: {
    // three and its R3F wrappers are the largest client dependency on the
    // site; tree-shaking their barrel imports keeps the non-3D routes clean.
    optimizePackageImports: ['three', '@react-three/fiber', '@react-three/drei', 'motion'],
  },
};

export default nextConfig;
