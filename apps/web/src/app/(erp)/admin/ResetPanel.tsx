'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resetData } from './reset-actions';
import { RESET_GROUPS, type ResetCounts, type ResetGroupKey, type ResetState } from './reset-groups';

/**
 * لوحة تصفير بيانات التشغيل — البدء من جديد بعد التجربة.
 *
 * الأزرار ظاهرة من أول نظرة: كانت كلها مطويّةً خلف صندوق «افتح الأدوات» فلم
 * يصل إليها المالك أصلاً. الطيّ الآن على التفصيل وحده (العشر مجموعات)، أمّا
 * الاختيار الجاهز وخانة التأكيد وزر التنفيذ فبارزة.
 *
 * ما يحمي العملية ليس الإخفاء بل التأكيد: كلمة «تصفير» تُكتب بخط اليد،
 * والمنتجات وأسعارها محميّة مهما اختير، ونسخة احتياطية تُؤخذ قبل أول حذف.
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

  /**
   * اختيارات جاهزة — التأشير اليدوي على عشرة بنود يُخطئ أحدُها فتُرفض العملية
   * كلها (العملاء لا يُمسحون وفواتيرهم قائمة). هذه تختار المجموعة المتّسقة دفعةً
   * واحدة؛ ويبقى التعديل اليدوي بعدها متاحاً، وكلمة التأكيد مطلوبة كما هي.
   */
  const applyPreset = (keys: ResetGroupKey[]) =>
    setPicked(new Set(keys.filter((k) => (counts[k] ?? 0) > 0 || k === 'stock')));

  /** أسماء ما اختير — ليقرأ المالك ما سيُمسح دون فتح التفصيل. */
  const pickedLabels = RESET_GROUPS.filter((g) => picked.has(g.key)).map((g) => g.label);

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

      {/* ١. الاختيار الجاهز — أول ما تقع عليه العين، وضغطةٌ واحدة تكفي. */}
      <div className="rounded-xl border border-bad/40 bg-bad-soft/30 p-4">
        <p className="mb-3 text-sm font-semibold text-bad">١ · اختر ما يُمسح</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyPreset(['sales', 'customers', 'movements', 'stock'])}
            className="erp-btn-ghost"
          >
            📊 تصفير لوحة التحكم — المبيعات والعملاء والمخزون
          </button>
          <button
            type="button"
            onClick={() =>
              applyPreset([
                'sales', 'purchasing', 'expenses', 'damage', 'production',
                'movements', 'stock', 'supplies', 'customers', 'suppliers', 'audit',
              ])
            }
            className="erp-btn-ghost"
          >
            🧹 بداية جديدة بالكامل — كل شيء عدا المنتجات
          </button>
          {picked.size > 0 && (
            <button type="button" onClick={() => setPicked(new Set())} className="erp-btn-ghost">
              ✕ إلغاء التحديد
            </button>
          )}
        </div>

        {picked.size > 0 && (
          <p className="mt-3 rounded-lg border border-bad bg-card px-3 py-2 text-[0.7rem] leading-[1.9] text-txt-2">
            سيُمسح: <strong className="text-bad">{pickedLabels.join(' · ')}</strong>
            <br />
            <span className="tnum">{totalRows.toLocaleString('en-US')}</span> سجل من{' '}
            <span className="tnum">{picked.size}</span> مجموعة.
          </p>
        )}

        {/* التفصيل مطويّ: من أراد بنداً بعينه يفتحه، ولا يحجب الأزرار عمّن لا يريده. */}
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-[0.7rem] font-medium text-txt-3">
            تعديل يدوي بند-بند (اختياري)
          </summary>
          <div className="mt-3 space-y-2.5">
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
        </details>
      </div>

      {/* ٢. التأكيد والتنفيذ — ظاهران دائماً، والزر معطّل حتى يكتمل الشرطان. */}
      <div className="rounded-xl border border-line bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-txt">٢ · أكّد ونفّذ</p>
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">
            اكتب كلمة <strong className="text-bad">تصفير</strong> بخط يدك
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
        {!ready && (
          <p className="mt-2 text-[0.7rem] text-txt-4">
            {picked.size === 0
              ? 'اختر أولاً من الأزرار بالأعلى.'
              : 'اكتب «تصفير» في الخانة ليعمل الزر.'}
          </p>
        )}
      </div>

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
      className="mt-3 rounded-lg bg-bad px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      {pending ? 'جارٍ أخذ نسخة احتياطية والمسح…' : 'نفّذ التصفير'}
    </button>
  );
}
