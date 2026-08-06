import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@erp/brand', '@erp/domain', '@erp/utils'],
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client'],
};

export default nextConfig;
