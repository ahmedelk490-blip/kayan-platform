'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';

export interface SchemaState {
  ok?: string;
  error?: string;
}

/**
 * تطبيق بنية قاعدة البيانات الناقصة — بزرٍّ لا بسطر أوامر.
 *
 * ── لماذا هنا أصلاً ────────────────────────────────────────
 *
 * خطّ النشر على الاستضافة يشغّل `npm run build` وحده، ولا يشغّل
 * `prisma migrate deploy`. فكودٌ يعتمد جدولاً جديداً يصل الخادم قبل جدوله
 * ويسقط عند أوّل استعمال. وصاحب النظام لا يفتح SSH.
 *
 * فتُطبَّق البنية من لوحة النظام: تُفحص `information_schema` أوّلاً، ولا
 * يُنفَّذ إلا الناقص. آمنٌ للتكرار — الضغطة الثانية لا تفعل شيئاً.
 *
 * ── ولماذا يُقيَّد في دفتر الترحيلات ────────────────────────
 *
 * لأن من يشغّل `prisma migrate deploy` يوماً ما سيجد الجدول موجوداً ويقف.
 * فيُكتب صفّ الترحيل ببصمته الحقيقية (SHA-256 لمحتوى migration.sql)
 * فيتخطّاه بريزما كما لو طبّقه بنفسه.
 */

/** بصمات ملفات الترحيل — SHA-256 لمحتوى migration.sql، كما تحسبها بريزما. */
const MIGRATIONS = {
  supplierPayments: {
    name: '20260927120000_supplier_payments',
    checksum: 'cc967ee58a8ff708c88a76cb158625501db9140ef74456c667690fcc632f9201',
  },
  penaltyInstallments: {
    name: '20260927140000_penalty_installments',
    checksum: '10f1bce2410739a5cac884760b33a2c3a6efc6e65d9ebe1141666432e79ae30c',
  },
} as const;

/** يُقيَّد الترحيل في دفتر بريزما فلا يصطدم به `migrate deploy` لاحقاً. */
async function recordMigration(m: { name: string; checksum: string }): Promise<void> {
  if (!(await hasTable('_prisma_migrations'))) return;
  const seen = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    'SELECT COUNT(*) AS n FROM `_prisma_migrations` WHERE `migration_name` = ?',
    m.name,
  );
  if (Number(seen[0]?.n ?? 0) > 0) return;
  await prisma.$executeRawUnsafe(
    'INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`) VALUES (UUID(), ?, NOW(3), ?, NULL, NULL, NOW(3), 1)',
    m.checksum,
    m.name,
  );
}

async function hasTable(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    name,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    table,
    column,
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function applyPendingSchema(): Promise<SchemaState> {
  const user = await requirePermission('admin.view');
  const done: string[] = [];

  try {
    if (!(await hasColumn('PurchaseOrder', 'paidAmount'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `PurchaseOrder` ADD COLUMN `paidAmount` DECIMAL(19,4) NOT NULL DEFAULT 0',
      );
      done.push('عمود «المدفوع» على أوامر الشراء');
    }

    if (!(await hasTable('SupplierPayment'))) {
      await prisma.$executeRawUnsafe(`CREATE TABLE \`SupplierPayment\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`tenantId\` VARCHAR(191) NOT NULL,
        \`number\` VARCHAR(191) NOT NULL,
        \`supplierId\` VARCHAR(191) NOT NULL,
        \`purchaseOrderId\` VARCHAR(191) NULL,
        \`amount\` DECIMAL(19,4) NOT NULL,
        \`method\` VARCHAR(191) NOT NULL DEFAULT 'CASH',
        \`paidAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`reference\` VARCHAR(191) NULL,
        \`notes\` VARCHAR(191) NULL,
        \`reversesId\` VARCHAR(191) NULL,
        \`recordedById\` VARCHAR(191) NULL,
        \`isDeleted\` BOOLEAN NOT NULL DEFAULT false,
        \`deletedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        UNIQUE INDEX \`SupplierPayment_reversesId_key\`(\`reversesId\`),
        UNIQUE INDEX \`SupplierPayment_tenantId_number_key\`(\`tenantId\`, \`number\`),
        INDEX \`SupplierPayment_tenantId_isDeleted_idx\`(\`tenantId\`, \`isDeleted\`),
        INDEX \`SupplierPayment_supplierId_idx\`(\`supplierId\`),
        INDEX \`SupplierPayment_purchaseOrderId_idx\`(\`purchaseOrderId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

      for (const fk of [
        'ADD CONSTRAINT `SupplierPayment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
        'ADD CONSTRAINT `SupplierPayment_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
        'ADD CONSTRAINT `SupplierPayment_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
        'ADD CONSTRAINT `SupplierPayment_reversesId_fkey` FOREIGN KEY (`reversesId`) REFERENCES `SupplierPayment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
        'ADD CONSTRAINT `SupplierPayment_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
      ]) {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`SupplierPayment\` ${fk}`);
      }
      done.push('جدول دفعات الموردين');
    }
    if (done.length > 0) await recordMigration(MIGRATIONS.supplierPayments);

    // تقسيط الجزاء — عمودان على Penalty.
    let penaltyDone = false;
    if (!(await hasColumn('Penalty', 'installments'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `Penalty` ADD COLUMN `installments` INTEGER NOT NULL DEFAULT 1',
      );
      penaltyDone = true;
    }
    if (!(await hasColumn('Penalty', 'collectedAmount'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `Penalty` ADD COLUMN `collectedAmount` DECIMAL(19,4) NOT NULL DEFAULT 0',
      );
      penaltyDone = true;
    }
    if (penaltyDone) {
      done.push('تقسيط الجزاءات');
      await recordMigration(MIGRATIONS.penaltyInstallments);
    }

  } catch (err) {
    return {
      error: `تعذّر التطبيق: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`,
    };
  }

  if (done.length === 0) return { ok: 'البنية محدَّثة — لا شيء ناقص.' };

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'schema.apply',
    entityType: 'Database',
    entityId: user.tenantId,
    detail: done.join('، '),
  });

  revalidatePath('/purchasing');
  revalidatePath('/admin');
  return { ok: `طُبِّق: ${done.join('، ')}.` };
}
