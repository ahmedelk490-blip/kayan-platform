/**
 * Seed — roles, permissions, and one user per role.
 *
 * Idempotent: safe to re-run. Uses upsert throughout so it never duplicates
 * and never destroys existing data.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '../packages/domain/src/rbac.ts';

const prisma = new PrismaClient({
  // Tooling spans tenants, so it uses the maintenance connection. The
  // application role deliberately cannot see anything without a tenant.
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/** Development credentials. Printed at the end so they are never a mystery. */
const USERS = [
  { email: 'admin@kayan.eg', name: 'System Administrator', nameAr: 'مدير النظام', role: 'ADMIN' },
  { email: 'manager@kayan.eg', name: 'Factory Manager', nameAr: 'مدير المصنع', role: 'MANAGER' },
  { email: 'sales@kayan.eg', name: 'Sales Representative', nameAr: 'مندوب المبيعات', role: 'SALES' },
  { email: 'customer@kayan.eg', name: 'Customer Account', nameAr: 'حساب عميل', role: 'CUSTOMER' },
];

const DEV_PASSWORD = 'Kayan#2026';

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: 'kayan' },
    update: {},
    create: { id: 'kayan', name: 'KAYAN' },
  });

  await prisma.company.upsert({
    where: { id: 'kayan-main' },
    update: {},
    create: {
      id: 'kayan-main',
      tenantId: tenant.id,
      name: 'KAYAN',
      nameAr: 'كيان',
      currency: 'EGP',
    },
  });

  // Permissions
  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { nameAr: meta.nameAr, group: meta.group },
      create: { key, nameAr: meta.nameAr, group: meta.group },
    });
  }

  // Roles + their permission grants
  for (const definition of Object.values(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key: definition.key },
      update: {
        name: definition.name,
        nameAr: definition.nameAr,
        landingPath: definition.landingPath,
      },
      create: {
        key: definition.key,
        name: definition.name,
        nameAr: definition.nameAr,
        landingPath: definition.landingPath,
      },
    });

    // Rebuild grants so the matrix in code is always the source of truth.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const keys = ROLE_PERMISSIONS[definition.key];
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });

    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
  }

  // Drop permissions the code no longer defines. Phase 5 renamed
  // `manufacturing.read` to `.view`; without this the old key would linger in
  // the database, granted to nobody, and the two would look like real but
  // different permissions to anyone reading the table.
  //
  // Safe here because the loop above has just rebuilt every grant from the
  // matrix in code, so no RolePermission row still points at a stale key.
  const removed = await prisma.permission.deleteMany({
    where: { key: { notIn: Object.keys(PERMISSIONS) } },
  });
  if (removed.count > 0) console.log(`pruned ${removed.count} stale permission(s)`);

  // Users
  const passwordHash = await hash(DEV_PASSWORD, ARGON2_OPTIONS);

  for (const entry of USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: entry.role } });
    await prisma.user.upsert({
      where: { email: entry.email },
      update: { name: entry.name, nameAr: entry.nameAr, roleId: role.id, isActive: true },
      create: {
        tenantId: tenant.id,
        email: entry.email,
        passwordHash,
        name: entry.name,
        nameAr: entry.nameAr,
        roleId: role.id,
      },
    });
  }

  const counts = {
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    grants: await prisma.rolePermission.count(),
    users: await prisma.user.count(),
  };

  console.log('seeded:', counts);
  console.log(`\ndev credentials — password for all accounts: ${DEV_PASSWORD}`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(9)} ${u.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
