'use client';

import { useActionState, useRef, useState } from 'react';
import Image from 'next/image';
import { Field, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * حقل صورة بمعاينة قبل الرفع.
 *
 * المعاينة من الملف المحلي عبر object URL، لا رفع بعد. تُرى الصورة كما
 * ستُخزَّن قبل الضغط على حفظ، فلا مفاجأة بعده.
 */
function ImagePicker({
  name,
  error,
  required,
  hint,
}: {
  name: string;
  error?: string;
  required?: boolean;
  hint?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-txt-2">
        الصورة {required && <span className="text-bad">*</span>}
      </label>
      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp,image/avif"
        required={required}
        onChange={(e) => {
          const file = e.target.files?.[0];
          setPreview(file ? URL.createObjectURL(file) : null);
        }}
        className="block w-full text-xs text-txt-3 file:me-3 file:rounded-md file:border-0 file:bg-brand-fill file:px-4 file:py-2 file:text-xs file:text-on-brand hover:file:opacity-90"
      />
      {hint && <p className="mt-1 text-[0.7rem] text-txt-4">{hint}</p>}
      {error && <p className="mt-1 text-[0.7rem] text-bad">{error}</p>}
      {preview && (
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-card-2">
          {/* معاينة محلية — img عادي لا next/image: المصدر blob مؤقّت. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="معاينة" className="max-h-52 w-full object-contain" />
        </div>
      )}
    </div>
  );
}

/** نموذج إضافة شريحة جديدة. */
export function CreateSlideForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await formAction(fd);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="title" label="اسم الشريحة" required errors={state.fieldErrors} hint="يظهر أسفل الصورة." />
        <Field name="subtitle" label="سطر ثانٍ (اختياري)" errors={state.fieldErrors} hint="وصف قصير تحت الاسم." />
      </div>

      <ImagePicker
        name="image"
        required
        error={state.fieldErrors?.image}
        hint="JPG أو PNG أو WebP، حتى 8 ميجابايت. تُصغَّر تلقائياً."
      />

      <div className="flex items-center gap-3">
        <SubmitButton label="أضف الشريحة" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}

/**
 * صف شريحة قائمة: معاينة + تعديل النص/الصورة + الترتيب + التفعيل + الحذف.
 *
 * أزرار الترتيب والتفعيل والحذف نماذج بسيطة تنفّذ إجراءات خادمية مباشرة —
 * لا حالة عميل تُدار، فالخادم يعيد تصيير القائمة بعد كل فعل.
 */
export function SlideRow({
  slide,
  isFirst,
  isLast,
  updateText,
  toggle,
  move,
  remove,
}: {
  slide: { id: string; title: string; subtitle: string; isActive: boolean; src: string };
  isFirst: boolean;
  isLast: boolean;
  updateText: Action;
  toggle: () => Promise<void>;
  move: (dir: 'up' | 'down') => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateText, {});
  const [editing, setEditing] = useState(false);

  return (
    <div className={`rounded-xl border p-4 ${slide.isActive ? 'border-line bg-card' : 'border-dashed border-line bg-card-2 opacity-70'}`}>
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* المعاينة */}
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg border border-line bg-card-2 sm:w-52">
          <Image src={slide.src} alt={slide.title} fill sizes="220px" className="object-contain" unoptimized />
          {!slide.isActive && (
            <span className="absolute right-2 top-2 rounded bg-bad/90 px-2 py-0.5 text-[0.65rem] text-white">
              معطّلة
            </span>
          )}
        </div>

        {/* التفاصيل والتحكّم */}
        <div className="min-w-0 flex-1">
          {!editing ? (
            <>
              <p className="text-sm font-medium text-txt">{slide.title}</p>
              {slide.subtitle && <p className="mt-1 text-xs text-txt-3">{slide.subtitle}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setEditing(true)} className="text-[0.72rem] text-brand hover:underline">
                  تعديل النص أو الصورة
                </button>
                <span className="text-txt-5">·</span>
                <form action={move.bind(null, 'up')}>
                  <button type="submit" disabled={isFirst} className="text-[0.72rem] text-txt-3 hover:underline disabled:opacity-30">
                    ↑ أعلى
                  </button>
                </form>
                <form action={move.bind(null, 'down')}>
                  <button type="submit" disabled={isLast} className="text-[0.72rem] text-txt-3 hover:underline disabled:opacity-30">
                    ↓ أسفل
                  </button>
                </form>
                <span className="text-txt-5">·</span>
                <form action={toggle}>
                  <button type="submit" className={`text-[0.72rem] hover:underline ${slide.isActive ? 'text-bad' : 'text-ok'}`}>
                    {slide.isActive ? 'تعطيل' : 'تفعيل'}
                  </button>
                </form>
                <span className="text-txt-5">·</span>
                <form action={remove}>
                  <button
                    type="submit"
                    className="text-[0.72rem] text-bad hover:underline"
                    // حذف بايتات لا رجعة له — تأكيد في المتصفّح يكفي لشيء
                    // بلا تاريخ محاسبي يشير إليه.
                  >
                    حذف
                  </button>
                </form>
              </div>
            </>
          ) : (
            <form action={formAction} className="space-y-3">
              <FormError message={state.error} />
              <Field name="title" label="اسم الشريحة" defaultValue={slide.title} required errors={state.fieldErrors} />
              <Field name="subtitle" label="سطر ثانٍ" defaultValue={slide.subtitle} errors={state.fieldErrors} />
              <ImagePicker name="image" error={state.fieldErrors?.image} hint="اتركها فارغة للإبقاء على الصورة الحالية." />
              <div className="flex items-center gap-3">
                <SubmitButton label="حفظ التعديل" />
                <button type="button" onClick={() => setEditing(false)} className="text-xs text-txt-3 hover:underline">
                  إلغاء
                </button>
                {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
