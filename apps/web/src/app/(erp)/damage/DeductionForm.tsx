'use client';

import { useActionState, useState } from 'react';
import { formatMoney } from '@erp/domain';
import { createDeduction } from './actions';
import type { FormState } from '@/lib/ops';

/**
 * خصمٌ على موظّف — المبلغ، وعدد الأقساط، ومتى يبدأ.
 *
 * يُستعمل في كشف الموظّف (الموظّف ثابت) وفي صفحة المرتجع (يُختار الموظّف،
 * والمبلغ يبدأ بقيمة المرتجع ولا يتجاوزها). القسط الشهري يُحسب أمام العين
 * قبل الحفظ، فيعرف المدير ما سيُقتطع من كل راتب.
 */
export function DeductionForm({
  employeeId,
  employees = [],
  defaultEmployeeId,
  returnId,
  defaultAmount,
  maxAmount,
}: {
  /** موظّفٌ ثابت (كشف الموظّف) — وإلا يُختار من القائمة. */
  employeeId?: string;
  employees?: { value: string; label: string }[];
  defaultEmployeeId?: string;
  returnId?: string;
  defaultAmount?: number;
  maxAmount?: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDeduction, {});
  const [amount, setAmount] = useState(defaultAmount ? String(Math.round(defaultAmount)) : '');
  const [count, setCount] = useState('1');

  const n = Math.max(1, Math.min(36, Math.round(Number(count) || 1)));
  // بالدينار الكامل كما يُستقطع فعلاً — وآخر قسطٍ يأخذ الفرق.
  const per = Math.floor((Number(amount) || 0) / n);
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      {employeeId ? (
        <input type="hidden" name="employeeId" value={employeeId} />
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">الموظف</span>
          <select name="employeeId" defaultValue={defaultEmployeeId ?? ''} className="erp-input py-2.5">
            <option value="">اختر موظفاً…</option>
            {employees.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          {err.employeeId && <span className="mt-1 block text-[0.7rem] text-bad">{err.employeeId}</span>}
        </label>
      )}
      {returnId && <input type="hidden" name="returnId" value={returnId} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">مبلغ الخصم (د.ع)</span>
          <input
            name="amount"
            type="number"
            min="1"
            max={maxAmount}
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="erp-input py-2.5"
          />
          {err.amount && <span className="mt-1 block text-[0.7rem] text-bad">{err.amount}</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">عدد الأقساط (شهرياً)</span>
          <input
            name="installments"
            type="number"
            min="1"
            max="36"
            dir="ltr"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="erp-input py-2.5"
          />
          {err.installments && <span className="mt-1 block text-[0.7rem] text-bad">{err.installments}</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">يبدأ الاستقطاع</span>
          <select name="start" defaultValue="this" className="erp-input py-2.5">
            <option value="this">من هذا الشهر (يُستقطع أول قسط الآن)</option>
            <option value="next">من الشهر القادم</option>
          </select>
        </label>
      </div>

      <p className="text-[0.7rem] text-txt-3">
        القسط الشهري: <span className="tnum font-semibold text-brand">{formatMoney(per)}</span> د.ع
        {maxAmount ? <span className="text-txt-4"> · الحدّ الأقصى {formatMoney(maxAmount)}</span> : null}
      </p>

      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">السبب{returnId ? ' (اختياري)' : ''}</span>
        <textarea
          name="reason"
          rows={2}
          placeholder={returnId ? 'مثال: خطأ في المقاس من البائع' : 'مثال: سلفة، أو خطأ تسبّب بخسارة'}
          className="erp-input py-2"
        />
        {err.reason && <span className="mt-1 block text-[0.7rem] text-bad">{err.reason}</span>}
      </label>

      <button type="submit" disabled={pending} className="erp-btn disabled:opacity-50">
        {pending ? 'جارٍ التسجيل…' : 'تسجيل الخصم'}
      </button>
      {state.error && <p role="alert" className="text-xs text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="text-xs text-ok">{state.ok}</p>}
    </form>
  );
}
