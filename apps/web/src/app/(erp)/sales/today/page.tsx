import type { Metadata } from 'next';
import Link from 'next/link';
import { dec } from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { isDeliveryDesc } from '@/lib/delivery';
import type { SearchParams } from '@/lib/query';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { ReportFilter } from '../../reports/Shell';
import { resolveRange } from '../../reports/range';
import { RefreshEvery } from './RefreshEvery';

export const metadata: Metadata = { title: 'قطع اليوم' };
export const dynamic = 'force-dynamic';

const OFFSET = 3 * 60 * 60 * 1000; // بغداد UTC+3
const DAY = 24 * 60 * 60 * 1000;
const keyOf = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 10);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * قطع الموظفين.
 *
 * بطلب المالك شاشتان في صفحة واحدة:
 *  - المندوب: «قطع اليوم» فقط — اليوم الحالي، بلا تاريخ ولا رجوع لأيام سابقة،
 *    يصفّر منتصف ليل بغداد. أي تاريخ في الرابط يُتجاهل على الخادم.
 *  - المالك/المدير (reports.view): نفس الجدول بمدى «من / إلى» واختصارات (اليوم،
 *    أمس، آخر 7 أيام، الشهر)، والضغط على موظف يعرض قطعه حسب المنتج.
 *
 * القطع = كميات أسطر الفواتير التي أنشأها الموظف وأُصدرت في المدة — بلا
 * المسودّات والملغاة وبلا سطر أجور التوصيل (مال لا بضاعة).
 */
