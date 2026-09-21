'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resetData } from './reset-actions';
import { RESET_GROUPS, type ResetCounts, type ResetGroupKey, type ResetState } from './reset-groups';

/**
 * لوحة تصفير بيانات التشغيل — البدء من جديد بعد التجربة.
 *
 * المجموعات تُختار هنا لحظة التنفيذ لا تُخمَّن مسبقاً، وكل بند يعرض عدد صفوفه
 * الحقيقي فيرى المالك ما سيفقده قبل أن يفقده. اللوحة مطويّة افتراضياً وتطلب
 * كتابة كلمة «تصفير» بخط اليد — ضغطةٌ عابرة لا تمسح قاعدة بيانات.
 */
export function ResetPanel({ counts }: { counts: ResetCounts }) {
  const [state, action] = useActionState<ResetState, FormData>(resetData, {});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState('');

  const toggle = (key: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const totalRows = [...picked].reduce((s, k) => s + (counts[k as ResetGroupKey] ?? 0), 0);
  const ready = picked.size > 0 && confirm.trim() === 'تصفير';

  return (
    <form action={action} className="space-y-4">
      <p className="text-xs leading-[1.9] text-txt-3">
        يمسح بيانات التشغيل المختارة ليبدأ النظام من جديد.{' '}
        <strong className="text-ok">
          المنتجات وأسعارها وألوانها ومقاساتها ومعادلاتها محميّة دائماً ({counts.products} سجل) —
        </strong>{' '}
        لا يمسّها أي خيار هنا. تُؤخذ نسخة احتياطية كاملة تلقائياً قبل المسح، والعملية كلها في
        معاملة واحدة: إن فشل شيء تتراجع بالكامل.
      </p>

      <details className="rounded-xl border border-bad/40 bg-bad-soft/30 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-bad">
          ⚠️ فتح أدوات التصفير — اضغط هنا
        </summary>

        <div className="mt-4 space-y-2.5">
          {RESET_GROUPS.map((g) => {
            const n = counts[g.key] ?? 0;
            const empty = n === 0;
            return (
              <label
                key={g.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  picked.has(g.key) ? 'border-bad bg-bad-soft/50' : 'border-line bg-card'
                } ${empty ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  name={`g_${g.key}`}
                  checked={picked.has(g.key)}
                  onChange={(e) => toggle(g.key, e.target.checked)}
                  disabled={empty}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-bad)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-txt">{g.label}</span>
                    <span className="tnum rounded-full bg-card-2 px-2 py-0.5 text-[0.65rem] text-txt-3">
                      {empty ? 'فارغ' : `${n.toLocaleString('en-US')} سجل`}
                    </span>
                  </span>
                  <span className="mt-1 block text-[0.7rem] leading-[1.8] text-txt-4">{g.hint}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-line bg-card p-4">
          <p className="text-xs text-txt-2">
            المحدَّد للمسح:{' '}
            <strong className="tnum text-bad">{totalRows.toLocaleString('en-US')}</strong> سجل من{' '}
            <strong>{picked.size}</strong> مجموعة.
          </p>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs text-txt-2">
              للتأكيد اكتب كلمة <strong className="text-bad">تصفير</strong> بخط يدك
            </span>
            <input
              name="confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="تصفير"
              autoComplete="off"
              className="erp-input max-w-xs py-2.5"
            />
          </label>
          <ResetButton ready={ready} />
        </div>
      </details>

      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-3 text-xs leading-[1.9] text-ok">
          ✅ {state.ok}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs leading-[1.9] text-bad">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** زر التنفيذ: يتعطّل أثناء العمل — ضغطتان لا تشغّلان مسحين. */
function ResetButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="mt-3 rounded-lg bg-bad px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {pending ? 'جارٍ أخذ نسخة احتياطية والمسح…' : 'نفّذ التصفير'}
    </button>
  );
}
