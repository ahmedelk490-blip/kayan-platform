'use client';

import { useActionState } from 'react';
import { SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './actions';

const GROUP_AR: Record<string, string> = {
  hero: 'الصفحة الرئيسية',
  services: 'الخدمات',
  why: 'ليش كيان',
  about: 'عن كيان',
};

export interface ContentRow {
  key: string;
  label: string;
  group: string;
  /** القيمة المعروضة: المخزَّنة إن وُجدت، وإلا قيمة الكود. */
  value: string;
  /** هل هي مخزَّنة أم قيمة كود؟ */
  isCustom: boolean;
}

/**
 * تحرير نصوص الموقع.
 *
 * النصوص القصيرة بحقل واحد والطويلة بمنطقة نص — طول النص يقرّر الشكل، فلا
 * يكتب المدير فقرة في سطر ضيّق.
 *
 * إفراغ حقل يُرجعه لقيمة الكود ولا يفرغ الصفحة. مكتوب تحت كل مجموعة، لأن
 * سلوكاً لا يُشرح سيُكتشف بحذف نص مهم.
 */
export function ContentForm({
  action,
  rows,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  rows: ContentRow[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />

      <p className="rounded-lg border border-line bg-card-2 px-4 py-3 text-xs leading-[1.9] text-txt-3">
        كل نص هنا يظهر على الموقع العام فور الحفظ — بلا نشر. حقل فارغ يرجع
        للنص الأصلي المكتوب في النظام، فلا تفرغ الصفحة أبداً.
      </p>

      {groups.map((group) => (
        <section key={group} className="erp-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-brand">
            {GROUP_AR[group] ?? group}
          </h3>

          <div className="space-y-4">
            {rows
              .filter((r) => r.group === group)
              .map((r) => {
                const long = r.value.length > 70;
                return (
                  <div key={r.key}>
                    <label
                      htmlFor={`c:${r.key}`}
                      className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-txt-2"
                    >
                      <span>{r.label}</span>
                      {r.isCustom ? (
                        <span className="text-[0.65rem] text-ok">معدَّل</span>
                      ) : (
                        <span className="text-[0.65rem] text-txt-4">النص الأصلي</span>
                      )}
                    </label>
                    {long ? (
                      <textarea
                        id={`c:${r.key}`}
                        name={`c:${r.key}`}
                        defaultValue={r.value}
                        rows={3}
                        className="erp-input resize-y py-2.5 leading-[1.9]"
                      />
                    ) : (
                      <input
                        id={`c:${r.key}`}
                        name={`c:${r.key}`}
                        defaultValue={r.value}
                        className="erp-input py-2.5"
                      />
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-3">
        <SubmitButton label="حفظ النصوص" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
