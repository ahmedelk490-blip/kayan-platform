import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dec, formatQty } from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { TYPES, TYPE_LABELS, isManualMovement, type MovementType } from '../../types';
import { CorrectMovementForm } from '../../CorrectMovementForm';

export const metadata: Metadata = { title: 'سجل البضاعة' };

/**
 * سجل البضاعة لموديلٍ واحد — متى أضفنا، وكم كان عندنا، وكم بِيع منذها.
 *
 * ── لماذا هذا لازم ────────────────────────────────────────
 *
 * شاشة المخزن تقول الرصيد الآن ولا تقول قصّته. والمالك يسأل عند كل طلبية
 * جديدة: هذا الموديل أضفنا منه ١٠٠ أوّل الشهر وبقي ٢٠، فعليه طلب؟ والجواب في
 * الحركات نفسها: كل إضافة بتاريخها، والرصيد قبلها وبعدها، وما بِيع منذها.
 *
 * ── وكيف يُحسب «كان عندنا» ─────────────────────────────────
 *
 * من الرصيد الحالي رجوعاً: كل حركةٍ تمسّ الرف تُطرح من الرصيد بعدها فيبقى
 * ما قبلها. فآخر الصفوف — وهي ما يُسأل عنه — تطابق الرصيد الحقيقي دائماً،
 * ولو غُيّر رصيدٌ يوماً بلا حركة (تصفير مثلاً) فالخلل يبقى في الماضي البعيد.
 * والحجز والتالف لا يمسّان الرف فلا يدخلان الحساب.
 */

/** سبب الحركة لبيعٍ خرج وبيعٍ عاد — عبارات المستندات الثابتة. */
const SALE_OUT = ['صرف بضاعة فاتورة', 'بيع كاشير', 'تعديل بنود الفاتورة'];
const SALE_BACK = ['مرتجع مبيعات', 'إلغاء فاتورة'];
const ADDITIONS = new Set(['RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT']);

const IRAQ = { timeZone: 'Asia/Baghdad' } as const;

function isSaleMovement(m: { type: string; reason: string | null; salesOrderLineId: string | null }): boolean {
  const reason = (m.reason ?? '').trim();
  return (
    SALE_OUT.some((r) => reason.startsWith(r)) ||
    SALE_BACK.some((r) => reason.startsWith(r)) ||
    (m.type === 'ISSUE' && !!m.salesOrderLineId)
  );
}

