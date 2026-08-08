import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const rows = await prisma.$queryRawUnsafe(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log(`tables: ${rows.length}`);
console.log(rows.map((r) => `  ${r.name}`).join('\n'));
await prisma.$disconnect();
