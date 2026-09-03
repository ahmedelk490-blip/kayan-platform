'use client';

import { useActionState, useState } from 'react';
import { formatMoney } from '@erp/domain';
import { Select, SubmitButton, FormError } from '@/components/crud/Form';
import { SearchableSelect } from '@/components/crud/SearchableSelect';
import type { FormState } from '@/lib/ops';

export interface Option {
  value: string;
  label: string;
}

export interface DamageProduct {
  id: string;
  nameAr: string;
  cost: number | null;
  colors: Option[];
}

export interface DamageVariant {
  id: string;
  productId: string;
  colorId: string | null;
  sizeId: string | null;
  sizeCode: string | null;
}

/**
 * محضر هالك — نوع المنتج، اللون، نوع الخدمة، والعدد. المنتج واللون بحثٌ بالكتابة
 * (قوائم طويلة). التكلفة تُحسب حيّاً = تكلفة القطعة × العدد، وتُعرض قبل الحفظ،
 * أو تُكتب يدوياً فتتجاوز التلقائي.
 */
export function DamageForm({
  action,
  products,
  colors,
  services,
  employees = [],
  variants = [],
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  products: DamageProduct[];
  colors: Option[];
  services: Option[];
  /** الموظف المتسبب (اختياري) — عند اعتماد الهالك يُنشأ له جزاء بقيمة التكلفة. */
  employees?: Option[];
  /** متغيّرات المستأجر — لحلّ (منتج×لون×مقاس) فيُخصم الهالك من مخزونه عند الاعتماد. */
  variants?: DamageVariant[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [productId, setProductId] = useState('');
  const [colorId, setColorId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [qty, setQty] = useState(0);
  const [manualCost, setManualCost] = useState('');

  const product = products.find((p) => p.id === productId);

  // مقاسات (منتج × لون) المتاحة، وحلّ المتغيّر: تطابق تام، أو المتغيّر
  // الوحيد للمنتج — فيُخصم المخزون من الرصيد الصحيح عند الاعتماد.
  const productVariants = variants.filter((v) => v.productId === productId);
  const colorVariants = productVariants.filter((v) => (v.colorId ?? '') === colorId);
  const sizeOptions = [...new Map(
    colorVariants.filter((v) => v.sizeId && v.sizeCode).map((v) => [v.sizeId!, v.sizeCode!]),
  )].map(([id, label]) => ({ value: id, label }));
  const resolvedVariant =
    colorVariants.find((v) => (v.sizeId ?? '') === sizeId) ??
    (productVariants.length === 1 ? productVariants[0] : undefined);
  const pieceCost = product?.cost ?? null;
  const autoTotal = pieceCost !== null ? pieceCost * qty : null;
  const shownTotal = manualCost.trim() !== '' ? Number(manualCost) || 0 : autoTotal;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormError message={state.error} />
      {state.ok && (
        <p role="status" className="rounded-lg border border-ok bg-ok-soft px-4 py-2.5 text-xs text-ok">{state.ok}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* ١) نوع المنتج — بحث بالكتابة */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">نوع المنتج</span>
          <SearchableSelect
            name="productId"
            options={products.map((p) => ({ value: p.id, label: p.nameAr }))}
            placeholder="ابحث عن المنتج…"
            onSelect={setProductId}
          />
          {state.fieldErrors?.productId && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.productId}</span>
          )}
        </label>

        {/* ٢) اللون — بحث بالكتابة، كل الألوان متاحة */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">اللون</span>
          <SearchableSelect
            name="colorId"
            options={colors}
            placeholder={colors.length ? 'ابحث عن اللون…' : 'لا ألوان معرّفة'}
            onSelect={(v) => {
              setColorId(v);
              setSizeId('');
            }}
          />
        </label>

        {/* ٢.٥) المقاس — يظهر حين توجد مقاسات لهذا المنتج/اللون؛ تحديده يجعل
            الاعتماد يخصم القطع التالفة من رصيد المتغيّر الصحيح تلقائياً. */}
        {sizeOptions.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-xs text-txt-2">
              المقاس <span className="text-txt-4">(ليُخصم من المخزون)</span>
            </span>
            <select
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
              className="erp-input py-2.5"
            >
              <option value="">اختر المقاس…</option>
              {sizeOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        <input type="hidden" name="variantId" value={resolvedVariant?.id ?? ''} />

        {/* ٣) نوع الخدمة */}
        <Select name="service" label="نوع الخدمة" options={services} placeholder="اختر الخدمة" errors={state.fieldErrors} />

        {/* ٤) العدد */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">العدد</span>
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            dir="ltr"
            value={qty || ''}
            onChange={(e) => setQty(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            className="erp-input py-2.5 text-start"
          />
          {state.fieldErrors?.quantity && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.quantity}</span>
          )}
        </label>

        {/* ٥) التكلفة اليدوية (اختياري) — تتجاوز الحساب التلقائي إن مُلئت */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-txt-2">التكلفة (يدوي — اختياري)</span>
          <input
            name="manualCost"
            type="number"
            min="0"
            step="0.01"
            dir="ltr"
            value={manualCost}
            onChange={(e) => setManualCost(e.target.value)}
            placeholder="تلقائي"
            className="erp-input py-2.5 text-start"
          />
          {state.fieldErrors?.manualCost && (
            <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.manualCost}</span>
          )}
        </label>

        {/* ٦) الموظف المتسبب (اختياري) — يتولّد له جزاء تلقائي عند الاعتماد */}
        {employees.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-xs text-txt-2">
              الموظف المتسبب <span className="text-txt-4">(اختياري — يُخصم من راتبه)</span>
            </span>
            <SearchableSelect name="employeeId" options={employees} placeholder="ابحث عن الموظف…" />
            {state.fieldErrors?.employeeId && (
              <span className="mt-1 block text-[0.7rem] text-bad">{state.fieldErrors.employeeId}</span>
            )}
          </label>
        )}
      </div>

      {/* ٧) سبب الهالك — نص حرّ يتصدّر سبب السجل. */}
      <label className="block">
        <span className="mb-1.5 block text-xs text-txt-2">سبب الهالك — اكتبه بحرية</span>
        <textarea
          name="reasonNote"
          rows={2}
          placeholder="مثال: خطأ في الطباعة، حرق أثناء الكوي، قصّ خاطئ…"
          className="erp-input resize-y py-2.5"
        />
      </label>

      {/* إجمالي الهالك — يظهر حيّاً قبل الحفظ */}
      <div className="flex items-center justify-between rounded-xl border border-line bg-card-2 px-4 py-3">
        <span className="text-xs text-txt-2">
          إجمالي تكلفة الهالك
          {manualCost.trim() !== '' ? ' (يدوي)' : pieceCost !== null ? ` (${formatMoney(pieceCost)} × ${qty})` : ''}
        </span>
        <span className="tnum text-lg font-bold text-brand">
          {shownTotal !== null ? formatMoney(shownTotal) : '—'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="تسجيل الهالك" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        التكلفة تُحسب تلقائياً من تكلفة قطعة المنتج × العدد — أو اكتبها يدوياً في خانة «التكلفة»
        لتتجاوز الحساب التلقائي. يُسجَّل الهالك بانتظار الاعتماد، ويظهر في «الهالك» بالبيان المالي بعد اعتماده.
        ولو حُدّد موظف متسبب، فعند اعتماد الهالك يُنشأ له <span className="font-medium text-warn">جزاء تلقائي بقيمة التكلفة</span> (بانتظار
        اعتماد الجزاء) فيُخصم من راتبه في تحليل الموظفين.
        {resolvedVariant
          ? ' وعند الاعتماد ستُخصم القطع التالفة من المخزون تلقائياً.'
          : ' حدِّد اللون والمقاس ليُخصم التالف من المخزون تلقائياً عند الاعتماد — وإلا سجِّل حركة إخراج يدوية.'}
      </p>
    </form>
  );
}
