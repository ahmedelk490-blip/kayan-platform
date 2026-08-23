import type { Metadata } from 'next';
import {
  can,
  dec,
  formatMoney,
  balance,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_AR,
  ORDER_STATUSES,
  ORDER_STATUS_AR,
  RECEIVABLE_STATUSES,
  monthlySeries,
  periodRange,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { WelcomeHeader } from '@/components/dashboard/WelcomeHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { SectionTitle, Panel } from '@/components/dashboard/Section';
import { Breakdown, Metric } from '@/components/dashboard/Breakdown';
import { Donut } from '@/components/dashboard/Donut';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { QuickActions, type QuickAction } from '@/components/dashboard/QuickActions';
import { IconCategory, IconProduct, IconUsers, IconBell } from '@/components/dashboard/Icons';
import { BarChartInteractive } from '@/components/dashboard/BarChartInteractive';
import { HBarChartInteractive } from '@/components/dashboard/HBarChartInteractive';

export const metadata: Metadata = { title: 'لوحة المبيعات' };

/**
 * لوحة المبيعات — شاملة وحيّة.
 *
 * كانت صفحة انتظار مليئة بـ«وحدة لم تُبنَ بعد» لوحدات صارت كلها موجودة —
 * ادّعاء قِدَم لم يعد صادقاً. صارت لوحة واحدة يرى فيها المندوب مبيعاته كلها:
 * العروض، الأوامر، المستحقات، ونشاطه الأخير — بأرقام محسوبة مباشرة، وكل
 * قسم محكوم بصلاحيته.
 */
export default async function SalesDashboard() {
  const user = await requirePermission('sales.view');
  const tenantId = user.tenantId;

  const seeDocs = can(user.role, 'sales.documents');
  const seeMoney = can(user.role, 'invoices.view');
  const seeCustomers = can(user.role, 'customers.read');

  const [quotationRows, orderRows, invoiceRows, customerCount, leadCount, recentAudits] =
    await Promise.all([
      seeDocs
        ? prisma.quotation.groupBy({
            by: ['status'],
            where: { tenantId, isDeleted: false },
            _count: { _all: true },
            _sum: { total: true },
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
            where: { tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
            select: { total: true, paidAmount: true, status: true },
          })
        : [],
      seeCustomers ? prisma.customer.count({ where: { tenantId, isDeleted: false } }) : 0,
      seeCustomers
        ? prisma.customerActivity.count({
            where: { type: 'INQUIRY', customer: { tenantId, isDeleted: false } },
          })
        : 0,
      prisma.auditLog.findMany({
        where: {
          tenantId,
          action: {
            in: [
              'quotation.create', 'quotation.status', 'quotation.convert',
              'order.create', 'order.confirm', 'order.status', 'order.cancel',
              'invoice.issue', 'payment.record',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { nameAr: true, name: true } } },
      }),
    ]);

  const quotationBy = new Map(quotationRows.map((r) => [r.status, r]));
  const orderBy = new Map(orderRows.map((r) => [r.status, r]));
  const quotationTotal = quotationRows.reduce((s, r) => s + r._count._all, 0);
  const orderTotal = orderRows.reduce((s, r) => s + r._count._all, 0);

  const openQuotations = (quotationBy.get('DRAFT')?._count._all ?? 0) + (quotationBy.get('SENT')?._count._all ?? 0);
  const converted = quotationBy.get('CONVERTED')?._count._all ?? 0;
  const deliveredOrders = (orderBy.get('DELIVERED')?._count._all ?? 0) + (orderBy.get('COMPLETED')?._count._all ?? 0);

  const committedValue = orderRows
    .filter((r) => r.status !== 'DRAFT' && r.status !== 'CANCELLED')
    .reduce((sum, r) => sum.plus(dec(r._sum.total ?? 0)), dec(0));

  const invoiced = invoiceRows.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoiceRows.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = invoiceRows
    .filter((i) => RECEIVABLE_STATUSES.includes(i.status as never))
    .reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));

  // سلسلة المبيعات الشهرية لهذه السنة، للرسم التفاعلي.
  const { from, to } = periodRange('YEAR');
  const monthlyInvoices = seeMoney
    ? await prisma.invoice.findMany({
        where: {
          tenantId,
          isDeleted: false,
          status: { notIn: ['DRAFT', 'VOID'] },
          issueDate: { gte: from, lte: to },
        },
        select: { total: true, issueDate: true },
      })
    : [];
  const salesSeries = monthlySeries(
    monthlyInvoices.map((i) => ({ date: i.issueDate as Date, amount: i.total })),
    from,
    to,
  );
  const chartPoints = salesSeries.map((p) => ({
    label: p.key.slice(-2),
    value: dec(p.value).toNumber(),
    display: formatMoney(p.value),
  }));

  // أفضل المنتجات مبيعاً هذه السنة — من بنود الفواتير الصادرة.
  const invoiceLines = seeMoney
    ? await prisma.invoiceLine.findMany({
        where: {
          invoice: {
            tenantId,
            isDeleted: false,
            status: { notIn: ['DRAFT', 'VOID'] },
            issueDate: { gte: from, lte: to },
          },
        },
        select: { description: true, lineTotal: true },
      })
    : [];
  const byProduct = new Map<string, ReturnType<typeof dec>>();
  for (const l of invoiceLines) {
    byProduct.set(l.description, (byProduct.get(l.description) ?? dec(0)).plus(dec(l.lineTotal)));
  }
  const topProducts = [...byProduct.entries()]
    .sort((a, b) => b[1].minus(a[1]).toNumber())
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: value.toNumber(), display: formatMoney(value) }));

  const actions: QuickAction[] = [
    { href: '/sales/quotations/new', label: 'عرض سعر جديد', description: `${openQuotations} عرض مفتوح`, available: seeDocs },
    { href: '/sales/orders/new', label: 'أمر بيع جديد', description: `${orderTotal} أمر`, available: seeDocs },
    { href: '/invoices', label: 'الفواتير والتحصيل', description: seeMoney ? `${formatMoney(outstanding)} مستحق` : '', available: seeMoney },
    { href: '/requests', label: 'طلبات الموقع', description: `${leadCount} طلب`, available: seeCustomers },
  ];

  return (
    <AppShell user={user} title="لوحة المبيعات">
      <div className="space-y-7">
        <WelcomeHeader name={user.nameAr ?? user.name} roleAr={user.roleNameAr} />

        <section>
          <SectionTitle note="محسوبة مباشرة من قاعدة البيانات">نظرة المبيعات</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {seeDocs && (
              <StatCard index={0} label="عروض مفتوحة" value={openQuotations} unit="عرض" hint={`${quotationTotal} إجمالاً`} icon={<IconCategory />} tone={openQuotations > 0 ? 'warning' : 'neutral'} />
            )}
            {seeDocs && (
              <StatCard index={1} label="قيمة الأوامر المؤكَّدة" value={formatMoney(committedValue)} hint={`${orderTotal} أمر`} icon={<IconProduct />} tone="primary" />
            )}
            {seeMoney && (
              <StatCard index={2} label="مستحقات غير محصَّلة" value={formatMoney(outstanding)} hint={`${formatMoney(collected)} محصَّل`} icon={<IconBell />} tone={dec(outstanding).gt(0) ? 'warning' : 'success'} />
            )}
            {seeCustomers && (
              <StatCard index={3} label="العملاء" value={customerCount} unit="عميل" hint={`${leadCount} طلب من الموقع`} icon={<IconUsers />} tone="neutral" />
            )}
          </div>
        </section>

        {/* مؤشّرات دائرية */}
        {seeDocs && (
          <section>
            <SectionTitle>مؤشّرات الأداء</SectionTitle>
            <div className="erp-card grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
              <Donut label="نسبة التحويل" value={converted} max={quotationTotal || 1} sub={`${converted} من ${quotationTotal} عرض`} tone="ok" />
              <Donut label="الأوامر المسلَّمة" value={deliveredOrders} max={orderTotal || 1} center={`${deliveredOrders}/${orderTotal}`} sub="مُسلَّم ومكتمل" tone="brand" />
              {seeMoney && (
                <Donut label="نسبة التحصيل" value={Number(collected)} max={Number(invoiced) || 1} sub={`${formatMoney(collected)} من ${formatMoney(invoiced)}`} tone={dec(outstanding).gt(0) ? 'warn' : 'ok'} />
              )}
            </div>
          </section>
        )}

        {/* رسم تفاعلي: المبيعات المفوترة شهرياً — المرور يُظهر قيمة كل شهر. */}
        {seeMoney && (
          <section>
            <SectionTitle note="مرِّر على أي عمود لرؤية قيمة الشهر">المبيعات شهرياً</SectionTitle>
            <div className="erp-card p-6">
              {chartPoints.every((p) => p.value === 0) ? (
                <p className="py-8 text-center text-sm text-txt-3">لا فواتير صادرة هذه السنة بعد.</p>
              ) : (
                <BarChartInteractive points={chartPoints} />
              )}
            </div>
          </section>
        )}

        {/* رسم تفاعلي: أفضل المنتجات مبيعاً — أعمدة أفقية بالمرور. */}
        {seeMoney && topProducts.length > 0 && (
          <section>
            <SectionTitle note="من قيمة بنود الفواتير الصادرة">أفضل المنتجات مبيعاً</SectionTitle>
            <div className="erp-card p-6">
              <HBarChartInteractive points={topProducts} />
            </div>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          {seeDocs && (
            <Panel title="عروض الأسعار" delay={0.15}>
              <Breakdown
                delay={0.15}
                emptyNote="لا عروض أسعار بعد."
                rows={QUOTATION_STATUSES.map((s) => ({
                  key: s,
                  label: QUOTATION_STATUS_AR[s],
                  count: quotationBy.get(s)?._count._all ?? 0,
                }))}
              />
            </Panel>
          )}

          {seeDocs && (
            <Panel title="أوامر البيع" delay={0.2}>
              <Breakdown
                delay={0.2}
                emptyNote="لا أوامر بيع بعد."
                rows={ORDER_STATUSES.map((s) => ({
                  key: s,
                  label: ORDER_STATUS_AR[s],
                  count: orderBy.get(s)?._count._all ?? 0,
                }))}
              />
            </Panel>
          )}

          {seeMoney && (
            <Panel title="التحصيل" delay={0.25}>
              <Metric label="إجمالي المفوتر" value={invoiceRows.length === 0 ? null : formatMoney(invoiced)} />
              <Metric label="المحصَّل" value={invoiceRows.length === 0 ? null : formatMoney(collected)} tone="ok" />
              <Metric label="المستحق" value={invoiceRows.length === 0 ? null : formatMoney(outstanding)} tone={dec(outstanding).gt(0) ? 'warn' : undefined} hint="فواتير صادرة لم تُسدَّد" />
            </Panel>
          )}

          <Panel title="آخر نشاط المبيعات" delay={0.3}>
            <ActivityFeed
              items={recentAudits.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actor: entry.user?.nameAr ?? entry.user?.name ?? 'النظام',
                at: entry.createdAt.toISOString(),
              }))}
            />
          </Panel>
        </div>

        <section>
          <SectionTitle>إجراءات سريعة</SectionTitle>
          <QuickActions actions={actions} />
        </section>
      </div>
    </AppShell>
  );
}
