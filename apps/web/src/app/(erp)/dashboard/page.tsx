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
import { Donut } from '@/components/dashboard/Donut';
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
    purchaseAgg,
    expenseAgg,
    recentRows,
    recentAudits,
    supplyRows,
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

    // الصادر: المشتريات المؤكَّدة والمصروفات. تُجلب مع المال لأنها الطرف
    // الآخر منه — «الوارد والصادر» لا يكتمل بالوارد وحده.
    seeMoney
      ? prisma.purchaseOrder.aggregate({
          where: { tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'CANCELLED'] } },
          _sum: { total: true },
          _count: { _all: true },
        })
      : null,
    seeMoney
      ? prisma.secondaryExpense.aggregate({
          where: { tenantId, status: { not: 'REJECTED' } },
          _sum: { amount: true },
          _count: { _all: true },
        })
      : null,

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

    // المستلزمات — الأحبار والرولات والخيوط.
    //
    // المخزون أعلاه يتابع المنتجات المصنَّعة. أما ما يُصنَع به فكان خارج
    // نظر المدير تماماً: رول يوشك أن ينفد يوقف خط الطباعة كله، ولم يكن
    // في اللوحة ما ينبّه إليه قبل أن يقف.
    prisma.supply.findMany({
      where: { tenantId, isDeleted: false },
      select: { id: true, code: true, nameAr: true, unit: true, onHand: true, minStock: true },
      orderBy: { nameAr: 'asc' },
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
  // ── المستلزمات المقاربة على النفاذ ───────────────────────
  //
  // `lte` لا `lt`: الرصيد المساوي للحد الأدنى **هو** نقطة إعادة الطلب، لا
  // ما دونها. `lt` تصمت عند الحد بالضبط وتنبّه بعد تجاوزه — أي بعد فوات
  // الغرض من الحد.
  const lowSupplies = supplyRows.filter(
    (s) => dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock)),
  );
  // نفد فعلاً — أشد من "قارب".
  //
  // يُحسب من `lowSupplies` لا من كل المستلزمات: صنف رصيده صفر وحدّه صفر
  // ليس نافداً بل غير مُتابَع أصلاً. حسابه من الكل جعل عدد "النافد" أكبر
  // من عدد "المنبَّه عليه"، فظهر الفرق سالباً على الشاشة.
  const emptySupplies = lowSupplies.filter((s) => dec(s.onHand).lte(dec(0)));

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

  // ── الوارد والصادر ───────────────────────────────────────
  //
  // الوارد فلوسٌ دخلت فعلاً — المحصَّل من الفواتير، لا المفوتر. الصادر ما
  // خرج على المشتريات والمصروفات. الصافي فرقهما: موجب يعني دخلاً، سالب
  // يعني إنفاقاً يفوق التحصيل. لا تقدير ولا توقّع — أرقام حدثت.
  const moneyIn = collected;
  const purchasesOut = dec(purchaseAgg?._sum.total ?? 0);
  const expensesOut = dec(expenseAgg?._sum.amount ?? 0);
  const moneyOut = purchasesOut.plus(expensesOut);
  const net = moneyIn.minus(moneyOut);
  const flowMax = Math.max(Number(moneyIn), Number(moneyOut), 1);

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

        {/* ── الوارد والصادر + مؤشّرات دائرية ── */}
        {seeMoney && (
          <section>
            <SectionTitle note="فلوسٌ دخلت وخرجت فعلاً — لا تقدير">الوارد والصادر</SectionTitle>
            <div className="grid gap-4 lg:grid-cols-[1.3fr_2fr]">
              {/* الوارد مقابل الصادر والصافي */}
              <div className="erp-card p-6">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[0.7rem] text-txt-3">الوارد (محصَّل)</p>
                    <p className="mt-1 text-sm font-semibold text-ok">{formatMoney(moneyIn)}</p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] text-txt-3">الصادر</p>
                    <p className="mt-1 text-sm font-semibold text-bad">{formatMoney(moneyOut)}</p>
                  </div>
                  <div>
                    <p className="text-[0.7rem] text-txt-3">الصافي</p>
                    <p className={`mt-1 text-sm font-semibold ${dec(net).gte(0) ? 'text-ok' : 'text-bad'}`}>
                      {formatMoney(net)}
                    </p>
                  </div>
                </div>
                {/* شريطان يقارنان الوارد بالصادر بصرياً */}
                <div className="mt-5 space-y-3">
                  <FlowBar label="الوارد" value={Number(moneyIn)} max={flowMax} tone="ok" text={formatMoney(moneyIn)} />
                  <FlowBar label="الصادر" value={Number(moneyOut)} max={flowMax} tone="bad" text={formatMoney(moneyOut)} />
                </div>
                <p className="mt-4 text-[0.7rem] leading-[1.8] text-txt-4">
                  الصادر = المشتريات ({formatMoney(purchasesOut)}) + المصروفات ({formatMoney(expensesOut)}).
                </p>
              </div>

              {/* مؤشّرات دائرية */}
              <div className="erp-card grid grid-cols-2 items-center gap-4 p-6 sm:grid-cols-3">
                <Donut
                  label="نسبة التحصيل"
                  value={Number(collected)}
                  max={Number(invoiced) || 1}
                  sub={`${formatMoney(collected)} من ${formatMoney(invoiced)}`}
                  tone="ok"
                />
                <Donut
                  label="الأوامر المسلَّمة"
                  value={(orderBy.get('DELIVERED')?._count._all ?? 0) + (orderBy.get('COMPLETED')?._count._all ?? 0)}
                  max={orderTotal || 1}
                  center={`${(orderBy.get('DELIVERED')?._count._all ?? 0) + (orderBy.get('COMPLETED')?._count._all ?? 0)}/${orderTotal}`}
                  sub="مُسلَّم ومكتمل"
                  tone="brand"
                />
                <Donut
                  label="المتاح من الرصيد"
                  value={Number(dec(onHand).minus(reserved))}
                  max={Number(onHand) || 1}
                  sub={`محجوز ${formatQty(reserved)}`}
                  tone={dec(reserved).gt(0) ? 'warn' : 'brand'}
                />
              </div>
            </div>
          </section>
        )}

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

              {/* ── المستلزمات: ما يُصنَع به لا ما يُصنَع ──────────
                  رول أو حبر يوشك على النفاذ يوقف خط الطباعة كله، وكان
                  خارج نظر المدير تماماً. */}
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-txt-2">المستلزمات — أحبار ورولات وخيوط</p>
                  <Link href="/supplies" className="text-[0.7rem] text-brand hover:underline">
                    الكل
                  </Link>
                </div>

                {supplyRows.length === 0 ? (
                  <p className="text-[0.7rem] text-txt-4">
                    لا توجد مستلزمات مسجّلة. أضِفها ليتنبّه النظام قبل نفادها.
                  </p>
                ) : lowSupplies.length === 0 ? (
                  <p className="text-[0.7rem] text-ok">
                    كل المستلزمات فوق حدّها الأدنى — {supplyRows.length} صنفاً.
                  </p>
                ) : (
                  <>
                    <p className="mb-2.5 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-[0.7rem] leading-[1.8] text-bad">
                      {emptySupplies.length > 0
                        ? `${emptySupplies.length} صنفاً نفد بالكامل و${lowSupplies.length - emptySupplies.length} قارب على النفاذ.`
                        : `${lowSupplies.length} صنفاً قارب على النفاذ.`}{' '}
                      أعِد الطلب قبل توقّف الإنتاج.
                    </p>
                    <ul className="space-y-1.5">
                      {lowSupplies.slice(0, 5).map((s) => {
                        const empty = dec(s.onHand).lte(dec(0));
                        return (
                          <li key={s.id} className="flex justify-between gap-3 text-xs">
                            <span className="text-txt-2">
                              {s.nameAr}
                              {empty && <span className="ms-1.5 text-[0.65rem] text-bad">نفد</span>}
                            </span>
                            <span className="tnum shrink-0 text-bad">
                              {formatQty(s.onHand)} / {formatQty(s.minStock)}
                              {s.unit && <span className="ms-1 text-txt-4">{s.unit}</span>}
                            </span>
                          </li>
                        );
                      })}
                      {lowSupplies.length > 5 && (
                        <li className="text-[0.7rem] text-txt-4">
                          و{lowSupplies.length - 5} صنفاً آخر…
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
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

/**
 * شريط أفقي يقارن قيمة بحدّ أعلى.
 *
 * طوله المرئي = القيمة ÷ الأكبر بين الوارد والصادر، فالشريطان يُقرآن معاً:
 * الأطول هو الأكبر. حدٌّ صفر يعطي شريطاً فارغاً لا NaN.
 */
function FlowBar({
  label,
  value,
  max,
  tone,
  text,
}: {
  label: string;
  value: number;
  max: number;
  tone: 'ok' | 'bad';
  text: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = tone === 'ok' ? 'var(--color-ok)' : 'var(--color-bad)';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[0.7rem]">
        <span className="text-txt-3">{label}</span>
        <span className="tnum text-txt-2">{text}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-card-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
