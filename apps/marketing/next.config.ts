import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@erp/brand', '@erp/motion', '@erp/utils', '@erp/ui-market'],
  experimental: {
    // three and its R3F wrappers are the largest client dependency on the
    // site; tree-shaking their barrel imports keeps the non-3D routes clean.
    optimizePackageImports: ['three', '@react-three/fiber', '@react-three/drei', 'motion'],
  },
};

export default nextConfig;