export default async function TodayPiecesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('sales.view');
  const canRange = allows(user, 'reports.view');
  const params = await searchParams;

  // اليوم الحالي (بغداد) — الافتراضي للجميع، والوحيد للمندوب.
  const todayKey = keyOf(Date.now());
  const [y, m, d] = todayKey.split('-').map(Number);
  const todayStart = new Date(Date.UTC(y, m - 1, d) - OFFSET);

  let from = todayStart;
  let to = new Date(todayStart.getTime() + DAY - 1);
  let fromStr = todayKey;
  let toStr = todayKey;
  let period: Parameters<typeof ReportFilter>[0]['period'] = null;
  if (canRange && (one(params.from) || one(params.period))) {
    const r = resolveRange(params);
    ({ from, to, fromStr, toStr, period } = r);
  }
  const isToday = fromStr === todayKey && toStr === todayKey;
  const rep = canRange ? one(params.rep) : '';

  const dayLabel = (key: string) => {
    const [yy, mm, dd] = key.split('-').map(Number);
    return new Date(Date.UTC(yy, mm - 1, dd)).toLocaleDateString('ar-EG', {
      timeZone: 'UTC',
      weekday: isToday ? 'long' : undefined,
      day: 'numeric',
      month: 'long',
    });
  };
  const rangeLabel = fromStr === toStr ? dayLabel(fromStr) : `${dayLabel(fromStr)} ← ${dayLabel(toStr)}`;

  const [reps, invoices] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true, role: { key: 'SALES' } },
      select: { id: true, name: true, nameAr: true },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: from, lte: to },
        createdById: { not: null },
      },
      select: {
        createdById: true,
        createdBy: { select: { name: true, nameAr: true } },
        total: true,
        lines: { select: { quantity: true, description: true, product: { select: { nameAr: true } } } },
      },
    }),
  ]);

  // كل مندوب يظهر ولو صفراً؛ ومن باع من غير المندوبين (مدير/كاشير) يظهر أيضاً.
  const rows = new Map<string, { name: string; pieces: number; invoices: number; amount: number }>();
  for (const r of reps) rows.set(r.id, { name: r.nameAr || r.name, pieces: 0, invoices: 0, amount: 0 });
  const byProduct = new Map<string, number>();
  for (const inv of invoices) {
    const id = inv.createdById!;
    const row = rows.get(id) ?? { name: inv.createdBy?.nameAr || inv.createdBy?.name || '—', pieces: 0, invoices: 0, amount: 0 };
    row.invoices += 1;
    row.amount += dec(inv.total).toNumber();
    for (const l of inv.lines) {
      if (isDeliveryDesc(l.description)) continue;
      const q = dec(l.quantity).toNumber();
      row.pieces += q;
      if (id === rep) {
        const key = l.product?.nameAr ?? l.description;
        byProduct.set(key, (byProduct.get(key) ?? 0) + q);
      }
    }
    rows.set(id, row);
  }

  const list = [...rows.entries()]
    .map(([id, r]) => ({ id, ...r, pieces: Math.round(r.pieces) }))
    .sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name, 'ar'));
  const total = list.reduce((s, r) => s + r.pieces, 0);
  const totalInvoices = list.reduce((s, r) => s + r.invoices, 0);
  const totalAmount = list.reduce((s, r) => s + r.amount, 0);
  const mine = list.find((r) => r.id === user.id);
  const repRow = list.find((r) => r.id === rep);
  const fmt = new Intl.NumberFormat('en-US');

  // اختصارات المدى للمالك — روابط from/to جاهزة («هذا الشهر» موجود في أزرار الفترات تحتها).
  const shortcut = (label: string, f: string, t: string) => ({ label, href: `/sales/today?from=${f}&to=${t}`, on: f === fromStr && t === toStr });
  const shortcuts = [
    shortcut('اليوم', todayKey, todayKey),
    shortcut('أمس', keyOf(todayStart.getTime() - DAY), keyOf(todayStart.getTime() - DAY)),
    shortcut('آخر 7 أيام', keyOf(todayStart.getTime() - 6 * DAY), todayKey),
  ];
  const rangeQs = `from=${fromStr}&to=${toStr}`;

  return (
    <AppShell user={user} title={canRange ? 'قطع الموظفين' : 'قطع اليوم'}>
      {/* يحدّث نفسه كل دقيقة لليوم الحالي — فيصفّر وحده بعد منتصف الليل. */}
      {isToday && <RefreshEvery seconds={60} />}
      <ModuleHeader title={`${canRange ? 'قطع الموظفين' : 'قطع اليوم'} — ${rangeLabel}`} />

      {canRange && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                aria-current={s.on ? 'page' : undefined}
                className={
                  s.on
                    ? 'rounded-full bg-brand px-3.5 py-1.5 text-xs text-white'
                    : 'rounded-full border border-line-2 px-3.5 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
                }
              >
                {s.label}
              </Link>
            ))}
          </div>
          <ReportFilter basePath="/sales/today" period={period} from={fromStr} to={toStr} tabs={false} />
        </>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {mine && (
          <div className="erp-card p-5">
            <p className="text-xs text-txt-3">{isToday ? 'قطعك اليوم' : 'قطعك في المدة'}</p>
            <p className="tnum mt-1 text-3xl font-bold text-brand">{fmt.format(mine.pieces)}</p>
            <p className="mt-1 text-xs text-txt-3">من {fmt.format(mine.invoices)} فاتورة</p>
          </div>
        )}
        <div className="erp-card p-5">
          <p className="text-xs text-txt-3">{isToday ? 'إجمالي قطع اليوم' : 'إجمالي القطع في المدة'}</p>
          <p className="tnum mt-1 text-3xl font-bold text-txt">{fmt.format(total)}</p>
          <p className="mt-1 text-xs text-txt-3">
            {canRange
              ? `${fmt.format(totalInvoices)} فاتورة · ${fmt.format(totalAmount)} د.ع`
              : 'يبدأ العدّ من الصفر كل يوم الساعة 12 بالليل.'}
          </p>
        </div>
      </div>

      <Table
        headers={canRange ? ['الموظف', 'القطع', 'الفواتير', 'قيمة المبيعات'] : ['المندوب', 'القطع اليوم', 'الفواتير']}
        empty={list.length === 0}
      >
        {list.map((r) => (
          <tr key={r.id} className={r.id === user.id || r.id === rep ? 'bg-brand-soft' : undefined}>
            <td className="px-4 py-3 font-medium text-txt">
              {canRange ? (
                <Link href={`/sales/today?${rangeQs}&rep=${r.id}`} className="text-brand underline">
                  {r.name}
                </Link>
              ) : (
                r.name
              )}
              {r.id === user.id && <span className="ms-2 text-xs text-brand">(أنت)</span>}
            </td>
            <td className="tnum px-4 py-3 text-base font-semibold text-txt">{fmt.format(r.pieces)}</td>
            <td className="tnum px-4 py-3 text-txt-2">{fmt.format(r.invoices)}</td>
            {canRange && <td className="tnum px-4 py-3 text-txt-2">{fmt.format(r.amount)}</td>}
          </tr>
        ))}
        {list.length > 0 && (
          <tr className="bg-card-2">
            <td className="px-4 py-3 font-semibold text-txt">الإجمالي</td>
            <td className="tnum px-4 py-3 text-base font-bold text-brand">{fmt.format(total)}</td>
            <td className="tnum px-4 py-3 text-txt-2">{fmt.format(totalInvoices)}</td>
            {canRange && <td className="tnum px-4 py-3 text-txt-2">{fmt.format(totalAmount)}</td>}
          </tr>
        )}
      </Table>

      {/* تفصيل الموظف المختار حسب المنتج — للمالك فقط. */}
      {canRange && repRow && (
        <section className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-brand">
            قطع {repRow.name} حسب المنتج — {rangeLabel}
          </h3>
          <Table headers={['المنتج', 'القطع']} empty={byProduct.size === 0}>
            {[...byProduct.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, q]) => (
                <tr key={name}>
                  <td className="px-4 py-3 text-txt">{name}</td>
                  <td className="tnum px-4 py-3 font-semibold text-txt">{fmt.format(Math.round(q))}</td>
                </tr>
              ))}
          </Table>
        </section>
      )}
    </AppShell>
  );
}
