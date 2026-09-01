import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { loadSalesOptions } from '@/app/(erp)/sales/options';
import { CashierBoard } from './CashierBoard';

export const metadata: Metadata = { title: 'الكاشير' };

/**
 * لوحة الكاشير — بيع سريع بكروت منتجات مصوّرة.
 *
 * الكاشير يضغط صورة المنتج، يختار اللون والمقاس والكمية، فتُبنى الفاتورة على
 * اليسار. «بيع وتحصيل» يُصدرها ويحصّلها ويصرف البضاعة من المخزن — فتظهر في
 * المخزون وعند المدير فوراً.
 */
export default async function CashierPage() {
  const user = await requirePermission('invoices.write');
  const [options, productImages, warehouse] = await Promise.all([
    loadSalesOptions(user.tenantId),
    prisma.product.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'ACTIVE' },
      select: { id: true, images: { where: { isPrimary: true }, take: 1, select: { path: true } } },
    }),
    prisma.warehouse.findFirst({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: { code: 'asc' },
      select: { id: true, nameAr: true },
    }),
  ]);

  const images: Record<string, string | null> = {};
  for (const p of productImages) images[p.id] = p.images[0]?.path ?? null;

  return (
    <AppShell user={user} title="الكاشير">
      <ModuleHeader
        title="لوحة الكاشير"
        action={<Link href="/invoices" className="erp-btn-ghost">الفواتير</Link>}
      />
      {!warehouse ? (
        <div className="erp-card p-8 text-center">
          <p className="text-sm text-txt-2">لا يوجد مخزن لصرف البضاعة منه.</p>
          <p className="mt-2 text-xs text-txt-4">أنشئ مخزناً أولاً حتى يخصم بيع الكاشير من المخزون.</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-txt-3">
            الأسرع: اكتب اسم الصنف في «إضافة سريعة» وحدّد الكمية والسعر — أو اضغط صورة
            المنتج (بلون واحد يُضاف فوراً، وبألوان تفتح الاختيار). للعميل الجديد: زر
            «+ عميل جديد بسرعة» — اسم وموبايل فقط. يُصرف من مخزن «{warehouse.nameAr}»
            وتظهر البيعة في المخزون وعند المدير فوراً.
          </p>
          <CashierBoard
            customers={options.customers}
            variants={options.variants}
            debts={options.debts}
            images={images}
            warehouseId={warehouse.id}
          />
        </>
      )}
    </AppShell>
  );
}
