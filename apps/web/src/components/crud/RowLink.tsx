'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * صفّ جدولٍ يفتح وجهته بالضغط في أي مكانٍ منه — بطلب المالك: «في التقارير
 * أضغط على الطلب فيوديني عليه». رقم الفاتورة داخله يبقى رابطاً حقيقياً (لوحة
 * المفاتيح، وفتحه في تبويبٍ جديد)؛ والضغط على رابطٍ أو زرٍّ داخل الصف، أو
 * تحديد نصٍّ منه للنسخ، لا ينقل.
 */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, input, select, textarea')) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
      className="cursor-pointer transition-colors hover:bg-card-2"
    >
      {children}
    </tr>
  );
}
