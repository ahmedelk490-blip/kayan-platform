'use client';

import { useActionState, useState } from 'react';
import { updateCatalogItem, type FormState } from '../actions';
import type { Kind } from '../types';

/**
 * تعديل اسم عنصر قائمة داخل صفّه — زر «تعديل» يفتح حقلاً بالاسم الحالي، والحفظ
 * يعيد التسمية. للألوان يظهر حقل كود اللون (hex) اختيارياً.
 */
export function RenameForm({
  kind,
  id,
  name,
  hex,
}: {
  kind: Kind;
  id: string;
  name: string;
  hex?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(updateCatalogItem.bind(null, kind, id), {});

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand hover:underline">
        تعديل
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input name="nameAr" defaultValue={name} className="erp-input w-40 py-1.5 text-xs" autoFocus />
      {kind === 'colors' && (
        <input name="extra" type="color" defaultValue={hex ?? '#000000'} className="h-8 w-8 cursor-pointer rounded border border-line" title="كود اللون" />
      )}
      <button type="submit" className="text-xs font-medium text-brand hover:underline">حفظ</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-txt-4 hover:underline">إلغاء</button>
      {state.error && <span className="text-[0.7rem] text-bad">{state.error}</span>}
    </form>
  );
}
