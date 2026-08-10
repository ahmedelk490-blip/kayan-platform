'use client';

import { useActionState } from 'react';
import { COST_CATEGORY_AR, COST_BASIS_AR, formatQty } from '@erp/domain';
import { SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './shared';

/**
 * إدخال أسعار الوحدات دفعةً واحدة.
 *
 * The screen this module was actually blocked on. A manager holding a
 * supplier invoice wants to type six numbers and press save — not open six
 * separate forms, and certainly not delete and retype a line to correct its
 * price, which is what the module used to require.
 *
 * Consumption is shown but NOT editable here. Those figures were confirmed by
 * the business; a screen meant for prices must not let someone change how
 * many metres a shirt takes by mistake. Changing consumption is still
 * possible on the line itself.
 */
export interface PriceRow {
  id: string;
  sequence: number;
  category: string;
  nameAr: string;
  basis: string;
  unit: string | null;
  quantity: string;
  yieldQty: string | null;
  unitCost: string;
}

export function PriceEditor({
  action,
  rows,
  currency,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  rows: PriceRow[];
  currency: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const priced = rows.filter((r) => r.basis !== 'PERCENT_OF_DIRECT');
  if (priced.length === 0) {
    return <p className="text-sm text-txt-3">لا توجد بنود تحتاج سعر وحدة في هذا الإصدار.</p>;
  }

  const missing = priced.filter((r) => Number(r.unitCost) <= 0).length;

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      {missing > 0 && (
        <p className="rounded-lg border border-warn bg-warn-soft px-4 py-3 text-xs leading-[1.9] text-warn">
          {missing} من {priced.length} بنداً بلا سعر. الاستهلاك مضبوط ومعتمد، لكن أي تسعيرة
          تُحسب الآن ستكون أقل من التكلفة الحقيقية حتى تُدخل هذه الأرقام.
        </p>
      )}

      <div className="erp-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-card-2">
              {['#', 'البند', 'الوصف', 'الاستهلاك', `سعر الوحدة (${currency})`].map((h) => (
                <th key={h} className="px-4 py-3 text-start text-xs font-medium text-txt-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {priced.map((row) => (
              <tr key={row.id}>
                <td className="tnum px-4 py-2.5 text-txt-4">{row.sequence}</td>
                <td className="px-4 py-2.5 text-txt-3">
                  {(COST_CATEGORY_AR as Record<string, string>)[row.category] ?? row.category}
                </td>
                <td className="px-4 py-2.5 text-txt">
                  {row.nameAr}
                  <span className="ms-2 text-[0.7rem] text-txt-4">
                    {(COST_BASIS_AR as Record<string, string>)[row.basis] ?? row.basis}
                  </span>
                </td>
                {/* Read-only on purpose — this screen prices, it does not
                    redefine how much a garment consumes. */}
                <td className="tnum px-4 py-2.5 text-txt-3">
                  {formatQty(row.quantity)} {row.unit ?? ''}
                  {row.yieldQty && (
                    <span className="text-[0.7rem] text-txt-4">
                      {' '}
                      / {formatQty(row.yieldQty)} قطعة
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    name={`cost-${row.id}`}
                    type="number"
                    step="0.0001"
                    min="0"
                    dir="ltr"
                    defaultValue={row.unitCost}
                    aria-label={`سعر وحدة ${row.nameAr}`}
                    aria-invalid={Boolean(state.fieldErrors?.[`cost-${row.id}`])}
                    className={`erp-input w-36 py-2 text-start ${
                      Number(row.unitCost) <= 0 ? 'border-warn' : ''
                    }`}
                  />
                  {state.fieldErrors?.[`cost-${row.id}`] && (
                    <p className="mt-1 text-[0.7rem] text-bad">
                      {state.fieldErrors[`cost-${row.id}`]}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="حفظ الأسعار" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>

      <p className="text-[0.7rem] leading-[1.9] text-txt-4">
        الحفظ يعدّل هذه المسودة فقط. الإصدار المنشور لا يتغيّر، وكل تكلفة حُسبت سابقاً
        تبقى كما هي — انشر الإصدار بعد المراجعة ليبدأ استخدام الأسعار الجديدة.
      </p>
    </form>
  );
}
