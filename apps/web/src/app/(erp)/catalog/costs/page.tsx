import type { Metadata } from 'next';
import Link from 'next/link';
import { SERVICE_PRICE_NOTE, PRICE_SERVICE_AR, type PriceService } from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { WHOLESALE_NOTE } from '@/lib/fifo';
import type { SearchParams } from '@/lib/query';
import { saveProductNumbers, saveSalaries } from './actions';

export const metadata: Metadata = { title: 'الأسعار والتكاليف' };

const PRICED: PriceService[] = ['EMBROIDERY', 'DTF'];

/**
 * الأسعار والتكاليف والرواتب — كل أرقام الحساب في شاشة واحدة (بطلب المالك).
 *
 * كانت تكلفة القطعة في بطاقة كل منتج، والراتب في صفحة كل موظف: عشرات الصفحات
 * ليصحّ رقم الأرباح. هنا جدولان وحفظان. وهي أرقامٌ للحساب لا تغيّر شيئاً قائماً:
 * لا فاتورة سابقة، ولا رصيد مخزن، ولا ما يراه الزبون على الموقع.
 */
export default async function CostsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission('cost.view');
  const sp = await searchParams;
  const saved = typeof sp.saved === 'string' ? sp.saved : null;
  const changed = typeof sp.n === 'string' ? Number(sp.n) || 0 : 0;
  const canProducts = allows(user, 'products.write');
  const canSalaries = allows(user, 'hr.manage');

  const [products, staff, history] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId: user.tenantId, isDeleted: false },
      orderBy: { nameAr: 'asc' },
      select: {
        id: true,
        nameAr: true,
        cost: true,
        priceTiers: {
          where: { variantId: null, isActive: true },
          select: { service: true, notes: true, price: true },
        },
      },
    }),
    canSalaries
      ? prisma.user.findMany({
          where: { tenantId: user.tenantId, isActive: true, role: { key: { not: 'CUSTOMER' } } },
          orderBy: { nameAr: 'asc' },
          select: { id: true, nameAr: true, name: true, monthlySalary: true, role: { select: { nameAr: true } } },
        })
      : Promise.resolve([]),
    // سجل أسعار الجملة — آخر التعديلات أولاً (lib/fifo).
    prisma.costLayer.findMany({
      where: { tenantId: user.tenantId, note: WHOLESALE_NOTE, quantity: 0 },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      take: 80,
      select: { id: true, productId: true, unitCost: true, receivedAt: true, userId: true },
    }),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.nameAr]));
  const userName = new Map(
    (
      await prisma.user.findMany({
        where: { tenantId: user.tenantId, id: { in: [...new Set(history.map((h) => h.userId).filter((x): x is string => !!x))] } },
        select: { id: true, nameAr: true, name: true },
      })
    ).map((u) => [u.id, u.nameAr ?? u.name]),
  );
  // السعر السابق لكل سطر = السطر التالي لنفس الموديل في السجل (الأقدم منه).
  const prevOf = new Map<string, number>();
  {
    const seen = new Map<string, string>();
    for (const h of history) {
      const newer = seen.get(h.productId);
      if (newer) prevOf.set(newer, Number(h.unitCost));
      seen.set(h.productId, h.id);
    }
  }

  const noCost = products.filter((p) => p.cost === null || Number(p.cost) <= 0).length;
  const noSalary = staff.filter((u) => u.monthlySalary === null || Number(u.monthlySalary) <= 0).length;

  return (
    <AppShell user={user} title="الأسعار والتكاليف">
      <ModuleHeader
        title="الأسعار والتكاليف والرواتب"
        action={
          <Link href="/reports/profits" className="erp-btn-ghost">
            الأرباح
          </Link>
        }
      />

      {saved && (
        <p className="mb-4 rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">
          ✓ حُفظ — {changed > 0 ? `${changed} تغيير` : 'لا تغيير'}.
        </p>
      )}

      <p className="mb-6 max-w-[75ch] text-xs leading-[1.9] text-txt-4">
        أرقامٌ للحساب لا تغيّر شيئاً قائماً: <strong>تكلفة القطعة</strong> تدخل حساب الأرباح وحده.{' '}
        <strong>سعر كل خدمة</strong> يُقترح في الفاتورة والكاشير حين تُختار الخدمة — والبائع يغيّره —
        ولا يظهر على الموقع ولا يمسّ الفواتير السابقة. و<strong>الراتب الشهري</strong> يدخل الأرباح
        بحصّة الأيام.
      </p>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-brand">المنتجات — تكلفة القطعة وسعر كل خدمة</h3>
          {noCost > 0 && <span className="text-xs text-warn">{noCost} منتج بلا تكلفة</span>}
        </div>
        <form action={saveProductNumbers}>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-card-2 text-xs text-txt-3">
                  <th className="px-3 py-2.5 text-start font-medium">المنتج</th>
                  <th className="px-3 py-2.5 text-start font-medium">سعر الجملة للقطعة</th>
                  {PRICED.map((s) => (
                    <th key={s} className="px-3 py-2.5 text-start font-medium">
                      سعر {PRICE_SERVICE_AR[s]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-line/60">
                    <td className="px-3 py-2 text-txt">
                      {p.nameAr}
                      <input type="hidden" name="pid" value={p.id} />
                    </td>
                    <td className="px-3 py-2">
                      <NumberCell
                        name={`cost:${p.id}`}
                        value={p.cost}
                        disabled={!canProducts}
                        flag={p.cost === null || Number(p.cost) <= 0}
                      />
                    </td>
                    {PRICED.map((s) => {
                      const ofService = p.priceTiers.filter((t) => t.service === s);
                      const locked = ofService.some((t) => t.notes !== SERVICE_PRICE_NOTE);
                      const mark = ofService.find((t) => t.notes === SERVICE_PRICE_NOTE);
                      return (
                        <td key={s} className="px-3 py-2">
                          {locked ? (
                            <span className="text-xs text-txt-4">له شرائح أسعار</span>
                          ) : (
                            <NumberCell name={`svc:${p.id}:${s}`} value={mark?.price ?? null} disabled={!canProducts} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canProducts && products.length > 0 && (
            <button type="submit" className="erp-btn mt-3">
              حفظ التكاليف والأسعار
            </button>
          )}
        </form>
      </section>

      <section className="mb-8">
        <h3 className="mb-1 text-sm font-semibold text-brand">سجل أسعار الجملة</h3>
        <p className="mb-3 max-w-[75ch] text-xs leading-[1.9] text-txt-4">
          كل تعديل لسعر الجملة فوق يُسجَّل هنا بتاريخه. كل قطعة تُباع بعده تُحسب بهذا السعر حتى يُسجَّل سعر
          جديد، والفواتير التي قبله تبقى على سعرها القديم. المخزن يُدخل البضاعة بلا أسعار.
        </p>
        {history.length === 0 ? (
          <p className="rounded-xl border border-line bg-card px-4 py-3 text-xs text-txt-4">
            لا أسعار مسجّلة بعد — عدّل سعر الجملة لأي موديل فوق واضغط حفظ.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-card-2 text-xs text-txt-3">
                  <th className="px-3 py-2.5 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-2.5 text-start font-medium">الموديل</th>
                  <th className="px-3 py-2.5 text-start font-medium">السعر الجديد</th>
                  <th className="px-3 py-2.5 text-start font-medium">كان</th>
                  <th className="px-3 py-2.5 text-start font-medium">بواسطة</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-line/60">
                    <td className="px-3 py-2 text-xs text-txt-3" dir="ltr">
                      {h.receivedAt.toISOString().slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-3 py-2 text-txt">{productName.get(h.productId) ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold text-txt" dir="ltr">
                      {Math.round(Number(h.unitCost)).toLocaleString('en-US')}
                    </td>
                    <td className="px-3 py-2 text-txt-4" dir="ltr">
                      {prevOf.has(h.id) ? Math.round(prevOf.get(h.id)!).toLocaleString('en-US') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-txt-3">{(h.userId && userName.get(h.userId)) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canSalaries && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-brand">الموظفون — الراتب الشهري</h3>
            {noSalary > 0 && <span className="text-xs text-txt-4">{noSalary} بلا راتب ثابت</span>}
          </div>
          <form action={saveSalaries}>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="bg-card-2 text-xs text-txt-3">
                    <th className="px-3 py-2.5 text-start font-medium">الموظف</th>
                    <th className="px-3 py-2.5 text-start font-medium">الدور</th>
                    <th className="px-3 py-2.5 text-start font-medium">الراتب الشهري</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((u) => (
                    <tr key={u.id} className="border-t border-line/60">
                      <td className="px-3 py-2 text-txt">
                        {u.nameAr ?? u.name}
                        <input type="hidden" name="uid" value={u.id} />
                      </td>
                      <td className="px-3 py-2 text-xs text-txt-3">{u.role.nameAr}</td>
                      <td className="px-3 py-2">
                        <NumberCell name={`sal:${u.id}`} value={u.monthlySalary} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="submit" className="erp-btn mt-3">
              حفظ الرواتب
            </button>
          </form>
        </section>
      )}
    </AppShell>
  );
}

/** خانة رقمٍ بالدينار الكامل — فارغةٌ تعني «لا قيمة». */
function NumberCell({
  name,
  value,
  disabled,
  flag,
}: {
  name: string;
  value: unknown;
  disabled?: boolean;
  flag?: boolean;
}) {
  const shown = value === null || value === undefined || Number(value) <= 0 ? '' : String(Math.round(Number(value)));
  return (
    <input
      name={name}
      type="number"
      min="0"
      step="1"
      dir="ltr"
      inputMode="numeric"
      defaultValue={shown}
      disabled={disabled}
      placeholder="—"
      className={`erp-input w-32 py-2 text-start ${flag ? 'border-warn' : ''}`}
    />
  );
}
