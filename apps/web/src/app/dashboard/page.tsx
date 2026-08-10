import type { Metadata } from 'next';
import Link from 'next/link';
import {
  can,
  dec,
  formatMoney,
  formatQty,
  balance,
  available,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_AR,
  ORDER_STATUSES,
  ORDER_STATUS_AR,
  PRODUCTION_STATUSES,
  PRODUCTION_STATUS_AR,
  RECEIVABLE_STATUSES,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { WelcomeHeader } from '@/components/dashboard/WelcomeHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { SectionTitle, Panel } from '@/components/dashboard/Section';
import { Breakdown, Metric } from '@/components/dashboard/Breakdown';
import { RecentProducts, type RecentProduct } from '@/components/dashboard/RecentProducts';
import { QuickActions, type QuickAction } from '@/components/dashboard/QuickActions';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import {
  IconProduct,
  IconCategory,
  IconUsers,
  IconClock,
  IconActivity,
  IconBell,
} from '@/components/dashboard/Icons';

export const metadata: Metadata = { title: 'لوحة المدير' };

/**
 * لوحة تحكم المدير.
 *
 * Every figure on this page is a live count or sum. Nothing is estimated,
 * projected or filled in.
 *
 * ── What changed, and why it mattered ──────────────────────
 *
 * This page used to carry a band of eight "waiting for the module" cards for
 * sales, inventory, customers, manufacturing and accounting. All of those
 * modules now exist, so the band had stopped being honest caution and become
 * a stale claim that the system is less finished than it is. It is replaced
 * by the real figures.
 *
 * The one rule kept from the old design: a metric with no records says so.
 * Zero because nothing happened and zero because nothing was recorded read
 * identically, and a manager cannot act on the difference they cannot see.
 *
 * Sections are gated on the same permissions as the modules they summarise —
 * a dashboard that leaks a total a user may not open is still a leak.
 */
export default async function ManagerDashboard() {
  const user = await requirePermission('dashboard.view');
  const tenantId = user.tenantId;

  const seeSales = can(user.role, 'sales.documents');
  const seeProduction = can(user.role, 'manufacturing.view');
  const seeInventory = can(user.role, 'inventory.read');
  const seeCustomers = can(user.role, 'customers.read');
  const seeMoney = can(user.role, 'invoices.view');
  const seeCost = can(user.role, 'cost.view');

  const [
    productCount,
    variantCount,
    categoryCount,
    customerCount,
    userCount,
    activeSessions,
    auditCount,
    quotationRows,
    orderRows,
    productionRows,
    stockRows,
    invoiceRows,
    costSnapshots,
    recentRows,
    recentAudits,
  ] = await Promise.all([
    prisma.product.count({ where: { tenantId, isDeleted: false } }),
    prisma.productVariant.count({ where: { isDeleted: false, product: { tenantId } } }),
    prisma.category.count({ where: { tenantId, isDeleted: false } }),
    seeCustomers ? prisma.customer.count({ where: { tenantId, isDeleted: false } }) : 0,
    prisma.user.count({ where: { tenantId } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.count({ where: { tenantId } }),

    seeSales
      ? prisma.quotation.groupBy({
          by: ['status'],
          where: { tenantId, isDeleted: false },
          _count: { _all: true },
          _sum: { total: true },
        })
      : [],
    seeSales
      ? prisma.salesOrder.groupBy({
          by: ['status'],
          where: { tenantId, isDeleted: false },
          _count: { _all: true },
          _sum: { total: true },
        })
      : [],
    seeProduction
      ? prisma.productionOrder.groupBy({
          by: ['status'],
          where: { tenantId, isDeleted: false },
          _count: { _all: true },
          _sum: { quantity: true },
        })
      : [],
    seeInventory
      ? prisma.stock.findMany({
          where: { warehouse: { tenantId, isDeleted: false } },
          include: {
            variant: {
              include: {
                product: { select: { nameAr: true, cost: true } },
                color: { select: { nameAr: true } },
                size: { select: { code: true } },
              },
            },
          },
        })
      : [],
    seeMoney
      ? prisma.invoice.findMany({
          where: { tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } },
          select: { total: true, paidAmount: true, status: true },
        })
      : [],
    seeCost ? prisma.costCalculation.count({ where: { tenantId } }) : 0,

    prisma.product.findMany({
      where: { tenantId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: {
        category: { select: { nameAr: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        _count: { select: { images: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { user: { select: { nameAr: true, name: true } } },
    }),
  ]);

  // ── Sales ────────────────────────────────────────────────
  const quotationBy = new Map(quotationRows.map((r) => [r.status, r]));
  const orderBy = new Map(orderRows.map((r) => [r.status, r]));

  const quotationTotal = quotationRows.reduce((s, r) => s + r._count._all, 0);
  const orderTotal = orderRows.reduce((s, r) => s + r._count._all, 0);
  // Value of orders that are actually committed — a draft is not a sale.
  const committedValue = orderRows
    .filter((r) => r.status !== 'DRAFT' && r.status !== 'CANCELLED')
    .reduce((sum, r) => sum.plus(dec(r._sum.total ?? 0)), dec(0));

  // ── Production ───────────────────────────────────────────
  const productionByStatus = new Map(productionRows.map((r) => [r.status, r]));
  const productionTotal = productionRows.reduce((s, r) => s + r._count._all, 0);
  const inProgress = productionByStatus.get('IN_PROGRESS')?._count._all ?? 0;
  const completed = productionByStatus.get('COMPLETED')?._count._all ?? 0;

  // ── Inventory ────────────────────────────────────────────
  const reserved = stockRows.reduce((s, r) => s.plus(dec(r.reserved)), dec(0));
  const onHand = stockRows.reduce((s, r) => s.plus(dec(r.onHand)), dec(0));
  const lowStock = stockRows.filter(
    (r) => dec(r.minStock).gt(0) && available(r.onHand, r.reserved).lt(dec(r.minStock)),
  );
  // Stock we hold but cannot value, because nobody entered a cost.
  const unpriced = stockRows.filter(
    (r) =>
      dec(r.onHand).gt(0) &&
      (r.variant.cost === null || dec(r.variant.cost).lte(0)) &&
      (r.variant.product.cost === null || dec(r.variant.product.cost).lte(0)),
  );

  // ── Money ────────────────────────────────────────────────
  const invoiced = invoiceRows.reduce((s, i) => s.plus(dec(i.total)), dec(0));
  const collected = invoiceRows.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
  const outstanding = invoiceRows
    .filter((i) => RECEIVABLE_STATUSES.includes(i.status as never))
    .reduce((s, i) => s.plus(balance(i.total, i.paidAmount)), dec(0));

  const recent: RecentProduct[] = recentRows.map((row) => ({
    id: row.id,
    sku: row.sku,
    nameAr: row.nameAr,
    categoryAr: row.category.nameAr,
    imagePath: row.images[0]?.path ?? null,
    imageCount: row._count.images,
  }));

  const actions: QuickAction[] = [
    { href: '/sales/quotations', label: 'عرض سعر جديد', description: `${quotationTotal} عرض مسجّل`, available: seeSales },
    { href: '/manufacturing', label: 'أوامر الإنتاج', description: `${inProgress} قيد التنفيذ`, available: seeProduction },
    { href: '/inventory', label: 'المخزون', description: `${lowStock.length} صنف تحت الحد`, available: seeInventory },
    { href: '/reports', label: 'التقارير', description: 'مبيعات ومخزون وربحية', available: can(user.role, 'reports.view') },
  ];

  return (
    <AppShell user={user} title="لوحة المدير">
      <div className="space-y-7">
        <WelcomeHeader name={user.nameAr ?? user.name} roleAr={user.roleNameAr} />

        <section>
          <SectionTitle note="محسوبة مباشرة من قاعدة البيانات">نظرة عامة</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard index={0} label="المنتجات" value={productCount} unit="منتج" hint={`${variantCount} متغيّر · ${categoryCount} تصنيف`} icon={<IconProduct />} tone="primary" />
            {seeSales && (
              <StatCard index={1} label="أوامر البيع" value={orderTotal} unit="أمر" hint={`${quotationTotal} عرض سعر`} icon={<IconCategory />} tone="primary" />
            )}
            {seeProduction && (
              <StatCard index={2} label="أوامر الإنتاج" value={productionTotal} unit="أمر" hint={`${inProgress} قيد التنفيذ · ${completed} مكتمل`} icon={<IconProduct />} tone={inProgress > 0 ? 'warning' : 'neutral'} />
            )}
            {seeCustomers && (
              <StatCard index={3} label="العملاء" value={customerCount} unit="عميل" icon={<IconUsers />} tone="neutral" />
            )}
            {seeInventory && (
              <StatCard index={4} label="تحت الحد الأدنى" value={lowStock.length} unit="صنف" hint={lowStock.length === 0 ? 'لا تنبيهات مخزون' : 'يحتاج إعادة طلب'} icon={<IconBell />} tone={lowStock.length > 0 ? 'warning' : 'success'} />
            )}
            <StatCard index={5} label="المستخدمون" value={userCount} unit="مستخدم" hint={`${activeSessions} جلسة نشطة`} icon={<IconUsers />} tone="neutral" />
            <StatCard index={6} label="سجل التدقيق" value={auditCount} unit="سجل" icon={<IconActivity />} tone="neutral" />
            {seeCost && (
              <StatCard index={7} label="حسابات التكلفة" value={costSnapshots} unit="لقطة" hint="محفوظة ولا يُعاد حسابها" icon={<IconClock />} tone="neutral" />
            )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {seeSales && (
            <Panel title="المبيعات" delay={0.15}>
              <p className="mb-4 text-xs text-txt-3">عروض الأسعار حسب الحالة</p>
              <Breakdown
                delay={0.15}
                emptyNote="لا توجد عروض أسعار مسجّلة بعد."
                rows={QUOTATION_STATUSES.map((s) => ({
                  key: s,
                  label: QUOTATION_STATUS_AR[s],
                  count: quotationBy.get(s)?._count._all ?? 0,
                }))}
              />

              <p className="mb-4 mt-6 text-xs text-txt-3">أوامر البيع حسب الحالة</p>
              <Breakdown
                delay={0.2}
                emptyNote="لا توجد أوامر بيع مسجّلة بعد."
                rows={ORDER_STATUSES.map((s) => ({
                  key: s,
                  label: ORDER_STATUS_AR[s],
                  count: orderBy.get(s)?._count._all ?? 0,
                }))}
              />

              <div className="mt-5">
                <Metric
                  label="قيمة الأوامر المؤكَّدة"
                  value={orderTotal === 0 ? null : formatMoney(committedValue)}
                  hint="بلا المسودات والملغاة"
                />
              </div>
            </Panel>
          )}

          {seeProduction && (
            <Panel title="التصنيع" delay={0.2}>
              <Breakdown
                delay={0.2}
                emptyNote="لا توجد أوامر إنتاج مسجّلة بعد."
                rows={PRODUCTION_STATUSES.map((s) => ({
                  key: s,
                  label: PRODUCTION_STATUS_AR[s],
                  count: productionByStatus.get(s)?._count._all ?? 0,
                  detail:
                    (productionByStatus.get(s)?._count._all ?? 0) > 0
                      ? formatQty(productionByStatus.get(s)?._sum.quantity ?? 0)
                      : undefined,
                }))}
              />
              <p className="mt-4 text-[0.7rem] text-txt-4">
                الرقم الثاني هو إجمالي الكميات في تلك الحالة.
              </p>
            </Panel>
          )}

          {seeInventory && (
            <Panel title="المخزون" delay={0.25}>
              <Metric label="إجمالي الرصيد" value={stockRows.length === 0 ? null : formatQty(onHand)} hint={`${stockRows.length} سجل رصيد`} />
              <Metric label="محجوز لأوامر البيع" value={stockRows.length === 0 ? null : formatQty(reserved)} tone={dec(reserved).gt(0) ? 'warn' : undefined} />
              <Metric label="المتاح للبيع" value={stockRows.length === 0 ? null : formatQty(dec(onHand).minus(reserved))} hint="الرصيد ناقص المحجوز" />
              <Metric label="أصناف تحت الحد الأدنى" value={String(lowStock.length)} tone={lowStock.length > 0 ? 'bad' : 'ok'} />
              <Metric
                label="أصناف بلا تكلفة"
                value={String(unpriced.length)}
                hint="لا تدخل في تقييم المخزون"
                tone={unpriced.length > 0 ? 'warn' : 'ok'}
              />

              {lowStock.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
                  {lowStock.slice(0, 4).map((row) => (
                    <li key={row.id} className="flex justify-between gap-3 text-xs">
                      <span className="text-txt-2">
                        {[row.variant.product.nameAr, row.variant.color?.nameAr, row.variant.size?.code]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="tnum shrink-0 text-bad">
                        {formatQty(available(row.onHand, row.reserved))} / {formatQty(row.minStock)}
                      </span>
                    </li>
                  ))}
                  {lowStock.length > 4 && (
                    <li className="text-[0.7rem] text-txt-4">و{lowStock.length - 4} صنفاً آخر…</li>
                  )}
                </ul>
              )}
            </Panel>
          )}

          {seeMoney && (
            <Panel title="المؤشرات المالية" delay={0.3}>
              <Metric
                label="إجمالي المُفوتَر"
                value={invoiceRows.length === 0 ? null : formatMoney(invoiced)}
                hint={`${invoiceRows.length} فاتورة صادرة`}
              />
              <Metric
                label="المحصَّل"
                value={invoiceRows.length === 0 ? null : formatMoney(collected)}
                tone="ok"
              />
              <Metric
                label="المستحق"
                value={invoiceRows.length === 0 ? null : formatMoney(outstanding)}
                tone={dec(outstanding).gt(0) ? 'warn' : 'ok'}
              />

              {invoiceRows.length === 0 && (
                <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-xs leading-relaxed text-txt-3">
                  لا توجد فواتير صادرة بعد. الفاتورة تُنشأ من أمر بيع مؤكَّد ثم تُصدَر — ولا
                  يظهر هنا رقم قبل ذلك.
                </p>
              )}

              <p className="mt-4 text-[0.7rem] leading-relaxed text-txt-4">
                لا يوجد «صافي ربح» هنا لأن النظام لا يملك محاسبة بعد. الربح المجمل لكل منتج
                متاح في تقرير الربحية، وهو مبني على لقطات التكلفة المحفوظة.
              </p>
            </Panel>
          )}
        </div>

        <section>
          <SectionTitle note={`${recent.length} من ${productCount}`} delay={0.35}>
            أحدث المنتجات
          </SectionTitle>
          <RecentProducts products={recent} />
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <Panel title="آخر النشاطات" delay={0.4}>
            <ActivityFeed
              items={recentAudits.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actor: entry.user?.nameAr ?? entry.user?.name ?? 'النظام',
                at: entry.createdAt.toISOString(),
              }))}
            />
          </Panel>

          <div className="space-y-5">
            <Panel title="إجراءات سريعة" delay={0.45}>
              <QuickActions actions={actions} />
            </Panel>

            <Panel title="ما زال ناقصاً" delay={0.5}>
              <p className="text-xs leading-relaxed text-txt-3">
                لا توجد محاسبة (قيود، دليل حسابات) ولا إشعارات آلية. تنبيه نقص المخزون أعلاه
                محسوب لحظياً من الأرصدة، لا مُرسَل من نظام إشعارات.
              </p>
              <Link href="/reports" className="mt-3 inline-block text-xs text-brand hover:underline">
                عرض التقارير التفصيلية
              </Link>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
