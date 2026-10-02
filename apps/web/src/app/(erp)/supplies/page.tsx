import type { Metadata } from 'next';
import Link from 'next/link';
import {
  dec,
  formatMoney,
  formatQty,
  SUPPLY_KINDS,
  SUPPLY_KIND_AR,
  SUPPLY_CATEGORY_AR,
  SUPPLY_TX_TYPE_AR,
  PRICE_SERVICE_AR,
  type SupplyKind, userCan,} from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { monthRange, dateInput } from '@/lib/ops';
import { SupplyForm, TransactionForm } from './SupplyForms';
import {
  unpostedSupplyPurchases,
  perPieceOf,
  serviceOfDescription,
  SERVICES_OF_SUPPLY_KIND,
} from '@/lib/supplies';
import { createSupply, recordSupplyTransaction, updateSupply, deleteSupply, postPastSupplyPurchases } from './actions';
import { SupplyEditModal } from './SupplyEditModal';

export const metadata: Metadata = { title: 'المستلزمات' };

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('supplies.view');
  // رابط أمر الإنتاج لمن يملك فتحه — وإلا رقمٌ نصّي. كان يردّ أمين
  // المخزن من حيث أتى بلا رسالة على أكثر شاشاته استعمالاً.
  const canSeeProduction = userCan(user.role, user.overrides, 'manufacturing.view');
  const seeCosts = userCan(user.role, user.overrides, 'cost.view');
  const params = await searchParams;
  const kindFilter = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const month = monthRange(Array.isArray(params.month) ? params.month[0] : params.month);

  const [supplies, transactions, monthSpend, orders] = await Promise.all([
    prisma.supply.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        ...(kindFilter ? { kind: kindFilter } : {}),
      },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    }),
    prisma.supplyTransaction.findMany({
      where: { tenantId: user.tenantId, txDate: { gte: month.from, lte: month.to } },
      orderBy: { txDate: 'desc' },
      take: 40,
      include: {
        supply: { select: { code: true, nameAr: true, unit: true, kind: true } },
        productionOrder: { select: { id: true, number: true } },
      },
    }),
    // Monthly spend, split by department — the figure the business asked to
    // be able to see.
    prisma.supplyTransaction.groupBy({
      by: ['type'],
      where: { tenantId: user.tenantId, txDate: { gte: month.from, lte: month.to } },
      _sum: { totalCost: true },
    }),
    prisma.productionOrder.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['CANCELLED'] } },
      select: { id: true, number: true },
      orderBy: { number: 'desc' },
      take: 100,
    }),
  ]);

  const canWrite = allows(user, 'supplies.write');

  // مشتريات سابقة لم تُحسب في المصروفات — تُعرض على المالك وحده ليقرّر.
  const unposted =
    seeCosts && allows(user, 'expenses.approve') ? await unpostedSupplyPurchases(user.tenantId) : [];
  const unpostedTotal = unposted.reduce((s, t) => s.plus(dec(t.totalCost)), dec(0));

  // ── الاستهلاك المحسوب (بطلب المالك: يُحسب ولا يمسّ الرصيد) ──
  // قطع الشهر حسب الخدمة من بنود الفواتير الصادرة، × «استهلاك القطعة» لكل
  // مستلزم. عرضٌ وحده: لا حركة تُسجَّل ولا رصيد ينقص.
  const monthLines = await prisma.invoiceLine.findMany({
    where: {
      variantId: { not: null },
      invoice: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: month.from, lte: month.to },
      },
    },
    select: { description: true, quantity: true },
  });
  const piecesBy = new Map<string, number>();
  for (const l of monthLines) {
    const svc = serviceOfDescription(l.description) ?? 'UNKNOWN';
    piecesBy.set(svc, (piecesBy.get(svc) ?? 0) + Number(l.quantity));
  }
  const piecesFor = (kind: string) =>
    (SERVICES_OF_SUPPLY_KIND[kind] ?? []).reduce((n, s) => n + (piecesBy.get(s) ?? 0), 0);
  const anyPerPiece = supplies.some((s) => perPieceOf(s.notes) !== null);

  const purchases = dec(monthSpend.find((g) => g.type === 'PURCHASE')?._sum.totalCost ?? 0);
  const consumption = dec(monthSpend.find((g) => g.type === 'CONSUMPTION')?._sum.totalCost ?? 0);

  const spendByKind = SUPPLY_KINDS.map((kind) => ({
    kind,
    total: transactions
      .filter((t) => t.type === 'PURCHASE' && t.supply.kind === kind)
      .reduce((s, t) => s.plus(dec(t.totalCost)), dec(0)),
  }));

  return (
    <AppShell user={user} title="مستلزمات الطباعة والتطريز">
      <ModuleHeader title="مستلزمات الطباعة والتطريز" count={supplies.length} />

      <section className="erp-card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-brand">إنفاق الشهر</h3>
          <span className="tnum text-xs text-txt-3">{month.key}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* أرقام الإنفاق للمدير وحده — أمين المخزن يتابع الأرصدة لا الأسعار. */}
          {seeCosts ? (
            <>
              <Figure label="مشتريات" value={formatMoney(purchases)} strong />
              <Figure label="استهلاك محمَّل" value={formatMoney(consumption)} />
              {spendByKind.map((s) => (
                <Figure key={s.kind} label={`مشتريات ${SUPPLY_KIND_AR[s.kind]}`} value={formatMoney(s.total)} />
              ))}
            </>
          ) : (
            <Figure label="حركات هذا الشهر" value={`${transactions.length} حركة`} />
          )}
        </div>
        <p className="mt-3 text-[0.7rem] text-txt-4">
          «مشتريات» هو ما خرج من الخزينة هذا الشهر، ويُقيَّد كل شراءٍ تلقائياً في المصروفات
          («مستلزمات ولوازم») فيُخصم من الربح. «استهلاك» هو ما احترق في الإنتاج — الرقمان
          مختلفان عمداً، ودمجهما يُخفي المخزون الراكد.
        </p>
      </section>

      {unposted.length > 0 && (
        <form
          action={postPastSupplyPurchases}
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn bg-warn-soft px-4 py-3"
        >
          <p className="text-xs leading-[1.9] text-warn">
            {unposted.length} شراء مستلزمات سابق بمبلغ {formatMoney(unpostedTotal)} لم يُحسب في
            المصروفات. إن كنت سجّلته بيدك في المصروفات فلا تضغط — يتكرّر.
          </p>
          <button type="submit" className="erp-btn">
            احسبها في المصروفات
          </button>
        </form>
      )}

      {/* قطع الشهر حسب الخدمة — أساس الاستهلاك المحسوب في الجدول أدناه. */}
      <section className="erp-card mb-6 p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-brand">قطع الشهر حسب الخدمة</h3>
          <span className="tnum text-xs text-txt-3">{month.key}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-txt-2">
          {(['EMBROIDERY', 'PRINTING', 'DTF'] as const).map((s) => (
            <span key={s} className="rounded-full border border-line-2 px-3 py-1.5">
              {PRICE_SERVICE_AR[s]}: <strong className="tnum">{piecesBy.get(s) ?? 0}</strong> قطعة
            </span>
          ))}
          {(piecesBy.get('UNKNOWN') ?? 0) > 0 && (
            <span className="rounded-full border border-warn px-3 py-1.5 text-warn">
              بلا خدمة محدّدة: <strong className="tnum">{piecesBy.get('UNKNOWN')}</strong>
            </span>
          )}
        </div>
        <p className="mt-3 text-[0.7rem] leading-[1.9] text-txt-4">
          {anyPerPiece
            ? 'المحسوب في الجدول = هذه القطع × «استهلاك القطعة» لكل مستلزم (الخيط للتطريز، والحبر والفلم للطباعة) — حسابٌ فقط، لا يُنزَّل من الرصيد ولا يسجّل حركة.'
            : 'اكتب «استهلاك القطعة» لكل مستلزم من «تعديل» ليُحسب كم استهلكت مبيعات الشهر وكم قطعة يكفي الرصيد — حسابٌ فقط، لا يمسّ الرصيد.'}
        </p>
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/supplies"
          className={
            kindFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {SUPPLY_KINDS.map((k) => (
          <Link
            key={k}
            href={`/supplies?kind=${k}`}
            className={
              kindFilter === k
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {SUPPLY_KIND_AR[k]}
          </Link>
        ))}
      </div>

      <Table
        headers={[
          'الكود', 'الاسم', 'النوع', 'الفئة', 'الرصيد', 'الوحدة',
          ...(seeCosts ? ['آخر سعر'] : []),
          'الحد الأدنى',
          ...(anyPerPiece ? ['استهلاك القطعة', 'محسوب للشهر', 'يكفي لـ'] : []),
          ...(canWrite ? [''] : []),
        ]}
        empty={supplies.length === 0}
      >
        {supplies.map((s) => {
          // lte لا lt: الرصيد المساوي للحد الأدنى هو نقطة إعادة الطلب نفسها.
          // lt تصمت عند الحد بالضبط وتنبّه بعد تجاوزه — بعد فوات غرضه.
          const low = dec(s.onHand).lte(dec(s.minStock)) && dec(s.minStock).gt(0);
          return (
            <tr key={s.id} className="hover:bg-card-2">
              <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
                {s.code}
              </td>
              <td className="px-4 py-3 text-txt-2">{s.nameAr}</td>
              <td className="px-4 py-3 text-txt-3">
                {(SUPPLY_KIND_AR as Record<string, string>)[s.kind] ?? s.kind}
              </td>
              <td className="px-4 py-3 text-txt-3">
                {SUPPLY_CATEGORY_AR[s.category] ?? s.category}
              </td>
              <td className="tnum px-4 py-3">
                {low ? (
                  <Badge tone="bad">{formatQty(s.onHand)}</Badge>
                ) : (
                  <span className="text-txt-2">{formatQty(s.onHand)}</span>
                )}
              </td>
              <td className="px-4 py-3 text-txt-3">{s.unit ?? '—'}</td>
              {seeCosts && (
                <td className="tnum px-4 py-3 text-txt-3">
                  {s.lastUnitCost === null ? '—' : formatMoney(s.lastUnitCost)}
                </td>
              )}
              <td className="tnum px-4 py-3 text-txt-4">{formatQty(s.minStock)}</td>
              {anyPerPiece &&
                (() => {
                  const perPiece = perPieceOf(s.notes);
                  if (perPiece === null) {
                    return (
                      <>
                        <td className="px-4 py-3 text-txt-4">—</td>
                        <td className="px-4 py-3 text-txt-4">—</td>
                        <td className="px-4 py-3 text-txt-4">—</td>
                      </>
                    );
                  }
                  return (
                    <>
                      <td className="tnum px-4 py-3 text-txt-3">
                        {perPiece} {s.unit ?? ''}
                      </td>
                      <td className="tnum px-4 py-3 text-txt-2">
                        {formatQty(dec(perPiece).times(piecesFor(s.kind)))} {s.unit ?? ''}
                      </td>
                      <td className="tnum px-4 py-3 font-medium text-brand">
                        {Math.max(0, Math.floor(Number(s.onHand) / perPiece))} قطعة
                      </td>
                    </>
                  );
                })()}
              {canWrite && (
                <td className="px-4 py-3 text-end">
                  <div className="flex items-center justify-end gap-3">
                    <SupplyEditModal
                      action={updateSupply.bind(null, s.id)}
                      defaults={{
                        nameAr: s.nameAr,
                        kind: s.kind as SupplyKind,
                        category: s.category,
                        unit: s.unit ?? '',
                        minStock: Number(s.minStock),
                        perPiece: perPieceOf(s.notes),
                      }}
                    />
                    <form action={deleteSupply.bind(null, s.id)}>
                      <button type="submit" className="text-xs text-bad hover:underline">
                        حذف
                      </button>
                    </form>
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </Table>

      {canWrite && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="erp-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-brand">تسجيل حركة</h3>
            <TransactionForm
              action={recordSupplyTransaction}
              today={dateInput(new Date())}
              supplies={supplies.map((s) => ({
                value: s.id,
                label: `${s.nameAr} (${s.code})`,
              }))}
              productionOrders={orders.map((o) => ({ value: o.id, label: o.number }))}
            />
          </section>

          <section className="erp-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-brand">إضافة مستلزم</h3>
            <SupplyForm action={createSupply} />
          </section>
        </div>
      )}

      <section className="mt-8">
        <h3 className="mb-3 text-sm font-semibold text-brand">حركات {month.key}</h3>
        <Table
          headers={['التاريخ', 'المستلزم', 'الحركة', 'الكمية', ...(seeCosts ? ['تكلفة الوحدة', 'الإجمالي'] : []), 'أمر الإنتاج']}
          empty={transactions.length === 0}
        >
          {transactions.map((t) => (
            <tr key={t.id}>
              <td className="tnum px-4 py-3 text-txt-3">{t.txDate.toLocaleDateString('ar-EG')}</td>
              <td className="px-4 py-3 text-txt-2">
                {t.supply.nameAr}
                <span dir="ltr" className="ms-2 text-[0.7rem] text-txt-4">
                  {t.supply.code}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={t.type === 'PURCHASE' ? 'text-ok' : 'text-warn'}>
                  {(SUPPLY_TX_TYPE_AR as Record<string, string>)[t.type] ?? t.type}
                </span>
              </td>
              <td className="tnum px-4 py-3 text-txt-2">
                {formatQty(t.quantity)} {t.supply.unit ?? ''}
              </td>
              {seeCosts && (
                <>
                  <td className="tnum px-4 py-3 text-txt-3">{formatMoney(t.unitCost)}</td>
                  <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(t.totalCost)}</td>
                </>
              )}
              <td className="tnum px-4 py-3">
                {t.productionOrder ? (
                  canSeeProduction ? (
                  <Link
                    href={`/manufacturing/${t.productionOrder.id}`}
                    dir="ltr"
                    className="text-brand hover:underline"
                  >
                    {t.productionOrder.number}
                  </Link>
                  ) : (
                    <span dir="ltr" className="text-txt-3">{t.productionOrder.number}</span>
                  )
                ) : (
                  <span className="text-txt-4">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </AppShell>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-[0.7rem] text-txt-3">{label}</p>
      <p className={`tnum mt-1 ${strong ? 'text-lg font-semibold text-brand' : 'text-base text-txt'}`}>
        {value}
      </p>
    </div>
  );
}
