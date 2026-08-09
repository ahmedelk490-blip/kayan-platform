'use client';

import { useActionState } from 'react';
import { SubmitButton, FormError, Select, Field } from '@/components/crud/Form';
import type { FormState } from './shared';

export interface ReceivableLine {
  id: string;
  lineNo: number;
  label: string;
  ordered: string;
  received: string;
  outstanding: string;
  unit: string | null;
}

/**
 * تسجيل استلام.
 *
 * Each line offers what is still owed as its default, because the common
 * case is "the whole delivery arrived". The server re-checks the figure
 * inside the transaction — the default here is a convenience, never the
 * control.
 */
export function ReceiveForm({
  action,
  lines,
  warehouses,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  lines: ReceivableLine[];
  warehouses: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  const open = lines.filter((l) => Number(l.outstanding) > 0);
  if (open.length === 0) {
    return <p className="text-sm text-txt-3">كل البنود استُلمت بالكامل.</p>;
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          name="warehouseId"
          label="المخزن المستلِم"
          required
          options={warehouses}
          placeholder="اختر مخزناً…"
          errors={state.fieldErrors}
        />
        <Field
          name="reference"
          label="رقم إذن التوريد لدى المورّد"
          placeholder="اختياري"
          errors={state.fieldErrors}
        />
      </div>

      <div className="space-y-2">
        {open.map((line) => (
          <div
            key={line.id}
            className="grid items-center gap-3 rounded-lg border border-line p-4 md:grid-cols-[auto_1fr_repeat(3,0.7fr)]"
          >
            <span className="tnum text-xs text-txt-4">{line.lineNo}</span>
            <span className="text-sm text-txt">{line.label}</span>
            <span className="tnum text-xs text-txt-3">مطلوب {line.ordered}</span>
            <span className="tnum text-xs text-txt-3">استُلم {line.received}</span>
            <input
              name={`qty__${line.id}`}
              type="number"
              step="any"
              min="0"
              max={line.outstanding}
              defaultValue={line.outstanding}
              dir="ltr"
              aria-label={`الكمية المستلمة للبند ${line.lineNo}`}
              className="erp-input py-2 text-xs"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الاستلام" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>

      <p className="text-[0.7rem] text-txt-4">
        الاستلام يرفع المخزون فوراً ويعيد حساب متوسط التكلفة المرجّح. الحركة
        لا تتكرر حتى لو أُرسل الطلب مرتين — القيد في قاعدة البيانات يمنع ذلك.
      </p>
    </form>
  );
}
