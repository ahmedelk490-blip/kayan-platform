'use client';

import { useMemo, useRef, useState } from 'react';

export interface SearchOption {
  value: string;
  label: string;
}

/**
 * قائمة اختيار قابلة للبحث بالكتابة — بديل الـ<select> حين تطول الخيارات
 * (العملاء مثلاً). يُكتب للتصفية، والقائمة تُعرض بترتيبها كما وردت (الأحدث
 * أولاً)، ويُخزَّن المعرّف في حقل مخفيّ بالاسم المُمرَّر ليُرسَل مع الفورم.
 */
export function SearchableSelect({
  name,
  options,
  placeholder = 'ابحث أو اختر…',
  defaultValue,
  required,
  onSelect,
}: {
  name: string;
  options: SearchOption[];
  placeholder?: string;
  defaultValue?: string | null;
  required?: boolean;
  onSelect?: (value: string) => void;
}) {
  const initial = options.find((o) => o.value === (defaultValue ?? ''));
  const [value, setValue] = useState(initial?.value ?? '');
  const [query, setQuery] = useState(initial?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // بحث غير حسّاس لحالة الأحرف؛ قائمة فارغة الاستعلام تُعرض كاملة بترتيبها.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, 50);
  }, [query, options]);

  function pick(o: SearchOption) {
    setValue(o.value);
    setQuery(o.label);
    setOpen(false);
    onSelect?.(o.value);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        // إغلاق بعد فقد التركيز بمهلة تسمح بالتقاط النقر على عنصر القائمة.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setValue(''); // كتابةٌ جديدة تُلغي الاختيار حتى يُنتقى صريحاً
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); pick(filtered[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        className="erp-input py-2.5"
      />
      <input type="hidden" name={name} value={value} required={required} />

      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-card shadow-xl">
          {filtered.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                // onMouseDown يسبق onBlur فلا تُغلق القائمة قبل الالتقاط.
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setActive(i)}
                className={`block w-full px-3 py-2 text-start text-sm ${
                  i === active ? 'bg-card-2 text-brand' : 'text-txt hover:bg-card-2'
                } ${o.value === value ? 'font-semibold' : ''}`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-txt-4 shadow-xl">
          لا نتائج
        </div>
      )}
    </div>
  );
}
