import { fileURLToPath } from 'node:url';
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

  /**
   * Standalone output — a self-contained server, not a folder of chunks.
   *
   * Hostinger's Next.js pipeline builds the repo, then looks for a server it
   * can run. The default build leaves only `.next`, which needs the whole
   * `node_modules` tree beside it; the pipeline refused it with "no standalone
   * server or static output". This emits `.next/standalone` carrying
   * `server.js` and exactly the dependencies the traced code actually loads.
   *
   * The plain `.next` output is still written alongside it, so deploying over
   * SSH keeps working unchanged.
   */
  output: 'standalone',

  /**
   * Trace from the monorepo root, not from `apps/web`.
   *
   * This app imports five workspace packages that live outside its own
   * directory, and npm hoists their dependencies to the root `node_modules`.
   * Tracing from `apps/web` stops at that boundary and silently omits both —
   * the build succeeds and the server dies on the first request with a module
   * it cannot find. That failure looks like a hosting problem and is not one.
   */
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
};

export default nextConfig;
