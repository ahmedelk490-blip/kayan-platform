import type { NextConfig } from 'next';

/**
 * منصّة كيان — تطبيق واحد يخدم الطبقة العامة والنظام.
 *
 * There is no basePath any more, and there should not be one. It existed to
 * let two separate Next apps share a hostname without fighting over
 * `/_next/static/...`. One app has one asset namespace, so the problem it
 * solved no longer exists — and the ERP is meant to answer on `/dashboard`,
 * not `/erp/dashboard`.
 *
 * The two design systems stay apart through route groups with separate root
 * layouts: `(site)` loads site.css, `(erp)` loads erp.css, and no page ever
 * loads both.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ['@erp/brand', '@erp/domain', '@erp/utils', '@erp/motion', '@erp/ui-market'],
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client'],
};

export default nextConfig;
