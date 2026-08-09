import { PrismaClient } from '@prisma/client';
import { currentTenant } from './tenant-context';

/**
 * Prisma clients.
 *
 * Next.js dev reloads modules on every edit; without the global cache each
 * reload opens a new connection pool until the database refuses more.
 *
 * ── Why every query runs in a transaction (Phase 7) ─────────
 *
 * PostgreSQL RLS reads the tenant from a session setting, and Prisma pools
 * connections — so setting it once and querying later would be a race: the
 * query could land on a different connection than the SET. The array form of
 * `$transaction` guarantees both statements run on one connection inside one
 * transaction, and `set_config(..., true)` scopes the setting to that
 * transaction so it cannot leak to the next borrower of the pooled
 * connection.
 *
 * The cost is one round trip per query. That is the price of the database,
 * rather than the application, being the thing that enforces isolation —
 * which is precisely what ADR-002 asked for.
 */
const globalForPrisma = globalThis as unknown as {
  prismaBase?: PrismaClient;
  prismaAuth?: PrismaClient;
};

const base =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaBase = base;

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const tenantId = currentTenant();

        // No tenant means no session yet. The query still goes out, and the
        // database denies it — deliberately. Silently widening the scope
        // here would undo the whole point of the policies.
        if (!tenantId) return query(args);

        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  },
});

/**
 * A transaction that carries the tenant.
 *
 * Interactive transactions must not go through the extension above: the
 * extension opens a transaction of its own, and PostgreSQL has no nested
 * transactions. So `tenantTransaction` opens one transaction, declares the
 * tenant inside it, and hands the caller the plain transaction client — on
 * which the extension never fires, because it is not the extended client.
 *
 * Every multi-statement operation in the application uses this. Calling
 * `prisma.$transaction` directly would open a transaction with no tenant
 * declared, and RLS would correctly refuse to do anything.
 */
export async function tenantTransaction<T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
): Promise<T> {
  const tenantId = currentTenant();
  return base.$transaction(async (tx) => {
    if (tenantId) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    }
    return fn(tx);
  });
}

/**
 * The one connection permitted to cross tenants.
 *
 * Login has to find a user by email before anybody knows which tenant that
 * user belongs to, and session lookup has the same chicken-and-egg problem.
 * `kayan_auth` holds BYPASSRLS for exactly that, and is used by nothing but
 * `lib/auth.ts`. Keeping it a separate client makes the exception one
 * greppable import rather than a flag someone can set anywhere.
 */
export const authDb =
  globalForPrisma.prismaAuth ??
  new PrismaClient({
    datasources: { db: { url: process.env.AUTH_DATABASE_URL } },
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaAuth = authDb;
