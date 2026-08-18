import { PrismaClient } from '@prisma/client';
import { currentTenant } from './tenant-context';

/**
 * Prisma clients.
 *
 * Next.js dev reloads modules on every edit; without the global cache each
 * reload opens a new connection pool until the database refuses more.
 *
 * ── What the move to MySQL removed from this file ───────────
 *
 * Every query used to run inside a transaction that first called
 * `set_config('app.tenant_id', …)`, because PostgreSQL row-level security
 * read the tenant from a session setting and Prisma pools connections — so
 * setting it once and querying later would have been a race.
 *
 * MySQL has no row-level security, so there is no setting to declare and
 * nothing reading it. Keeping the wrapper would have cost a round trip per
 * query to configure a mechanism that no longer exists.
 *
 * That leaves the tenant filter in each query as the only thing separating
 * one company's data from another's. It is not assumed:
 * `scripts/verify-tenant-scoping.mjs` walks all 240 read and write call
 * sites and fails on any that lacks it. Running it during the move found
 * three deletes that took an id from the browser and never checked
 * ownership — the database had been refusing them from underneath.
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

/**
 * The application client.
 *
 * Plain, with no query extension. It used to be wrapped; see the note above
 * for why it no longer is.
 */
export const prisma = base;

/**
 * A transaction whose tenant is stated by the caller.
 *
 * The tenant argument no longer configures the database — nothing reads it
 * now. It is kept because every caller passes a verified tenant and reads
 * as a declaration of scope at the call site, and because removing it would
 * touch every writing path in the application for no behavioural gain.
 *
 * The transaction itself is doing the real work: multi-statement operations
 * — allocate an invoice number, write the lines, move the stock — must
 * commit together or not at all.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  ) => Promise<T>,
): Promise<T> {
  void tenantId;
  return base.$transaction(async (tx) => fn(tx));
}

/** The same, taking the tenant from the request context rather than an argument. */
export async function tenantTransaction<T>(
  fn: (
    tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  ) => Promise<T>,
): Promise<T> {
  void currentTenant();
  return base.$transaction(async (tx) => fn(tx));
}

/**
 * The identity client.
 *
 * Login has to find a user by email before anybody knows which tenant that
 * user belongs to, and session lookup has the same chicken-and-egg problem.
 * Under PostgreSQL this needed a separate role holding BYPASSRLS, because
 * the ordinary connection would have been refused by the policies.
 *
 * MySQL has no policies to be refused by, so the separation is no longer a
 * requirement — but the import stays, and stays used by `lib/auth.ts` alone.
 * It marks where the application deliberately reads across tenants, in one
 * greppable place, and it means a deployment that does grant identity its
 * own credentials only has to set the variable.
 *
 * Built LAZILY, on first use rather than on import. `next build` imports
 * every page to collect its configuration, so constructing this at module
 * scope made the build itself require the connection string — and fail with
 * `Invalid value undefined for datasource "db"`, an error naming neither the
 * variable nor the file. A build has no business needing database
 * credentials; only a request does.
 */
function createAuthClient(): PrismaClient {
  const url = process.env.AUTH_DATABASE_URL;

  // Falling back to the main connection is correct here and was not before.
  // Under PostgreSQL this fallback would have sent login to a connection the
  // policies denied, reporting "wrong password" for a correct one — a
  // misconfiguration wearing the costume of a rejected sign-in. With no
  // policies, the two connections differ only in credentials, so a single
  // DATABASE_URL is a complete configuration rather than a broken one.
  if (!url) return base;

  return new PrismaClient({ datasources: { db: { url } }, log: ['error'] });
}

let authClient: PrismaClient | undefined;

export const authDb = new Proxy({} as PrismaClient, {
  get(_target, property) {
    authClient ??= globalForPrisma.prismaAuth ?? createAuthClient();
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaAuth = authClient;
    return Reflect.get(authClient, property, authClient);
  },
});
