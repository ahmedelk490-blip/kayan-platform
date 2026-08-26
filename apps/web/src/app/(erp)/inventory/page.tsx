import type { Metadata } from 'next';
import { can, available, dec, formatQty, formatMoney, type Numeric } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { MovementModal } from './MovementModal';
import { reverseMovement } from './actions';
import { TYPE_LABELS } from './types';

export const metadata: Metadata = { title: 'المخزون' };

function variantLabel(v: {
  sku: string;
  color: { nameAr: string } | null;
  size: { code: string } | null;
  product: { nameAr: string };
}) {
  const parts = [v.product.nameAr];
  if (v.color) parts.push(v.color.nameAr);
  if (v.size) parts.push(v.size.code);
  return `${parts.join(' · ')} (${v.sku})`;
}

export default async function InventoryPage() {
  const user = await requirePermission('inventory.read');
  const canWrite = can(user.role, 'inventory.write');

  const seeSupplies = can(user.role, 'supplies.view');

  const [stock, variants, movements, supplies, supplyTx, reorderStock, fullStock] = await Promise.all([
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      include: {
        variant: { include: { product: true, color: true, size: true } },
        warehouse: true,
        location: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.productVariant.findMany({
      where: { isDeleted: false, product: { tenantId: user.tenantId, isDeleted: false } },
      include: { product: true, color: true, size: true },
      orderBy: { sku: 'asc' },
    }),
    prisma.stockMovement.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { occurredAt: 'desc' },
      take: 40,
      include: {
        variant: { include: { product: true, color: true, size: true } },
        warehouse: true,
        location: true,
        user: { select: { nameAr: true, name: true } },
        reversedBy: { select: { id: true } },
      },
    }),

    // الخامات والمستلزمات — الرولات والأحبار والخيوط. المخزون لا يكتمل
    // بالمنتجات وحدها: رولٌ يوشك على النفاد يوقف خط الإنتاج، ولم يكن يظهر
    // هنا. الآن المنتج والخامة في شاشة واحدة.
    seeSupplies
      ? prisma.supply.findMany({
          where: { tenantId: user.tenantId, isDeleted: false },
          orderBy: [{ kind: 'asc' }, { nameAr: 'asc' }],
        })
      : [],
    seeSupplies
      ? prisma.supplyTransaction.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { txDate: 'desc' },
          take: 20,
          include: {
            supply: { select: { nameAr: true, unit: true } },
            user: { select: { nameAr: true, name: true } },
          },
        })
      : [],

    // جدول النواقص: كل رصيد منتج له حدٌّ أدنى مضبوط — غير مقيّد بالـ100 المعروضة
    // في تبويب الأرصدة، فجدول «ما يجب طلبه» يجب أن يكون كاملاً لا عيّنة.
    prisma.stock.findMany({
      where: { minStock: { gt: 0 }, variant: { product: { tenantId: user.tenantId } } },
      include: {
        variant: { include: { product: true, color: true, size: true } },
        warehouse: { select: { nameAr: true } },
      },
    }),

    // الجرد الكامل: كل رصيد بلا استثناء — بالدست والقطعة، والتكلفة والقيمة.
    prisma.stock.findMany({
      where: { variant: { product: { tenantId: user.tenantId } } },
      include: {
        variant: { include: { product: true, color: true, size: true } },
        warehouse: { select: { nameAr: true } },
      },
      orderBy: { variant: { sku: 'asc' } },
    }),
  ]);

  // ملخّص الخامات: كم صنفاً، وكم تحت الحد، وكم نفد.
  const lowSupplies = supplies.filter(
    (s) => dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock)),
  );
  const emptySupplies = lowSupplies.filter((s) => dec(s.onHand).lte(dec(0)));

  const SUPPLY_TX_AR: Record<string, string> = {
    PURCHASE: 'شراء',
    RECEIPT: 'استلام',
    CONSUME: 'استهلاك إنتاج',
    ADJUSTMENT: 'تسوية',
  };

  // Decimal arithmetic — `+` on Decimal would stringify and concatenate.
  const totals = stock.reduce(
    (acc, s) => ({
      onHand: acc.onHand.plus(dec(s.onHand)),
      reserved: acc.reserved.plus(dec(s.reserved)),
      damaged: acc.damaged.plus(dec(s.damaged)),
    }),
    { onHand: dec(0), reserved: dec(0), damaged: dec(0) },
  );

  const lowStock = stock.filter(
    (s) => dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock)),
  );

  // جدول إعادة الطلب: كل منتج وخامة تحت الحدّ الأدنى، مع مقدار النقص
  // (الحدّ − الرصيد)، منتجات وخامات في قائمة واحدة، الأسوأ نقصاً أولاً.
  // هذا هو «الجدول» الذي يتصرّف عليه المالك: ماذا نطلب، وكم.
  type ReorderRow = {
    key: string;
    kind: 'منتج' | 'خامة';
    label: string;
    where: string;
    onHand: ReturnType<typeof dec>;
    minStock: ReturnType<typeof dec>;
    shortfall: ReturnType<typeof dec>;
    unit: string;
    empty: boolean;
  };
  const reorderRows: ReorderRow[] = [
    ...reorderStock
      .filter((s) => dec(s.onHand).lte(dec(s.minStock)))
      .map((s) => ({
        key: `st-${s.id}`,
        kind: 'منتج' as const,
        label: variantLabel(s.variant),
        where: s.warehouse.nameAr,
        onHand: dec(s.onHand),
        minStock: dec(s.minStock),
        shortfall: dec(s.minStock).minus(dec(s.onHand)),
        unit: 'قطعة',
        empty: dec(s.onHand).lte(0),
      })),
    ...(seeSupplies ? lowSupplies : []).map((s) => ({
      key: `sp-${s.id}`,
      kind: 'خامة' as const,
      label: s.nameAr,
      where: '—',
      onHand: dec(s.onHand),
      minStock: dec(s.minStock),
      shortfall: dec(s.minStock).minus(dec(s.onHand)),
      unit: s.unit ?? '—',
      empty: dec(s.onHand).lte(0),
    })),
  ].sort((a, b) => b.shortfall.minus(a.shortfall).toNumber());

  // الجرد الكامل: كل رصيد بالدست والقطعة، حسب قطع دستة كل منتج.
  const stocktakeRows = fullStock.map((s) => {
    const ppd = s.variant.product.piecesPerDozen || 12;
    const onHandNum = Math.max(0, Math.trunc(dec(s.onHand).toNumber()));
    const dozens = Math.floor(onHandNum / ppd);
    const looseP = onHandNum - dozens * ppd;
    const unitCost = s.variant.cost ?? s.variant.product.cost ?? null;
    const value = unitCost !== null ? dec(s.onHand).times(dec(unitCost)) : null;
    const isOut = dec(s.onHand).lte(0);
    const isLow = !isOut && dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock));
    return {
      id: s.id,
      label: variantLabel(s.variant),
      warehouse: s.warehouse.nameAr,
      ppd,
      dozens,
      looseP,
      onHand: s.onHand,
      unitCost,
      value,
      status: isOut ? ('نفد' as const) : isLow ? ('قارب على النفاد' as const) : ('متوفّر' as const),
      tone: isOut ? ('bad' as const) : isLow ? ('bad' as const) : ('ok' as const),
    };
  });
  const stocktakeValue = stocktakeRows.reduce((sum, r) => (r.value ? sum.plus(r.value) : sum), dec(0));

  return (
    <AppShell user={user} title="المخزون">
      <ModuleHeader
        title="المخزون"
        count={stock.length}
        action={
          canWrite ? (
            <MovementModal
              variants={variants.map((v) => ({ value: v.id, label: variantLabel(v), perDozen: v.product.piecesPerDozen || 12 }))}
            />
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="رصيد المنتجات" value={totals.onHand} />
        <Metric label="محجوز للبيع" value={totals.reserved} />
        <Metric label="منتجات تحت الحد" value={lowStock.length} tone={lowStock.length > 0 ? 'bad' : 'muted'} />
        {seeSupplies && (
          <Metric
            label="خامات قاربت على النفاد"
            value={lowSupplies.length}
            tone={lowSupplies.length > 0 ? 'bad' : 'muted'}
          />
        )}
      </div>

      {/* The movement form used to sit in a side column here. It is now the
          modal above — the tables get the full width, which matters for a
          ledger the operator actually reads. */}
      {/* تبويبات داخلية: المخزون كله من فوق بلا تمرير طويل — أرصدة المنتجات،
          والخامات، وسجل الحركات، كلٌّ بضغطة. */}
      <SegmentedTabs
        tabs={[
          {
            key: 'stocktake',
            label: 'الجرد الكامل',
            content: (
              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-brand">جرد المخزن كاملاً — بالدست والقطعة</h3>
                  <span className="text-[0.7rem] text-txt-4">
                    {stocktakeRows.length} صنف · القيمة الإجمالية <span className="tnum font-semibold text-brand">{formatMoney(stocktakeValue)}</span>
                  </span>
                </div>
                <Table
                  headers={['المنتج / المتغيّر', 'المخزن', 'الدست', 'قطعة زيادة', 'إجمالي القطع', 'قطع الدستة', 'تكلفة القطعة', 'القيمة', 'الحالة']}
                  empty={stocktakeRows.length === 0}
                >
                  {stocktakeRows.map((r) => (
                    <tr key={r.id} className="hover:bg-card-2">
                      <td className="px-4 py-3 text-txt">{r.label}</td>
                      <td className="px-4 py-3 text-txt-3">{r.warehouse}</td>
                      <td className="tnum px-4 py-3 font-semibold text-txt">{r.dozens}</td>
                      <td className="tnum px-4 py-3 text-txt-2">{r.looseP}</td>
                      <td className="tnum px-4 py-3 text-txt-2">{formatQty(r.onHand)}</td>
                      <td className="tnum px-4 py-3 text-txt-4">{r.ppd}</td>
                      <td className="tnum px-4 py-3 text-txt-3">
                        {r.unitCost === null ? <span className="text-warn">—</span> : formatMoney(r.unitCost)}
                      </td>
                      <td className="tnum px-4 py-3 font-medium text-brand">
                        {r.value === null ? '—' : formatMoney(r.value)}
                      </td>
                      <td className="px-4 py-3"><Badge tone={r.tone}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </Table>
                <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
                  «الدست» و«قطعة زيادة» محسوبان من إجمالي القطع على أساس قطع دستة كل منتج
                  (تُضبط من صفحة المنتج). القيمة = إجمالي القطع × تكلفة القطعة.
                </p>
              </section>
            ),
          },
          {
            key: 'reorder',
            label: 'نواقص وإعادة الطلب',
            badge: reorderRows.length,
            content: (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-brand">جدول ما يجب طلبه</h3>
                  <span className="text-[0.7rem] text-txt-4">
                    {reorderRows.length === 0
                      ? 'كل الأصناف فوق حدّها الأدنى'
                      : `${reorderRows.length} صنف تحت الحدّ · ${reorderRows.filter((r) => r.empty).length} نفد`}
                  </span>
                </div>
                <Table
                  headers={['الصنف', 'النوع', 'الموقع', 'الرصيد', 'الحدّ الأدنى', 'النقص', 'الحالة']}
                  empty={reorderRows.length === 0}
                >
                  {reorderRows.map((r) => (
                    <tr key={r.key} className="hover:bg-card-2">
                      <td className="px-4 py-3 text-txt">{r.label}</td>
                      <td className="px-4 py-3 text-txt-3">{r.kind}</td>
                      <td className="px-4 py-3 text-txt-3">{r.where}</td>
                      <td className={`tnum px-4 py-3 font-medium ${r.empty ? 'text-bad' : 'text-txt-2'}`}>
                        {formatQty(r.onHand)}
                      </td>
                      <td className="tnum px-4 py-3 text-txt-3">{formatQty(r.minStock)}</td>
                      <td className="tnum px-4 py-3 font-semibold text-bad">
                        {formatQty(r.shortfall)} {r.unit}
                      </td>
                      <td className="px-4 py-3">
                        {r.empty ? <Badge tone="bad">نفد</Badge> : <Badge tone="bad">قارب على النفاد</Badge>}
                      </td>
                    </tr>
                  ))}
                </Table>
                <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
                  النقص = الحدّ الأدنى − الرصيد الحالي — أي الكمية اللازمة لبلوغ الحدّ. القائمة
                  كاملة (كل الأصناف ذات حدٍّ أدنى)، لا عيّنة من المعروض في تبويب الأرصدة. الأصناف
                  بلا حدٍّ أدنى مضبوط لا تظهر هنا — اضبط حدَّها ليُنبّهك النظام قبل نفادها.
                </p>
              </section>
            ),
          },
          {
            key: 'balances',
            label: 'أرصدة المنتجات',
            badge: lowStock.length,
            content: (
              <section>
            <Table
              headers={['المنتج / المتغيّر', 'المخزن', 'الموقع', 'الرصيد', 'محجوز', 'المتاح', 'تالف', 'قيمة الرصيد', 'الحد الأدنى']}
              empty={stock.length === 0}
            >
              {stock.map((s) => {
                const atp = available(s.onHand, s.reserved);
                const unitCost = s.variant.cost ?? s.variant.product.cost ?? null;
                return (
                <tr key={s.id} className="hover:bg-card-2">
                  <td className="px-4 py-3 text-txt">{variantLabel(s.variant)}</td>
                  <td className="px-4 py-3 text-txt-2">{s.warehouse.nameAr}</td>
                  <td dir="ltr" className="px-4 py-3 text-start text-txt-3">
                    {s.location?.code ?? '—'}
                  </td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatQty(s.onHand)}</td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatQty(s.reserved)}</td>
                  {/* المتاح = الرصيد − المحجوز */}
                  <td className={`tnum px-4 py-3 font-medium ${atp.lte(0) ? 'text-bad' : 'text-txt'}`}>
                    {formatQty(atp)}
                  </td>
                  <td className="tnum px-4 py-3 text-txt-2">{formatQty(s.damaged)}</td>
                  {/* قيمة الرصيد بالتكلفة — تكلفة المتغيّر ثم المنتج. المجهولة تُعرض
                      «—» لا صفراً، فالصفر يبدو قياساً وهو ليس كذلك. */}
                  <td className="tnum px-4 py-3 text-txt-2">
                    {unitCost === null ? (
                      <span className="text-txt-4">—</span>
                    ) : (
                      formatMoney(dec(s.onHand).times(dec(unitCost)))
                    )}
                  </td>
                  <td className="tnum px-4 py-3">
                    {dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock)) ? (
                      <Badge tone="bad">{formatQty(s.minStock)}</Badge>
                    ) : (
                      <span className="text-txt-3">{formatQty(s.minStock)}</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </Table>
              </section>
            ),
          },
          {
            key: 'movements',
            label: 'سجل حركات المنتجات',
            content: (
              <section>
            <Table
              headers={['التاريخ', 'المتغيّر', 'النوع', 'الكمية', 'المخزن', 'المرجع', 'المستخدم', '']}
              empty={movements.length === 0}
            >
              {movements.map((m) => (
                <tr key={m.id} className={m.reversedBy ? 'opacity-55 hover:bg-card-2' : 'hover:bg-card-2'}>
                  <td className="tnum px-4 py-3 text-txt-3">
                    {m.occurredAt.toLocaleDateString('ar-EG')}
                  </td>
                  <td className="px-4 py-3 text-txt-2">{variantLabel(m.variant)}</td>
                  <td className="px-4 py-3 text-txt-2">{TYPE_LABELS[m.type] ?? m.type}</td>
                  <td
                    className={`tnum px-4 py-3 font-medium ${dec(m.quantity).isNegative() ? 'text-bad' : 'text-ok'}`}
                  >
                    {dec(m.quantity).gt(0) ? `+${formatQty(m.quantity)}` : formatQty(m.quantity)}
                  </td>
                  <td className="px-4 py-3 text-txt-3">{m.warehouse.nameAr}</td>
                  <td className="px-4 py-3 text-txt-3">{m.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-txt-3">{m.user?.nameAr ?? m.user?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-end">
                    {canWrite && !m.reversedBy && m.type !== 'REVERSAL' && (
                      <form action={reverseMovement.bind(null, m.id)}>
                        <button type="submit" className="text-xs text-brand hover:underline">
                          عكس
                        </button>
                      </form>
                    )}
                    {m.reversedBy && <span className="text-[0.7rem] text-txt-4">معكوسة</span>}
                  </td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-[0.7rem] text-txt-4">
              الحركات لا تُحذف نهائياً — التصحيح يتم بحركة عكسية تُشير إلى الأصلية.
            </p>
              </section>
            ),
          },
          ...(seeSupplies
            ? [
                {
                  key: 'supplies',
                  label: 'الخامات والمستلزمات',
                  badge: lowSupplies.length,
                  content: (
                    <>
                      <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-brand">أرصدة الخامات</h3>
                <span className="text-[0.7rem] text-txt-4">
                  {supplies.length} صنف
                  {lowSupplies.length > 0 && (
                    <span className="text-bad"> · {lowSupplies.length} قارب على النفاد</span>
                  )}
                  {emptySupplies.length > 0 && (
                    <span className="text-bad"> · {emptySupplies.length} نفد</span>
                  )}
                </span>
              </div>
              <Table
                headers={['الخامة', 'النوع', 'الوحدة', 'الرصيد', 'الحد الأدنى', 'الحالة']}
                empty={supplies.length === 0}
              >
                {supplies.map((s) => {
                  const empty = dec(s.onHand).lte(dec(0));
                  const low = dec(s.minStock).gt(0) && dec(s.onHand).lte(dec(s.minStock));
                  return (
                    <tr key={s.id} className="hover:bg-card-2">
                      <td className="px-4 py-3 text-txt">{s.nameAr}</td>
                      <td className="px-4 py-3 text-txt-3">{s.kind}</td>
                      <td className="px-4 py-3 text-txt-3">{s.unit ?? '—'}</td>
                      <td className={`tnum px-4 py-3 font-medium ${empty ? 'text-bad' : 'text-txt-2'}`}>
                        {formatQty(s.onHand)}
                      </td>
                      <td className="tnum px-4 py-3 text-txt-3">{formatQty(s.minStock)}</td>
                      <td className="px-4 py-3">
                        {empty ? (
                          <Badge tone="bad">نفد</Badge>
                        ) : low ? (
                          <Badge tone="bad">قارب على النفاد</Badge>
                        ) : (
                          <Badge tone="ok">متوفّر</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </section>

          {supplyTx.length > 0 && (
            <section className="mt-6">
              <h3 className="mb-3 text-sm font-semibold text-brand">حركات الخامات الأخيرة</h3>
              <Table
                headers={['التاريخ', 'الخامة', 'النوع', 'الكمية', 'المرجع', 'المستخدم']}
                empty={supplyTx.length === 0}
              >
                {supplyTx.map((t) => (
                  <tr key={t.id} className="hover:bg-card-2">
                    <td className="tnum px-4 py-3 text-txt-3">{t.txDate.toLocaleDateString('ar-EG')}</td>
                    <td className="px-4 py-3 text-txt-2">{t.supply.nameAr}</td>
                    <td className="px-4 py-3 text-txt-2">{SUPPLY_TX_AR[t.type] ?? t.type}</td>
                    <td className={`tnum px-4 py-3 font-medium ${dec(t.quantity).isNegative() ? 'text-bad' : 'text-ok'}`}>
                      {dec(t.quantity).gt(0) ? `+${formatQty(t.quantity)}` : formatQty(t.quantity)}
                      {t.supply.unit ? ` ${t.supply.unit}` : ''}
                    </td>
                    <td className="px-4 py-3 text-txt-3">
                      {t.productionOrderId ? 'أمر إنتاج' : t.goodsReceiptLineId ? 'استلام شراء' : '—'}
                    </td>
                    <td className="px-4 py-3 text-txt-3">{t.user?.nameAr ?? t.user?.name ?? '—'}</td>
                  </tr>
                ))}
              </Table>
              <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
                الاستهلاك يُخصم تلقائياً عند تنفيذ أمر الإنتاج، والشراء يُضاف عند الاستلام —
                فالخامة والمنتج يتحرّكان معاً بلا إدخال يدوي.
              </p>
            </section>
          )}
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />
    </AppShell>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: Numeric;
  tone?: 'bad' | 'muted';
}) {
  return (
    <div className="erp-card p-5">
      <p className="text-xs text-txt-3">{label}</p>
      <p className={`tnum mt-2 text-2xl font-semibold ${tone === 'bad' ? 'text-bad' : 'text-brand'}`}>
        {formatQty(value)}
      </p>
    </div>
  );
}
