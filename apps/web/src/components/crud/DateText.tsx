'use client';

import { useState } from 'react';

/** تاريخٌ يُعرض نصاً عربياً («12 ديسمبر 2026») فوق خانة التاريخ الأصلية الشفافة — لا dd/mm/yyyy خام. */
export function DateText({
  name,
  defaultValue,
  placeholder = 'اختر التاريخ',
  className = '',
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  const [v, setV] = useState(defaultValue ?? '');
  const label = v
    ? new Date(`${v}T00:00:00`).toLocaleDateString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })
    : placeholder;
  return (
    <span className={`relative block ${className}`}>
      <span className={`erp-input block py-2 ${v ? 'text-txt' : 'text-txt-4'}`}>{label}</span>
      {/* design-guard-ignore: this IS the approved pattern — invisible native input under formatted text */}
      <input type="date"
        name={name}
        value={v}
        onChange={(e) => setV(e.target.value)}
        aria-label={placeholder}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}
