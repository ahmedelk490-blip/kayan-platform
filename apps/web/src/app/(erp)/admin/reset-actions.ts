'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/guard';
import { prisma, tenantTransaction } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { runBackup } from '@/lib/backup';
import { RESET_GROUPS, type ResetCounts, type ResetState } from './reset-groups';

/**
 * تصفير بيانات التشغيل — البدء من جديد بعد التجربة.
 *
 * المنتجات وأسعارها وألوانها ومقاساتها ومعادلاتها **محميّة دائماً**: لا مجموعة
 * هنا تمسّها، فالكتالوج الذي بُني بالتعب يبقى كما هو مهما اختير.
 *
 * كل مجموعة تُمسح باختيار صريح من المستخدم لا بتخمين منّي، ولا شيء يُمسح قبل
 * نسخة احتياطية كاملة تُؤخذ في نفس اللحظة — فالتراجع ممكن دائماً باستعادتها.
 */

/** أعداد الصفوف لكل مجموعة — تُعرض جنب كل بند فيرى المالك ما سيفقده بالضبط. */
export async function resetCounts(): Promise<ResetCounts> {
  const user = await requirePermission('admin.view');
  const t = { tenantId: user.tenantId };

  const [
    invoices, quotations, orders, returns, webOrders,
    purchases, receipts,
    expenses, salaries, penalties,
    damage, production, work,
    movements, stock, supplyTx,
    customers, suppliers,
    auditLogs,
    products, variants, tiers,
  ] = await Promise.all([
    prisma.invoice.count({ where: t }),
    prisma.quotation.count({ where: t }),
    prisma.salesOrder.count({ where: t }),
    prisma.salesReturn.count({ where: t }),
    prisma.webOrder.count({ where: t }),
    prisma.purchaseOrder.count({ where: t }),
    prisma.goodsReceipt.count({ where: t }),
    prisma.secondaryExpense.count({ where: t }),
    prisma.employeePayment.count({ where: t }),
    prisma.penalty.count({ where: t }),
    prisma.damageRecord.count({ where: t }),
    prisma.productionOrder.count({ where: t }),
    prisma.workOrder.count({ where: { productionOrder: { tenantId: user.tenantId } } }),
    prisma.stockMovement.count({ where: t }),
    prisma.stock.count({ where: { variant: { product: { tenantId: user.tenantId } } } }),
    prisma.supplyTransaction.count({ where: t }),
    prisma.customer.count({ where: t }),
    prisma.supplier.count({ where: t }),
    prisma.auditLog.count({ where: t }),
    prisma.product.count({ where: t }),
    prisma.productVariant.count({ where: { product: { tenantId: user.tenantId } } }),
    prisma.priceTier.count({ where: t }),
  ]);

  return {
    sales: invoices + quotations + orders + returns + webOrders,
    purchasing: purchases + receipts,
    expenses: expenses + salaries + penalties,
    damage,
    production: production + work,
    movements,
    stock,
    supplies: supplyTx,
    customers,
    suppliers,
    audit: auditLogs,
    // المحميّ — يُعرض طمأنةً لا خياراً.
    products: products + variants + tiers,
  };
}

/**
 * تنفيذ التصفير.
 *
 * الحذف بترتيب المفاتيح الأجنبية (الأبناء قبل الآباء) داخل معاملة واحدة: إمّا
 * أن يتم كله أو لا شيء — لا قاعدة نصفها ممسوح إن انقطع الاتصال في المنتصف.
 */
