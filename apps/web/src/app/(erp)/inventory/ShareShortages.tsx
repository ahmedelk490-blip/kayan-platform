'use client';

import { useState } from 'react';

/**
 * مشاركة قائمة النواقص — نسخٌ للحافظة أو فتحٌ في واتساب لإرسالها للمورّد.
 * النص يُبنى في الخادم من الجدول الكامل؛ لا شيء يُرسل من تلقاء نفسه.
 */
export function ShareShortages({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* حافظة غير متاحة — زر واتساب يبقى بديلاً */
          }
        }}
        className="rounded-lg border border-line px-3 py-1.5 text-[0.7rem] font-medium text-txt-2 transition-colors hover:border-brand hover:text-brand"
      >
        {copied ? '✓ نُسخت' : 'نسخ القائمة'}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-line px-3 py-1.5 text-[0.7rem] font-medium text-txt-2 transition-colors hover:border-brand hover:text-brand"
      >
        إرسال واتساب للمورّد
      </a>
    </div>
  );
}
