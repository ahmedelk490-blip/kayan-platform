import type { Metadata } from 'next';
import {
  can,
  dec,
  formatMoney,
  balance,
  available,
  RECEIVABLE_STATUSES,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { WelcomeHeader } from '@/components/dashboard/WelcomeHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { Donut } from '@/components/dashboard/Donut';
import { QuickActions, type QuickAction } from '@/components/dashboard/QuickActions';
import { IconProduct, IconUsers, IconBell, IconCategory } from '@/components/dashboard/Icons';

export const metadata: Metadata = { title: 'لوحة المدير' };

/**
 * لوحة المدير — شاشة واحدة تُقرأ بنظرة.
 *
 * كانت صفحة طويلة من القوائم (حالات العروض، التصنيع، المستلزمات، النشاطات،
 * أحدث المنتجات…) فصارت مملّة ولا تُقرأ. بطلب المالك: **لا قوائم إطلاقاً** —
 * هيرو بنبض اليوم، بلاطات الشغل، صفُّ أرقامٍ حاسمة، وثلاث دوائر مؤشرات.
 * التفاصيل كلها خلف ضغطة: اليومية والتقارير وصفحات الوحدات.
 *
 * Every figure is a live count or sum. Nothing is estimated or projected,
 * and sections stay gated on the same permissions as the modules they
 * summarise.
 */
export default async function ManagerDashboard() {
  const user = await requirePermission('dashboard.view');
  const tenantId = user.tenantId;

  const seeSales = can(user.role, 'sales.documents');
  const seeInventory = can(user.role, 'inventory.read');
  const seeCustomers = can(user.role, 'customers.read');
  const seeMoney = can(user.role, 'invoices.view');
  const canSell = can(user.role, 'invoices.write');

  // نبض اليوم بتوقيت بغداد — أول ما يهم المدير صباحاً.
  const dayStart = (() => {
    const ref = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()) - 3 * 60 * 60 * 1000);
  })();

  const [invoiceRows, stockRows, customerCount, orderRows, quotationCount, todayInv, todayPay] =
    await Promise.all([
      seeMoney
        ? prisma.invoice.findMany({
            where: { tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
            select: { total: true, paidAmount: true, status: true },
          })
        : [],
      seeInventory
        ? prisma.stock.findMany({
            where: { warehouse: { tenantId, isDeleted: false } },
            select: { onHand: true, reserved: true, minStock: true },
          })
        : [],
      seeCustomers ? prisma.customer.count({ where: { tenantId, isDeleted: false } }) : 0,
      seeSales
        ? prisma.salesOrder.groupBy({
            by: ['status'],
            where: { tenantId, isDeleted: false },
            _count: { _all: true },
          })
        : [],
      seeSales ? prisma.quotation.count({ where: { tenantId, isDeleted: false } }) : 0,
      seeMoney
        ? prisma.invoice.aggregate({
            where: {
              tenantId,
              isDeleted: false,
              status: { notIn: ['DRAFT', 'VOID'] },
              issueDate: { gte: dayStart },
            },
            _sum: { total: true },
            _count: true,
          })
        : null,
      seeMoney
        ? prisma.payment.aggregate({
            where: { tenantId, paidAt: { gte: dayStart } },
            _sum: { amount: true },
          })
        : null,
    ]);

  // ── المال ─────────────────────────────────────────────────
  const invoiced = invoiceRows.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoiceRows.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = invoiceRows
    .filter((i) => RECEIVABLE_STATUSES.includes(i.status as never))
    .reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));

  // ── المخزون ───────────────────────────────────────────────
  const onHand = stockRows.reduce((s, r) => s.plus(dec(r.onHand)), dec(0));
  const reserved = stockRows.reduce((s, r) => s.plus(dec(r.reserved)), dec(0));
  const availableStock = stockRows.reduce(
    (s, r) => s.plus(available(r.onHand, r.reserved)),
    dec(0),
  );
  const lowStock = stockRows.filter(
    (r) => dec(r.minStock).gt(0) && available(r.onHand, r.reserved).lt(dec(r.minStock)),
  ).length;
  const outOfStock = stockRows.filter((r) => dec(r.onHand).lte(0)).length;

  // ── الأوامر ───────────────────────────────────────────────
  const orderTotal = orderRows.reduce((s, r) => s + r._count._all, 0);
  const delivered = orderRows
    .filter((r) => r.status === 'DELIVERED' || r.status === 'COMPLETED')
    .reduce((s, r) => s + r._count._all, 0);

  const today =
    todayInv && todayPay
      ? {
          sales: formatMoney(dec(todayInv._sum.total ?? 0)),
          collected: formatMoney(dec(todayPay._sum.amount ?? 0)),
          invoices: todayInv._count,
        }
      : undefined;

  // شغل اليوم — بلاطات ملوّنة، كل فعل بلون هويته.
  const actions: QuickAction[] = [
    { href: '/cashier', label: 'الكاشير', description: 'بيع سريع — صور أو كتابة', available: canSell, emoji: '🛒', gradient: 'from-emerald-500 to-teal-700' },
    { href: '/invoices/new', label: 'فاتورة جديدة', description: 'عميل وأصناف وإصدار فوري', available: canSell, emoji: '🧾', gradient: 'from-[#7d3349] to-[#5c2535]' },
    { href: '/returns/new', label: 'مرتجع جديد', description: 'إرجاع من فاتورة', available: can(user.role, 'returns.write'), emoji: '↩️', gradient: 'from-amber-500 to-orange-600' },
    { href: '/reports/daily', label: 'يومية اليوم', description: 'مبيعات ومقبوض ومصاريف', available: can(user.role, 'reports.view'), emoji: '📊', gradient: 'from-sky-500 to-blue-700' },
    { href: '/inventory', label: 'المخزون', description: lowStock > 0 ? `${lowStock} صنف تحت الحد` : 'كل الأصناف فوق الحد', available: seeInventory, emoji: '📦', gradient: 'from-violet-500 to-purple-700' },
    { href: '/reports', label: 'التقارير', description: 'كل الأرقام بالتفصيل', available: can(user.role, 'reports.view'), emoji: '📈', gradient: 'from-slate-500 to-slate-700' },
  ];

  return (
    <AppShell user={user} title="لوحة المدير">
      <div className="space-y-6">
        <WelcomeHeader name={user.nameAr ?? user.name} roleAr={user.roleNameAr} today={today} />

        <QuickActions actions={actions} />

        {/* الأرقام الأربعة الحاسمة — لا أكثر. التفاصيل في التقارير. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {seeMoney && (
            <StatCard
              index={0}
              label="مستحقات عند العملاء"
              value={formatMoney(outstanding)}
              hint="اضغط الجرس لقائمة المتأخر"
              icon={<IconBell />}
              tone={dec(outstanding).gt(0) ? 'warning' : 'success'}
            />
          )}
          {seeMoney && (
            <StatCard
              index={1}
              label="المحصَّل الكلي"
              value={formatMoney(collected)}
              hint={`من ${formatMoney(invoiced)} مفوتر`}
              icon={<IconCategory />}
              tone="success"
            />
          )}
          {seeInventory && (
            <StatCard
              index={2}
              label="رصيد المخزون"
              value={Number(onHand)}
              unit="قطعة"
              hint={outOfStock > 0 ? `${outOfStock} صنف نافذ — افتح المخزون` : 'لا أصناف نافذة'}
              icon={<IconProduct />}
              tone={outOfStock > 0 ? 'warning' : 'primary'}
            />
          )}
          {seeCustomers && (
            <StatCard
              index={3}
              label="العملاء"
              value={customerCount}
              unit="عميل"
              hint={seeSales ? `${quotationCount} عرض سعر مسجّل` : undefined}
              icon={<IconUsers />}
              tone="neutral"
            />
          )}
        </div>

        {/* ثلاث دوائر تختصر الصحة العامة — بصرية، بلا سطور. */}
        {(seeMoney || seeInventory || seeSales) && (
          <div className="erp-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
            {seeMoney && (
              <Donut
                label="نسبة التحصيل"
                value={Number(collected)}
                max={Number(invoiced) || 1}
                sub={`${formatMoney(outstanding)} ما زال مستحقاً`}
                tone={dec(outstanding).gt(0) ? 'warn' : 'ok'}
              />
            )}
            {seeInventory && (
              <Donut
                label="المتاح من الرصيد"
                value={Number(availableStock)}
                max={Number(onHand) || 1}
                sub={`محجوز ${Number(reserved)}`}
                tone="brand"
              />
            )}
            {seeSales && (
              <Donut
                label="الأوامر المسلَّمة"
                value={delivered}
                max={orderTotal || 1}
                center={`${delivered}/${orderTotal}`}
                sub="مُسلَّم ومكتمل"
                tone="ok"
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
