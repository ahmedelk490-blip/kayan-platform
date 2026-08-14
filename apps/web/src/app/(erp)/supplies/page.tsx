import type { Metadata } from 'next';
import Link from 'next/link';
import {
  can,
  dec,
  formatMoney,
  formatQty,
  SUPPLY_KINDS,
  SUPPLY_KIND_AR,
  SUPPLY_CATEGORY_AR,
  SUPPLY_TX_TYPE_AR,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { monthRange, dateInput } from '@/lib/ops';
import { SupplyForm, TransactionForm } from './SupplyForms';
import { createSupply, recordSupplyTransaction } from './actions';

export const metadata: Metadata = { title: 'المستلزمات' };

export default async function SuppliesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('supplies.view');
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

  const canWrite = can(user.role, 'supplies.write');

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
          <Figure label="مشتريات" value={formatMoney(purchases)} strong />
          <Figure label="استهلاك محمَّل" value={formatMoney(consumption)} />
          {spendByKind.map((s) => (
            <Figure key={s.kind} label={`مشتريات ${SUPPLY_KIND_AR[s.kind]}`} value={formatMoney(s.total)} />
          ))}
        </div>
        <p className="mt-3 text-[0.7rem] text-txt-4">
          «مشتريات» هو ما خرج من الخزينة هذا الشهر. «استهلاك» هو ما احترق في الإنتاج —
          الرقمان مختلفان عمداً، ودمجهما يُخفي المخزون الراكد.
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
        headers={['الكود', 'الاسم', 'النوع', 'الفئة', 'الرصيد', 'الوحدة', 'آخر سعر', 'الحد الأدنى']}
        empty={supplies.length === 0}
      >
        {supplies.map((s) => {
          const low = dec(s.onHand).lt(dec(s.minStock)) && dec(s.minStock).gt(0);
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
              <td className="tnum px-4 py-3 text-txt-3">
                {s.lastUnitCost === null ? '—' : formatMoney(s.lastUnitCost)}
              </td>
              <td className="tnum px-4 py-3 text-txt-4">{formatQty(s.minStock)}</td>
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
          headers={['التاريخ', 'المستلزم', 'الحركة', 'الكمية', 'تكلفة الوحدة', 'الإجمالي', 'أمر الإنتاج']}
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
              <td className="tnum px-4 py-3 text-txt-3">{formatMoney(t.unitCost)}</td>
              <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(t.totalCost)}</td>
              <td className="tnum px-4 py-3">
                {t.productionOrder ? (
                  <Link
                    href={`/manufacturing/${t.productionOrder.id}`}
                    dir="ltr"
                    className="text-brand hover:underline"
                  >
                    {t.productionOrder.number}
                  </Link>
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
