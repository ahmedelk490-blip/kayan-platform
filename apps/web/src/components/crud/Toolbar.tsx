'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * شريط البحث والترتيب.
 *
 * Writes to the URL rather than to component state, so the server re-queries
 * and the result is linkable. `useTransition` keeps the input responsive
 * while the server round-trip is in flight.
 */
export function Toolbar({
  placeholder = 'ابحث…',
  sorts,
}: {
  placeholder?: string;
  sorts: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(params.get('q') ?? '');

  function push(next: URLSearchParams) {
    next.delete('page'); // any filter change returns to page 1
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function onSearch(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (value.trim()) next.set('q', value.trim());
    else next.delete('q');
    push(next);
  }

  function onSort(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(params.toString());
    next.set('sort', event.target.value);
    push(next);
  }

  function toggleDir() {
    const next = new URLSearchParams(params.toString());
    next.set('dir', params.get('dir') === 'desc' ? 'asc' : 'desc');
    push(next);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form onSubmit={onSearch} className="flex flex-1 gap-2" role="search">
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="بحث"
          className="erp-input max-w-xs py-2"
        />
        <button type="submit" className="erp-btn-ghost">
          بحث
        </button>
      </form>

      <label className="flex items-center gap-2 text-xs text-txt-3">
        ترتيب
        <select
          value={params.get('sort') ?? sorts[0]?.value}
          onChange={onSort}
          className="erp-input w-auto py-2 text-xs"
        >
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={toggleDir}
        className="erp-btn-ghost"
        aria-label={params.get('dir') === 'desc' ? 'تنازلي' : 'تصاعدي'}
      >
        {params.get('dir') === 'desc' ? '↓ تنازلي' : '↑ تصاعدي'}
      </button>

      {pending && <span className="text-xs text-txt-4">جارٍ التحديث…</span>}
    </div>
  );
}
