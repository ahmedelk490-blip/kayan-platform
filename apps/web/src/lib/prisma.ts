import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * Next.js dev reloads modules on every edit; without the global cache each
 * reload opens a new connection pool until the database refuses more.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
