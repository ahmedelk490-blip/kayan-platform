'use client';

import { useActionState, useState } from 'react';
import { SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

export interface ReturnLine {
  id: string;
  description: string;
  sold: number;
  /** ما أُرجِع سابقاً من هذا البند — المتبقّي = المباع − المُرجَع. */
  returned: number;
  unitPrice: number;
}

/**
 * فورم مرتجع: صفٌّ لكل بند من الفاتورة بكمية مرتجعة (لا تتجاوز المباع)، وقيمة
 * المرتجع تظهر حيّاً. سبب اختياري. الصفوف بكمية صفر تُهمَل.
 */
export function ReturnForm({
  action,
  lines,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  lines: ReturnLine[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [qty, setQty] = useState<Record<string, number>>({});

  const total = lines.reduce((s, l) => s + (qty[l.id] || 0) * l.unitPrice, 0);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-start text-[0.7rem] text-txt-3">
              <th className="px-3 py-2 text-start font-medium">الصنف</th>
              <th className="px-3 py-2 text-start font-medium">المباع</th>
              <th className="px-3 py-2 text-start font-medium">المتبقّي للإرجاع</th>
              <th className="px-3 py-2 text-start font-medium">سعر الوحدة</th>
              <th className="px-3 py-2 text-start font-medium">المرتجع</th>
              <th className="px-3 py-2 text-start font-medium">قيمة المرتجع</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const remaining = Math.max(0, l.sold - l.returned);
              const q = qty[l.id] || 0;
              return (
                <tr key={l.id} className="border-b border-line">
                  <td className="px-3 py-2 text-txt">{l.description}</td>
                  <td className="tnum px-3 py-2 text-txt-3">{l.sold}</td>
                  <td className={`tnum px-3 py-2 ${remaining === 0 ? 'text-txt-4' : 'text-txt-2'}`}>
                    {remaining}{l.returned > 0 && <span className="text-[0.7rem] text-txt-4"> (رُجِّع {l.returned})</span>}
                  </td>
                  <td className="tnum px-3 py-2 text-txt-3">{l.unitPrice.toLocaleString('ar-IQ')}</td>
                  <td className="px-3 py-2">
                    {remaining === 0 ? (
                      <span className="text-[0.7rem] text-txt-4">مُرجَع بالكامل</span>
                    ) : (
                      <input
                        name={`qty_${l.id}`}
                        type="number"
                        min="0"
                        max={remaining}
                        step="1"
                        dir="ltr"
                        defaultValue={0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(remaining, Math.round(Number(e.target.value) || 0)));
                          setQty((p) => ({ ...p, [l.id]: v }));
                        }}
                        className="erp-input w-24 py-1.5 text-start"
                      />
                    )}
                  </td>
                  <td className="tnum px-3 py-2 font-medium text-brand">
                    {q > 0 ? (q * l.unitPrice).toLocaleString('ar-IQ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">سبب الإرجاع (اختياري)</span>
        <input name="reason" className="erp-input py-2.5" placeholder="مثال: مقاس غير مناسب، عيب تصنيع…" />
      </label>

      <label className="flex items-center gap-2.5 rounded-lg border border-line bg-card-2 px-4 py-3">
        <input name="refund" type="checkbox" defaultChecked value="1" className="h-4 w-4 accent-[var(--color-brand)]" />
        <span className="text-xs text-txt-2">
          رد قيمة المرتجع للعميل نقداً — تُخصم من مدفوع الفاتورة (بحدّ ما دُفع فعلاً). أزِل العلامة لو المرتجع استبدال بلا رد مبلغ.
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-sm text-txt-2">
          إجمالي المرتجع: <span className="tnum font-bold text-brand">{total.toLocaleString('ar-IQ')} د.ع</span>
        </span>
        <SubmitButton label="تسجيل المرتجع" />
      </div>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        البضاعة المرتجعة تعود للمخزون تلقائياً، وتُخصم قيمتها من مبيعات المندوب في تحليله.
      </p>
    </form>
  );
}
