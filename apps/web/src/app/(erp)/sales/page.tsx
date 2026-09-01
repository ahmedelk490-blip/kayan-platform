import type { Metadata } from 'next';
import {
  can,
  userCan,
  dec,
  formatMoney,
  balance,
  RECEIVABLE_STATUSES,
  monthlySeries,
  periodRange,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { WelcomeHeader } from '@/components/dashboard/WelcomeHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { SectionTitle } from '@/components/dashboard/Section';
import { Donut } from '@/components/dashboard/Donut';
import { QuickActions, type QuickAction } from '@/components/dashboard/QuickActions';
import { IconCategory, IconProduct, IconUsers, IconBell } from '@/components/dashboard/Icons';
import { BarChartInteractive } from '@/components/dashboard/BarChartInteractive';

export const metadata: Metadata = { title: 'لوحة المبيعات' };

/**
 * لوحة المبيعات — شاشة واحدة تُقرأ بنظرة.
 *
 * بطلب المالك: لا قوائم ولا سرد حالات — هيرو بنبض اليوم، بلاطات الشغل،
 * صفُّ أرقام، ثلاث دوائر، ورسم المبيعات الشهري. التفاصيل خلف الضغطات.
 * كل قسم محكوم بصلاحيته، ومن لا يرى فواتير الجميع يرى أرقامه هو.
 */
export default async function SalesDashboard() {
  const user = await requirePermission('sales.view');
  const tenantId = user.tenantId;

  const seeDocs = can(user.role, 'sales.documents');
  const seeMoney = can(user.role, 'invoices.view');
  const seeCustomers = can(user.role, 'customers.read');
  const canSell = can(user.role, 'invoices.write');
  // من لا يملك «عرض فواتير كل الموظفين» ترى لوحته مبيعاته هو فقط.
  const seeAll = userCan(user.role, user.overrides, 'invoices.viewAll');
  const ownerScope = seeAll ? {} : { createdById: user.id };

  const dayStart = (() => {
    const ref = new Date(Date.now() + 3 * 60 * 60 * 1000);
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()) - 3 * 60 * 60 * 1000);
  })();

  const [quotationRows, orderRows, invoiceRows, customerCount, leadCount, todayInv, todayPay] =
    await Promise.all([
      seeDocs
        ? prisma.quotation.groupBy({
            by: ['status'],
            where: { tenantId, isDeleted: false },
            _count: { _all: true },
          })
        : [],
      seeDocs
        ? prisma.salesOrder.groupBy({
            by: ['status'],
            where: { tenantId, isDeleted: false },
            _count: { _all: true },
            _sum: { total: true },
          })
        : [],
      seeMoney
        ? prisma.invoice.findMany({
            where: { tenantId, isDeleted: false, ...ownerScope, status: { notIn: ['DRAFT', 'VOID'] } },
            select: { total: true, paidAmount: true, status: true },
          })
        : [],
      seeCustomers ? prisma.customer.count({ where: { tenantId, isDeleted: false } }) : 0,
      seeCustomers
        ? prisma.customerActivity.count({
            where: { type: 'INQUIRY', customer: { tenantId, isDeleted: false } },
          })
        : 0,
      seeMoney
        ? prisma.invoice.aggregate({
            where: { tenantId, isDeleted: false, ...ownerScope, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: dayStart } },
            _sum: { total: true },
            _count: true,
          })
        : null,
      seeMoney
        ? prisma.payment.aggregate({
            where: { tenantId, paidAt: { gte: dayStart }, ...(seeAll ? {} : { recordedById: user.id }) },
            _sum: { amount: true },
          })
        : null,
    ]);

  const quotationBy = new Map(quotationRows.map((r) => [r.status, r]));
  const quotationTotal = quotationRows.reduce((s, r) => s + r._count._all, 0);
  const orderTotal = orderRows.reduce((s, r) => s + r._count._all, 0);

  const openQuotations =
    (quotationBy.get('DRAFT')?._count._all ?? 0) + (quotationBy.get('SENT')?._count._all ?? 0);
  const converted = quotationBy.get('CONVERTED')?._count._all ?? 0;
  const deliveredOrders = orderRows
    .filter((r) => r.status === 'DELIVERED' || r.status === 'COMPLETED')
    .reduce((s, r) => s + r._count._all, 0);

  const committedValue = orderRows
    .filter((r) => r.status !== 'DRAFT' && r.status !== 'CANCELLED')
    .reduce((sum, r) => sum.plus(dec(r._sum.total ?? 0)), dec(0));

  const invoiced = invoiceRows.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoiceRows.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = invoiceRows
    .filter((i) => RECEIVABLE_STATUSES.includes(i.status as never))
    .reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));

  // سلسلة المبيعات الشهرية لهذه السنة — الرسم الوحيد في اللوحة.
  const { from, to } = periodRange('YEAR');
  const monthlyInvoices = seeMoney
    ? await prisma.invoice.findMany({
        where: {
          tenantId,
          isDeleted: false,
          ...ownerScope,
          status: { notIn: ['DRAFT', 'VOID'] },
          issueDate: { gte: from, lte: to },
        },
        select: { total: true, issueDate: true },
      })
    : [];
  const chartPoints = monthlySeries(
    monthlyInvoices.map((i) => ({ date: i.issueDate as Date, amount: i.total })),
    from,
    to,
  ).map((p) => ({
    label: p.key.slice(-2),
    value: dec(p.value).toNumber(),
    display: formatMoney(p.value),
  }));

  const today =
    todayInv && todayPay
      ? {
          sales: formatMoney(dec(todayInv._sum.total ?? 0)),
          collected: formatMoney(dec(todayPay._sum.amount ?? 0)),
          invoices: todayInv._count,
        }
      : undefined;

  const actions: QuickAction[] = [
    { href: '/cashier', label: 'الكاشير', description: 'بيع سريع — صور أو كتابة', available: canSell, emoji: '🛒', gradient: 'from-emerald-500 to-teal-700' },
    { href: '/invoices/new', label: 'فاتورة جديدة', description: 'عميل وأصناف وإصدار فوري', available: canSell, emoji: '🧾', gradient: 'from-[#7d3349] to-[#5c2535]' },
    { href: '/sales/quotations/new', label: 'عرض سعر جديد', description: `${openQuotations} عرض مفتوح`, available: seeDocs, emoji: '📄', gradient: 'from-sky-500 to-blue-700' },
    { href: '/sales/orders/new', label: 'أمر بيع جديد', description: `${orderTotal} أمر`, available: seeDocs, emoji: '📋', gradient: 'from-violet-500 to-purple-700' },
    { href: '/invoices', label: 'الفواتير والتحصيل', description: seeMoney ? `${formatMoney(outstanding)} مستحق` : '', available: seeMoney, emoji: '💵', gradient: 'from-amber-500 to-orange-600' },
    { href: '/requests', label: 'طلبات الموقع', description: `${leadCount} طلب`, available: seeCustomers, emoji: '🌐', gradient: 'from-slate-500 to-slate-700' },
  ];

  return (
    <AppShell user={user} title="لوحة المبيعات">
      <div className="space-y-6">
        <WelcomeHeader name={user.nameAr ?? user.name} roleAr={user.roleNameAr} today={today} />

        <QuickActions actions={actions} />

        {/* الأرقام الأربعة — لا أكثر. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {seeDocs && (
            <StatCard
              index={0}
              label="عروض مفتوحة"
              value={openQuotations}
              unit="عرض"
              hint={`${quotationTotal} إجمالاً`}
              icon={<IconCategory />}
              tone={openQuotations > 0 ? 'warning' : 'neutral'}
            />
          )}
          {seeDocs && (
            <StatCard
              index={1}
              label="قيمة الأوامر المؤكَّدة"
              value={formatMoney(committedValue)}
              hint={`${orderTotal} أمر`}
              icon={<IconProduct />}
              tone="primary"
            />
          )}
          {seeMoney && (
            <StatCard
              index={2}
              label="مستحقات غير محصَّلة"
              value={formatMoney(outstanding)}
              hint={`${formatMoney(collected)} محصَّل`}
              icon={<IconBell />}
              tone={dec(outstanding).gt(0) ? 'warning' : 'success'}
            />
          )}
          {seeCustomers && (
            <StatCard
              index={3}
              label="العملاء"
              value={customerCount}
              unit="عميل"
              hint={`${leadCount} طلب من الموقع`}
              icon={<IconUsers />}
              tone="neutral"
            />
          )}
        </div>

        {/* ثلاث دوائر تختصر الأداء — بصرية، بلا سطور. */}
        {seeDocs && (
          <div className="erp-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-3">
            <Donut label="نسبة التحويل" value={converted} max={quotationTotal || 1} sub={`${converted} من ${quotationTotal} عرض`} tone="ok" />
            <Donut label="الأوامر المسلَّمة" value={deliveredOrders} max={orderTotal || 1} center={`${deliveredOrders}/${orderTotal}`} sub="مُسلَّم ومكتمل" tone="brand" />
            {seeMoney && (
              <Donut label="نسبة التحصيل" value={Number(collected)} max={Number(invoiced) || 1} sub={`${formatMoney(collected)} من ${formatMoney(invoiced)}`} tone={dec(outstanding).gt(0) ? 'warn' : 'ok'} />
            )}
          </div>
        )}

        {/* الرسم الوحيد: المبيعات شهرياً — مرِّر على أي عمود لرؤية قيمته. */}
        {seeMoney && !chartPoints.every((p) => p.value === 0) && (
          <section>
            <SectionTitle note="مرِّر على أي عمود لرؤية قيمة الشهر">المبيعات شهرياً</SectionTitle>
            <div className="erp-card p-6">
              <BarChartInteractive points={chartPoints} />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
