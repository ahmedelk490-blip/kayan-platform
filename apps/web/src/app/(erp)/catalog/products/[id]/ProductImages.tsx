'use client';

import { useActionState, useRef, useState } from 'react';
import Image from 'next/image';
import { SubmitButton, FormError } from '@/components/crud/Form';

interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}
type UploadAction = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * إدارة صور المنتج من النظام.
 *
 * المدير يرفع الصور ويحذفها ويعيّن الأساسية ويرتّبها — وتظهر على المنتج
 * وصفحته والكتالوج فوراً. الصور المرفوعة تُخزَّن بايتات في القاعدة فتنجو
 * من النشر. الصورة الأساسية هي التي تُعرض في البطاقات.
 */
export function ProductImages({
  images,
  upload,
  remove,
  setPrimary,
  move,
}: {
  images: { id: string; src: string; isPrimary: boolean; isUploaded: boolean }[];
  upload: UploadAction;
  remove: (imageId: string) => Promise<void>;
  setPrimary: (imageId: string) => Promise<void>;
  move: (imageId: string, dir: 'up' | 'down') => Promise<void>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(upload, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/* الصور الحالية */}
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <div
              key={img.id}
              className={`group relative overflow-hidden rounded-lg border ${img.isPrimary ? 'border-brand ring-1 ring-brand' : 'border-line'}`}
            >
              <div className="relative aspect-square bg-card-2">
                <Image src={img.src} alt="" fill sizes="120px" className="object-cover" unoptimized={img.isUploaded} />
              </div>
              {img.isPrimary && (
                <span className="absolute right-1 top-1 rounded bg-brand px-1.5 py-0.5 text-[0.6rem] text-white">
                  الأساسية
                </span>
              )}
              {/* أزرار التحكّم تظهر عند المرور */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!img.isPrimary && (
                  <form action={setPrimary.bind(null, img.id)}>
                    <button type="submit" title="تعيين كأساسية" className="rounded px-1.5 py-0.5 text-[0.6rem] text-white hover:text-brand">
                      ★
                    </button>
                  </form>
                )}
                <form action={move.bind(null, img.id, 'up')}>
                  <button type="submit" disabled={i === 0} title="لليمين" className="rounded px-1 text-[0.7rem] text-white hover:text-brand disabled:opacity-30">
                    ›
                  </button>
                </form>
                <form action={move.bind(null, img.id, 'down')}>
                  <button type="submit" disabled={i === images.length - 1} title="لليسار" className="rounded px-1 text-[0.7rem] text-white hover:text-brand disabled:opacity-30">
                    ‹
                  </button>
                </form>
                <form action={remove.bind(null, img.id)}>
                  <button type="submit" title="حذف" className="rounded px-1.5 py-0.5 text-[0.6rem] text-white hover:text-bad">
                    حذف
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-txt-4">لا صور بعد. ارفع أول صورة أدناه.</p>
      )}

      {/* رفع صورة جديدة */}
      <form
        ref={formRef}
        action={async (fd) => {
          await formAction(fd);
          formRef.current?.reset();
          setPreview(null);
        }}
        className="space-y-3 border-t border-line pt-4"
      >
        <FormError message={state.error} />
        <div>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            className="block w-full text-xs text-txt-3 file:me-3 file:rounded-md file:border-0 file:bg-brand-fill file:px-4 file:py-2 file:text-xs file:text-on-brand hover:file:opacity-90"
          />
          <p className="mt-1 text-[0.7rem] text-txt-4">JPG أو PNG أو WebP حتى 8 ميجابايت. تُصغَّر تلقائياً.</p>
          {state.fieldErrors?.image && <p className="mt-1 text-[0.7rem] text-bad">{state.fieldErrors.image}</p>}
        </div>
        {preview && (
          <div className="overflow-hidden rounded-lg border border-line bg-card-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="معاينة" className="max-h-44 w-full object-contain" />
          </div>
        )}
        <div className="flex items-center gap-3">
          <SubmitButton label="ارفع الصورة" />
          {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
        </div>
      </form>
    </div>
  );
}
