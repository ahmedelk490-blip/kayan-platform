'use client';

import { useActionState } from 'react';
import { SubmitButton, FormError } from '@/components/crud/Form';

interface FormState {
  error?: string;
  ok?: string;
}

/**
 * إضافة عدة ألوان للمنتج دفعة واحدة.
 *
 * شبكة عيّنات ملوّنة يختار منها المدير ما شاء ويضيفها بضغطة واحدة — بدل
 * إنشاء متغيّر لكل لون على حدة. اللون المختار يصير متغيّراً يظهر على
 * المنتج وصفحته العامة وفي اختيار الأمر والفاتورة.
 */
export function AddColorsForm({
  action,
  colors,
  sizes = [],
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  colors: { id: string; nameAr: string; hex: string | null }[];
  sizes?: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  if (colors.length === 0 && sizes.length === 0) {
    return (
      <p className="text-xs text-txt-4">
        لا ألوان ولا مقاسات معرَّفة بعد. أضِفها من شاشة «التصنيفات والقوائم».
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      {colors.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-txt-2">الألوان</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {colors.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-txt-2 transition-colors hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
              >
                <input type="checkbox" name="colorIds" value={c.id} className="peer sr-only" />
                <span
                  aria-hidden
                  className="h-5 w-5 shrink-0 rounded-full border border-line-2 peer-checked:ring-2 peer-checked:ring-brand peer-checked:ring-offset-1"
                  style={{ backgroundColor: c.hex ?? 'transparent' }}
                />
                {c.nameAr}
              </label>
            ))}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-txt-2">المقاسات</p>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label
                key={s.id}
                className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-txt-2 transition-colors hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
              >
                <input type="checkbox" name="sizeIds" value={s.id} className="peer sr-only" />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <p className="text-[0.7rem] text-txt-4">
        باختيار ألوان ومقاسات معاً يُنشأ متغيّر لكل تركيبة (لون×مقاس) ويظهر في المخزون.
      </p>

      <div className="flex items-center gap-3">
        <SubmitButton label="أضف الألوان والمقاسات المختارة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
