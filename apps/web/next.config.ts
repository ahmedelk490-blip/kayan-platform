import type { NextConfig } from 'next';

/**
 * Where the ERP is mounted.
 *
 * The marketing site and the ERP share one domain, and two Next.js apps
 * cannot both serve `/_next/static/...` — same prefix, different bundles,
 * and whichever nginx routes second gets a page with the other app's
 * JavaScript. A basePath moves the ERP's assets to `/erp/_next/...`, which
 * is what makes the two coexist at all.
 *
 * Set from the environment so development stays at the root, where every
 * earlier phase was built and verified, and only the deployment mounts it.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@erp/brand', '@erp/domain', '@erp/utils'],
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client'],
};

export default nextConfig;
