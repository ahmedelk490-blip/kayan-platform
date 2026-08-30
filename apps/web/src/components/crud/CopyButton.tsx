'use client';

import { useState } from 'react';

/**
 * زر نسخ نصّ (رقم فاتورة مثلاً) للحافظة — لاستخدامه في محادثة العميل أو
 * تسمية ملفات التصميم على الجهاز، فيُسترجَع التصميم بالبحث عن الكود لاحقاً.
 */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // متصفّح لا يسمح بالحافظة — تحديدٌ يدويّ بديل.
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* تُجوهَل */ }
      el.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`نسخ ${text}`}
      aria-label={`نسخ ${label ?? text}`}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.7rem] text-txt-3 transition-colors hover:border-brand hover:text-brand"
    >
      {done ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          نُسخ
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          نسخ
        </>
      )}
    </button>
  );
}
