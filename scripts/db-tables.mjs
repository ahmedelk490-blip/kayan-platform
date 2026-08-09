import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  // Tooling spans tenants, so it uses the maintenance connection. The
  // application role deliberately cannot see anything without a tenant.
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});
const rows = await prisma.$queryRawUnsafe(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log(`tables: ${rows.length}`);
console.log(rows.map((r) => `  ${r.name}`).join('\n'));
await prisma.$disconnect();