export async function resetData(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const user = await requirePermission('admin.view');
  const tenantId = user.tenantId;

  // كلمة تأكيد مكتوبة بخط اليد — ضغطة خاطئة وحدها لا تمسح قاعدة بيانات.
  const confirm = String(formData.get('confirm') ?? '').trim();
  if (confirm !== 'تصفير') {
    return { error: 'اكتب كلمة «تصفير» في خانة التأكيد لتنفيذ العملية.' };
  }

  const picked = new Set(
    RESET_GROUPS.map((g) => g.key).filter((k) => formData.get(`g_${k}`) === 'on'),
  );
  if (picked.size === 0) return { error: 'اختر مجموعة واحدة على الأقل للمسح.' };

  // العميل لا يُحذف وفواتيره قائمة (مفتاح أجنبي)، وكذلك المورّد ومشترياته.
  if (picked.has('customers') && !picked.has('sales')) {
    return { error: 'لا يمكن مسح العملاء وفواتيرهم قائمة — اختر «المبيعات» معهم.' };
  }
  if (picked.has('suppliers') && !picked.has('purchasing')) {
    return { error: 'لا يمكن مسح المورّدين ومشترياتهم قائمة — اختر «المشتريات» معهم.' };
  }

  // نسخة احتياطية كاملة قبل أول عملية حذف — صمام التراجع الوحيد.
  let backupNote = '';
  try {
    const b = await runBackup();
    backupNote = `نسخة احتياطية: ${b.file} (${b.tables} جدول · ${b.rows} صف).`;
  } catch (e) {
    return {
      error: `تعذّرت النسخة الاحتياطية فأُلغيت العملية — لا مسح بلا نسخة. (${e instanceof Error ? e.message : 'خطأ غير معروف'})`,
    };
  }

  const done: string[] = [];

  try {
    // سقف Prisma الافتراضي للمعاملة خمس ثوانٍ — لا يكفي لمسح آلاف الصفوف عبر
    // عشرين جدولاً، فكانت العملية تتراجع كلها برسالة مبهمة. دقيقتان هنا آمنتان:
    // المسح يجري مرةً في عمر النظام ولا يزاحم بيعاً يومياً.
    await tenantTransaction(async (tx) => {
      const byTenant = { tenantId };

      if (picked.has('sales')) {
        // الدفعات أولاً: العاكسة قبل أصولها (reversesId يشير لدفعة أخرى).
        await tx.payment.deleteMany({ where: { tenantId, reversesId: { not: null } } });
        await tx.payment.deleteMany({ where: byTenant });
        await tx.salesReturnLine.deleteMany({ where: { salesReturn: { tenantId } } });
        await tx.salesReturn.deleteMany({ where: byTenant });
        await tx.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
        await tx.invoice.deleteMany({ where: byTenant });
        await tx.webOrderLine.deleteMany({ where: { webOrder: { tenantId } } });
        await tx.webOrder.deleteMany({ where: byTenant });
        done.push('المبيعات');
      }

      // أمر الإنتاج معلَّق بأمر البيع وبالعميل بمفتاح أجنبي مانع، فمسح أيٍّ
      // منهما يُلزم مسحه أولاً — وإلا رفضت القاعدة العملية كلها.
      if (picked.has('production') || picked.has('sales') || picked.has('customers')) {
        await tx.productionOrderAssignee.deleteMany({ where: { productionOrder: { tenantId } } });
        await tx.workOrder.deleteMany({ where: { productionOrder: { tenantId } } });
        await tx.productionOrder.deleteMany({ where: byTenant });
        if (picked.has('production')) done.push('الإنتاج');
      }

      if (picked.has('sales')) {
        // أوامر البيع وعروض السعر بعد الفواتير والإنتاج المعلّقَين عليها.
        await tx.costCalculation.deleteMany({ where: byTenant });
        await tx.salesOrderLine.deleteMany({ where: { salesOrder: { tenantId } } });
        await tx.salesOrder.deleteMany({ where: byTenant });
        await tx.quotationLine.deleteMany({ where: { quotation: { tenantId } } });
        await tx.quotation.deleteMany({ where: byTenant });
      }

      if (picked.has('purchasing')) {
        await tx.goodsReceiptLine.deleteMany({ where: { goodsReceipt: { tenantId } } });
        await tx.goodsReceipt.deleteMany({ where: byTenant });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrder.deleteMany({ where: byTenant });
        done.push('المشتريات');
      }

      // الجزاءات قبل الهالك: الجزاء يشير لسجل الهالك الذي وُلِد منه.
      if (picked.has('expenses') || picked.has('damage')) {
        await tx.penaltyEvent.deleteMany({ where: { penalty: { tenantId } } });
        await tx.penalty.deleteMany({ where: byTenant });
      }

      if (picked.has('damage')) {
        await tx.damageRecord.deleteMany({ where: byTenant });
        done.push('الهالك');
      }

      if (picked.has('expenses')) {
        await tx.secondaryExpense.deleteMany({ where: byTenant });
        await tx.employeePayment.deleteMany({ where: byTenant });
        done.push('المصروفات والرواتب');
      }

      if (picked.has('movements')) {
        await tx.stockMovement.deleteMany({ where: byTenant });
        done.push('حركة المخزون');
      }

      // المستلزمات: الحركات ورصيدها يُصفَّران معاً — onHand رصيدٌ جارٍ مشتقٌّ من
      // الحركات، فمسح الحركات وحدها يترك رصيداً لا سند له في السجل.
      if (picked.has('supplies')) {
        await tx.supplyTransaction.deleteMany({ where: byTenant });
        await tx.supply.updateMany({
          where: byTenant,
          data: { onHand: '0', avgCost: '0', lastUnitCost: null },
        });
        done.push('مخزون المستلزمات');
      }

      if (picked.has('stock')) {
        // الأرصدة تُصفَّر لا تُحذف: صف المخزون يربط المتغيّر بالمخزن ويُعاد ملؤه.
        await tx.stock.updateMany({
          where: { variant: { product: { tenantId } } },
          data: { onHand: '0', reserved: '0', damaged: '0' },
        });
        done.push('أرصدة المخزون');
      }

      if (picked.has('customers')) {
        await tx.customerActivity.deleteMany({ where: { customer: { tenantId } } });
        await tx.customer.deleteMany({ where: byTenant });
        done.push('العملاء');
      }

      if (picked.has('suppliers')) {
        await tx.supplierProduct.deleteMany({ where: { supplier: { tenantId } } });
        await tx.supplier.deleteMany({ where: byTenant });
        done.push('المورّدون');
      }

      // عدّادات الترقيم تعود للصفر فتبدأ الفاتورة القادمة من ١ — ترقيم نظيف
      // لبداية جديدة بدل أن يكمل من أرقام التجربة.
      if (picked.has('sales') || picked.has('purchasing')) {
        await tx.documentSequence.deleteMany({ where: byTenant });
      }

      if (picked.has('audit')) {
        await tx.auditLog.deleteMany({ where: byTenant });
        await tx.session.deleteMany({
          where: { user: { tenantId }, OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }] },
        });
        done.push('سجل التدقيق');
      }
    }, { timeout: 120_000, maxWait: 15_000 });
  } catch (e) {
    return {
      error: `فشل المسح فتراجعت العملية بالكامل — لم تُمسّ أي بيانات. (${e instanceof Error ? e.message : 'خطأ غير معروف'}) ${backupNote}`,
    };
  }

  // سجل التدقيق يُكتب بعد المسح لا قبله، وإلا مسح نفسه مع المجموعة.
  await audit({
    tenantId,
    userId: user.id,
    action: 'data.reset',
    entityType: 'Tenant',
    entityId: tenantId,
    detail: `تصفير: ${done.join('، ')} — ${backupNote}`,
  });

  for (const p of ['/', '/dashboard', '/invoices', '/customers', '/inventory', '/expenses', '/returns', '/purchasing', '/reports/daily', '/reports/financial', '/admin']) {
    revalidatePath(p);
  }

  return {
    ok: `تم التصفير: ${done.join('، ')}. المنتجات وأسعارها لم تُمسّ. ${backupNote}`,
  };
}
