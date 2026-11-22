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
  fifoCostLayers: {
    name: '20261122120000_fifo_cost_layers',
    checksum: '8cd9f00c1be2183552ed7aed88daedba595f511bf1ba211614d81a621ea4741a',
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

    // دفعات البضاعة بأسعارها — البيع يأخذ من الأقدم أولاً (lib/fifo).
    let fifoDone = false;
    if (!(await hasColumn('InvoiceLine', 'unitCost'))) {
      await prisma.$executeRawUnsafe('ALTER TABLE `InvoiceLine` ADD COLUMN `unitCost` DECIMAL(19, 4) NULL');
      // تجميد ربح الماضي: كل سطر قديم يأخذ تكلفته الحالية مرةً واحدة، فلا يتغيّر بعدها.
      await prisma.$executeRawUnsafe(
        "UPDATE `InvoiceLine` l LEFT JOIN `ProductVariant` v ON v.`id` = l.`variantId` LEFT JOIN `Product` p ON p.`id` = l.`productId` " +
          "SET l.`unitCost` = COALESCE(NULLIF(v.`cost`, 0), NULLIF(p.`cost`, 0), p.`dozenCost` / NULLIF(p.`piecesPerDozen`, 0)) WHERE l.`productId` IS NOT NULL AND l.`description` NOT LIKE '🚚%'",
      );
      fifoDone = true;
    }
    if (!(await hasTable('CostLayer'))) {
      await prisma.$executeRawUnsafe(`CREATE TABLE \`CostLayer\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`tenantId\` VARCHAR(191) NOT NULL,
        \`productId\` VARCHAR(191) NOT NULL,
        \`colorId\` VARCHAR(191) NULL,
        \`receivedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`quantity\` DECIMAL(19, 4) NOT NULL,
        \`remaining\` DECIMAL(19, 4) NOT NULL,
        \`unitCost\` DECIMAL(19, 4) NOT NULL,
        \`note\` VARCHAR(191) NULL,
        \`userId\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`CostLayer_tenantId_productId_colorId_receivedAt_idx\`(\`tenantId\`, \`productId\`, \`colorId\`, \`receivedAt\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      // رصيدٌ افتتاحي: ما على الرف الآن دفعةٌ أولى بتكلفته الحالية، لكل موديل ولون.
      await prisma.$executeRawUnsafe(
        "INSERT INTO `CostLayer` (`id`, `tenantId`, `productId`, `colorId`, `receivedAt`, `quantity`, `remaining`, `unitCost`, `note`, `createdAt`) " +
          "SELECT UUID(), p.`tenantId`, p.`id`, v.`colorId`, NOW(3), SUM(s.`onHand`), SUM(s.`onHand`), " +
          "COALESCE(NULLIF(MAX(v.`cost`), 0), NULLIF(p.`cost`, 0), p.`dozenCost` / NULLIF(p.`piecesPerDozen`, 0)), 'رصيد افتتاحي', NOW(3) " +
          "FROM `Stock` s JOIN `ProductVariant` v ON v.`id` = s.`variantId` JOIN `Product` p ON p.`id` = v.`productId` " +
          "WHERE p.`isDeleted` = 0 AND v.`isDeleted` = 0 " +
          "GROUP BY p.`tenantId`, p.`id`, v.`colorId`, p.`cost`, p.`dozenCost`, p.`piecesPerDozen` " +
          "HAVING SUM(s.`onHand`) > 0 AND COALESCE(NULLIF(MAX(v.`cost`), 0), NULLIF(p.`cost`, 0), p.`dozenCost` / NULLIF(p.`piecesPerDozen`, 0)) > 0",
      );
      fifoDone = true;
    }
    if (!(await hasTable('CostLayerUse'))) {
      await prisma.$executeRawUnsafe(`CREATE TABLE \`CostLayerUse\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`layerId\` VARCHAR(191) NOT NULL,
        \`invoiceId\` VARCHAR(191) NOT NULL,
        \`quantity\` DECIMAL(19, 4) NOT NULL,
        \`unitCost\` DECIMAL(19, 4) NOT NULL,
        INDEX \`CostLayerUse_invoiceId_idx\`(\`invoiceId\`),
        INDEX \`CostLayerUse_layerId_idx\`(\`layerId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      fifoDone = true;
    }
    if (fifoDone) {
      done.push('دفعات أسعار البضاعة (الأقدم أولاً)');
      await recordMigration(MIGRATIONS.fifoCostLayers);
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
