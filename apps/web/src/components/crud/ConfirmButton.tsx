'use client';

import { useFormStatus } from 'react-dom';

/**
 * زر إرسال للأفعال الخطرة: يسأل قبل التنفيذ ويتعطّل أثناء الإرسال.
 *
 * يوضع داخل <form action={…}> مكان الزر العادي. التأكيد يمنع لمسة الجوال
 * الخاطئة من حذفٍ أو عكسٍ فوري، والتعطيل أثناء الإرسال يمنع الضغطة المزدوجة
 * من تنفيذ الفعل مرتين.
 */
export function ConfirmButton({
  label,
  message,
  pendingLabel = 'جارٍ التنفيذ…',
  className = 'text-[0.7rem] text-bad hover:underline disabled:opacity-50',
}: {
  label: string;
  /** نص سؤال التأكيد — اجعله يذكر عاقبة الفعل لا اسمه فقط. */
  message: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