export default async function ProductHistory({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('inventory.read');
  const { id } = await params;
  const sp = await searchParams;
  const showAll = (Array.isArray(sp.show) ? sp.show[0] : sp.show) === 'all';
  const canCorrect = allows(user, 'inventory.correct');

  const product = await prisma.product.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, nameAr: true, sku: true, isDeleted: true },
  });
  if (!product) notFound();

  const [movements, stock] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { tenantId: user.tenantId, productId: id },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        variant: { select: { color: { select: { nameAr: true } }, size: { select: { code: true } } } },
        user: { select: { nameAr: true, name: true } },
        reversedBy: { select: { id: true } },
        reverses: { select: { type: true } },
      },
    }),
    prisma.stock.findMany({
      where: { variant: { productId: id, product: { tenantId: user.tenantId } } },
      select: { variantId: true, onHand: true },
    }),
  ]);

  // ── الرصيد قبل كل حركةٍ وبعدها، وما بِيع بعدها — رجوعاً من الآن ──
  const onHandNow = new Map<string, ReturnType<typeof dec>>();
  for (const s of stock) onHandNow.set(s.variantId, (onHandNow.get(s.variantId) ?? dec(0)).plus(dec(s.onHand)));

  const after = new Map(onHandNow);
  const soldAfter = new Map<string, ReturnType<typeof dec>>();
  const rows = new Array<{
    before: ReturnType<typeof dec> | null;
    after: ReturnType<typeof dec> | null;
    soldSince: ReturnType<typeof dec>;
  }>(movements.length);

  for (let i = movements.length - 1; i >= 0; i--) {
    const m = movements[i];
    const qty = dec(m.quantity);
    const effType = m.type === 'REVERSAL' ? m.reverses?.type : m.type;
    const touchesShelf = (TYPES[effType as MovementType]?.field ?? 'onHand') === 'onHand';
    const soldSince = soldAfter.get(m.variantId) ?? dec(0);

    if (touchesShelf) {
      const a = after.get(m.variantId) ?? dec(0);
      rows[i] = { before: a.minus(qty), after: a, soldSince };
      after.set(m.variantId, a.minus(qty));
    } else {
      rows[i] = { before: null, after: null, soldSince };
    }
    // البيع كمية سالبة والمرتجع موجبة: طرحها يعطي صافي ما بِيع.
    if (isSaleMovement(m)) soldAfter.set(m.variantId, soldSince.minus(qty));
  }

  // ── الملخّص ──
  const days30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let added30 = dec(0);
  let sold30 = dec(0);
  let lastAdd: (typeof movements)[number] | null = null;
  for (const m of movements) {
    const qty = dec(m.quantity);
    const isAdd = ADDITIONS.has(m.type) && qty.gt(0);
    if (isAdd) lastAdd = m;
    if (m.occurredAt.getTime() < days30) continue;
    if (isAdd) added30 = added30.plus(qty);
    if (isSaleMovement(m)) sold30 = sold30.minus(qty);
  }
  const total = [...onHandNow.values()].reduce((s, v) => s.plus(v), dec(0));

  // الإضافات وحدها افتراضاً (سؤال المالك)، والكل بضغطة.
  const shown = movements
    .map((m, i) => ({ m, r: rows[i] }))
    .filter(({ m }) => showAll || (ADDITIONS.has(m.type) && dec(m.quantity).gt(0)))
    .reverse();

  const when = (d: Date) =>
    d.toLocaleString('ar-EG', {
      ...IRAQ,
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <AppShell user={user} title="سجل البضاعة">
      <ModuleHeader
        title={`سجل البضاعة — ${product.nameAr}${product.isDeleted ? ' (محذوف)' : ''}`}
        action={
          <Link href="/inventory" className="erp-btn-ghost">
            رجوع للمخزون
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">الرصيد الآن</p>
          <p className="tnum mt-1 text-xl font-bold text-brand">{formatQty(total)} قطعة</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">آخر إضافة</p>
          <p className="tnum mt-1 text-sm font-semibold text-txt">
            {lastAdd ? `${formatQty(lastAdd.quantity)} قطعة` : '—'}
          </p>
          <p className="tnum text-[0.7rem] text-txt-4">
            {lastAdd ? lastAdd.occurredAt.toLocaleDateString('ar-EG', IRAQ) : 'لم يُضَف بعد'}
          </p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">أُضيف خلال 30 يوماً</p>
          <p className="tnum mt-1 text-xl font-bold text-ok">{formatQty(added30)}</p>
        </div>
        <div className="erp-card p-4">
          <p className="text-[0.7rem] text-txt-3">بِيع خلال 30 يوماً</p>
          <p className={`tnum mt-1 text-xl font-bold ${sold30.gt(0) ? 'text-brand' : 'text-txt-4'}`}>
            {formatQty(sold30.gt(0) ? sold30 : dec(0))}
          </p>
          <p className="text-[0.7rem] text-txt-4">{sold30.gt(0) ? 'عليه طلب' : 'لا بيع خلال الشهر'}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Link
          href={`/inventory/product/${product.id}`}
          className={`rounded-full border px-3.5 py-1.5 text-xs ${!showAll ? 'border-brand bg-brand-soft text-brand' : 'border-line-2 text-txt-2'}`}
        >
          الإضافات
        </Link>
        <Link
          href={`/inventory/product/${product.id}?show=all`}
          className={`rounded-full border px-3.5 py-1.5 text-xs ${showAll ? 'border-brand bg-brand-soft text-brand' : 'border-line-2 text-txt-2'}`}
        >
          كل الحركات (بيع، مرتجع، صرف…)
        </Link>
      </div>

      <Table
        headers={['التاريخ', 'الحركة', 'اللون · المقاس', 'الكمية', 'كان عندنا', 'صار', 'بِيع منذها', 'بواسطة', 'المرجع / السبب', '']}
        empty={shown.length === 0}
      >
        {shown.map(({ m, r }) => {
          const qty = dec(m.quantity);
          const isAdd = ADDITIONS.has(m.type) && qty.gt(0);
          const editable = canCorrect && !m.reversedBy && m.type !== 'REVERSAL' && isManualMovement(m);
          return (
            <tr key={m.id} id={`m-${m.id}`} className={m.reversedBy ? 'opacity-55' : ''}>
              <td className="tnum px-4 py-3 text-[0.7rem] text-txt-3">{when(m.occurredAt)}</td>
              <td className="px-4 py-3 text-xs text-txt-2">{TYPE_LABELS[m.type] ?? m.type}</td>
              <td className="px-4 py-3 text-xs text-txt">
                {[m.variant.color?.nameAr, m.variant.size?.code].filter(Boolean).join(' · ') || 'موحّد'}
              </td>
              <td className={`tnum px-4 py-3 font-semibold ${qty.isNegative() ? 'text-bad' : 'text-ok'}`} dir="ltr">
                {qty.gt(0) ? `+${formatQty(qty)}` : formatQty(qty)}
              </td>
              <td className="tnum px-4 py-3 text-txt-3">{r.before ? formatQty(r.before) : '—'}</td>
              <td className="tnum px-4 py-3 font-medium text-txt">{r.after ? formatQty(r.after) : '—'}</td>
              <td className="tnum px-4 py-3 text-brand">
                {isAdd ? formatQty(r.soldSince.gt(0) ? r.soldSince : dec(0)) : '—'}
              </td>
              <td className="px-4 py-3 text-[0.7rem] text-txt-3">{m.user?.nameAr ?? m.user?.name ?? '—'}</td>
              <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                {[m.reference, m.reason].filter(Boolean).join(' · ') || '—'}
              </td>
              <td className="px-4 py-3">
                {editable ? (
                  <CorrectMovementForm movementId={m.id} quantity={Number(qty.abs().toString())} />
                ) : null}
              </td>
            </tr>
          );
        })}
      </Table>

      <p className="mt-3 text-[0.7rem] leading-[1.9] text-txt-4">
        «كان عندنا» و«صار» رصيد ذلك اللون والمقاس قبل الحركة وبعدها. و«بِيع منذها» صافي ما بِيع
        منه بعد تلك الإضافة (البيع ناقص المرتجع). والتعديل للحركات المُدخلة باليد وحدها — حركة
        الفاتورة والمرتجع والشراء تُصحَّح من مستندها.
      </p>
    </AppShell>
  );
}
