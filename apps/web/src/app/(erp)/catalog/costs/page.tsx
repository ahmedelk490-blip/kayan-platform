import type { Metadata } from 'next';
import Link from 'next/link';
import { SERVICE_PRICE_NOTE, PRICE_SERVICE_AR, type PriceService } from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { saveProductNumbers, saveSalaries } from './actions';

export const metadata: Metadata = { title: 'الأسعار والتكاليف' };

const PRICED: PriceService[] = ['EMBROIDERY', 'PRINTING', 'DTF'];

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

  const [products, staff] = await Promise.all([
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
        // ألوانٌ/مقاساتٌ لها تكلفتها الخاصة تُقدَّم على تكلفة المنتج في الحساب.
        _count: { select: { variants: { where: { isDeleted: false, cost: { gt: 0 } } } } },
      },
    }),
    canSalaries
      ? prisma.user.findMany({
          where: { tenantId: user.tenantId, isActive: true, role: { key: { not: 'CUSTOMER' } } },
          orderBy: { nameAr: 'asc' },
          select: { id: true, nameAr: true, name: true, monthlySalary: true, role: { select: { nameAr: true } } },
        })
      : Promise.resolve([]),
  ]);

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

      <p className="mb-6 max-w-[75ch] text-[0.7rem] leading-[1.9] text-txt-4">
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
                <tr className="bg-card-2 text-[0.7rem] text-txt-3">
                  <th className="px-3 py-2.5 text-start font-medium">المنتج</th>
                  <th className="px-3 py-2.5 text-start font-medium">تكلفة القطعة</th>
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
                      {p._count.variants > 0 && (
                        <span className="block text-[0.65rem] text-txt-4">
                          {p._count.variants} لون/مقاس بتكلفة خاصة — تُقدَّم عليها
                        </span>
                      )}
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
                            <span className="text-[0.7rem] text-txt-4">له شرائح أسعار</span>
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
                  <tr className="bg-card-2 text-[0.7rem] text-txt-3">
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
