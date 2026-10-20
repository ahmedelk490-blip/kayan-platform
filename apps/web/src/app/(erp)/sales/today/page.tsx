import type { Metadata } from 'next';
import { dec } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { isDeliveryDesc } from '@/lib/delivery';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { RefreshEvery } from './RefreshEvery';

export const metadata: Metadata = { title: 'قطع اليوم' };
export const dynamic = 'force-dynamic';

const OFFSET = 3 * 60 * 60 * 1000; // بغداد UTC+3
const DAY = 24 * 60 * 60 * 1000;

/**
 * قطع اليوم — لمندوبي المبيعات.
 *
 * بطلب المالك: كل مندوب يرى كم قطعة نزّل «اليوم» فقط، مع الإجمالي. لا اختيار
 * تاريخ ولا رجوع لأيام سابقة: من منتصف ليل بغداد يبدأ العدّ من الصفر. القطع =
 * كميات أسطر الفواتير التي أنشأها المندوب وأُصدرت اليوم (بلا المسودّات والملغاة
 * وبلا سطر أجور التوصيل — هو مال لا بضاعة).
 */
export default async function TodayPiecesPage() {
  const user = await requirePermission('sales.view');

  // يوم بغداد الحالي من منتصف الليل إلى منتصف الليل التالي.
  const nowKey = new Date(Date.now() + OFFSET).toISOString().slice(0, 10);
  const [y, m, d] = nowKey.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - OFFSET);
  const end = new Date(start.getTime() + DAY);
  const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('ar-EG', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const [reps, invoices] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, isActive: true, role: { key: 'SALES' } },
      select: { id: true, name: true, nameAr: true },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        status: { notIn: ['DRAFT', 'VOID'] },
        issueDate: { gte: start, lt: end },
        createdById: { not: null },
      },
      select: {
        id: true,
        createdById: true,
        createdBy: { select: { name: true, nameAr: true } },
        lines: { select: { quantity: true, description: true } },
      },
    }),
  ]);

  // كل مندوب يظهر ولو صفراً؛ ومن باع اليوم من غير المندوبين (مدير/كاشير) يظهر أيضاً.
  const rows = new Map<string, { name: string; pieces: number; invoices: number }>();
  for (const r of reps) rows.set(r.id, { name: r.nameAr || r.name, pieces: 0, invoices: 0 });
  for (const inv of invoices) {
    const id = inv.createdById!;
    const row = rows.get(id) ?? { name: inv.createdBy?.nameAr || inv.createdBy?.name || '—', pieces: 0, invoices: 0 };
    row.invoices += 1;
    for (const l of inv.lines) {
      if (isDeliveryDesc(l.description)) continue;
      row.pieces += dec(l.quantity).toNumber();
    }
    rows.set(id, row);
  }

  const list = [...rows.entries()]
    .map(([id, r]) => ({ id, ...r, pieces: Math.round(r.pieces) }))
    .sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name, 'ar'));
  const total = list.reduce((s, r) => s + r.pieces, 0);
  const mine = list.find((r) => r.id === user.id);
  const fmt = new Intl.NumberFormat('en-US');

  return (
    <AppShell user={user} title="قطع اليوم">
      {/* يحدّث نفسه كل دقيقة — فيظهر ما نزل الآن ويصفّر وحده بعد منتصف الليل. */}
      <RefreshEvery seconds={60} />
      <ModuleHeader title={`قطع اليوم — ${label}`} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {mine && (
          <div className="erp-card p-5">
            <p className="text-xs text-txt-3">قطعك اليوم</p>
            <p className="tnum mt-1 text-3xl font-bold text-brand">{fmt.format(mine.pieces)}</p>
            <p className="mt-1 text-xs text-txt-3">من {fmt.format(mine.invoices)} فاتورة</p>
          </div>
        )}
        <div className="erp-card p-5">
          <p className="text-xs text-txt-3">إجمالي قطع اليوم</p>
          <p className="tnum mt-1 text-3xl font-bold text-txt">{fmt.format(total)}</p>
          <p className="mt-1 text-xs text-txt-3">يبدأ العدّ من الصفر كل يوم الساعة 12 بالليل.</p>
        </div>
      </div>

      <Table headers={['المندوب', 'القطع اليوم', 'الفواتير']} empty={list.length === 0}>
        {list.map((r) => (
          <tr key={r.id} className={r.id === user.id ? 'bg-brand-soft' : undefined}>
            <td className="px-4 py-3 font-medium text-txt">
              {r.name}
              {r.id === user.id && <span className="ms-2 text-xs text-brand">(أنت)</span>}
            </td>
            <td className="tnum px-4 py-3 text-base font-semibold text-txt">{fmt.format(r.pieces)}</td>
            <td className="tnum px-4 py-3 text-txt-2">{fmt.format(r.invoices)}</td>
          </tr>
        ))}
        {list.length > 0 && (
          <tr className="bg-card-2">
            <td className="px-4 py-3 font-semibold text-txt">الإجمالي</td>
            <td className="tnum px-4 py-3 text-base font-bold text-brand">{fmt.format(total)}</td>
            <td className="tnum px-4 py-3 text-txt-2">{fmt.format(list.reduce((s, r) => s + r.invoices, 0))}</td>
          </tr>
        )}
      </Table>
    </AppShell>
  );
}
