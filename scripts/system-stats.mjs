/**
 * Real counts from the live database, for the status report.
 *
 * No estimates and no rounding — whatever is actually there.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MAINTENANCE_DATABASE_URL } },
});

async function main() {
  const rows = {
    'المستأجرون': await prisma.tenant.count(),
    'المستخدمون': await prisma.user.count(),
    'الأدوار': await prisma.role.count(),
    'الصلاحيات': await prisma.permission.count(),
    'منح الصلاحيات': await prisma.rolePermission.count(),
    'التصنيفات': await prisma.category.count(),
    'المنتجات': await prisma.product.count(),
    'المتغيّرات': await prisma.productVariant.count(),
    'صور المنتجات': await prisma.productImage.count(),
    'الألوان': await prisma.color.count(),
    'المقاسات': await prisma.size.count(),
    'الخامات': await prisma.material.count(),
    'المخازن': await prisma.warehouse.count(),
    'مواقع التخزين': await prisma.warehouseLocation.count(),
    'أرصدة المخزون': await prisma.stock.count(),
    'حركات المخزون': await prisma.stockMovement.count(),
    'العملاء': await prisma.customer.count(),
    'أنشطة العملاء': await prisma.customerActivity.count(),
    'الموردون': await prisma.supplier.count(),
    'عروض الأسعار': await prisma.quotation.count(),
    'بنود العروض': await prisma.quotationLine.count(),
    'أوامر البيع': await prisma.salesOrder.count(),
    'بنود أوامر البيع': await prisma.salesOrderLine.count(),
    'أوامر الإنتاج': await prisma.productionOrder.count(),
    'خطوات التشغيل': await prisma.workOrder.count(),
    'المعادلات': await prisma.formula.count(),
    'إصدارات المعادلات': await prisma.formulaVersion.count(),
    'بنود المعادلات': await prisma.formulaLine.count(),
    'ربط المعادلات بالمنتجات': await prisma.productFormula.count(),
    'حسابات التكلفة': await prisma.costCalculation.count(),
    'بنود حسابات التكلفة': await prisma.costCalculationLine.count(),
    'المصروفات الثانوية': await prisma.secondaryExpense.count(),
    'محاضر الهالك': await prisma.damageRecord.count(),
    'الجزاءات': await prisma.penalty.count(),
    'المستلزمات': await prisma.supply.count(),
    'حركات المستلزمات': await prisma.supplyTransaction.count(),
    'سجل التدقيق': await prisma.auditLog.count(),
  };

  const total = Object.values(rows).reduce((a, b) => a + b, 0);

  const tables = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'`,
  );
  const rls = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
  );

  console.log('| البند | العدد |');
  console.log('|---|---|');
  for (const [k, v] of Object.entries(rows)) console.log(`| ${k} | ${v} |`);
  console.log(`\nإجمالي الصفوف المحسوبة: ${total}`);
  console.log(`جداول قاعدة البيانات: ${tables[0].n}`);
  console.log(`جداول عليها RLS: ${rls[0].n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
