'use client';

import { useMemo, useState } from 'react';
import { Table, Badge } from '@/components/crud/Shell';
import { normalizeDigits } from '@/lib/num';

export interface StocktakeRow {
  id: string;
  label: string;
  warehouse: string;
  dozens: number;
  looseP: number;
  /** إجمالي القطع مهيأً للعرض. */
  onHand: string;
  ppd: number;
  unitCost: string | null;
  value: string | null;
  status: string;
  tone: 'ok' | 'bad' | 'muted';
}

/**
 * جرد مبسّط «المهم أولاً»: بحث فوري وأنت تكتب، وأعمدة القراءة اليومية فقط
 * (الصنف، المخزن، الدست والقطعة، الإجمالي، الحالة). أعمدة المحاسبة (قطع
 * الدستة، التكلفة، القيمة) خلف زر «التفاصيل» — يقرأها من يحتاجها ولا تزحم
 * من يسأل «كم باقي عندي؟».
 */
export function StocktakeTable({ rows, totalValue }: { rows: StocktakeRow[]; totalValue: string }) {
  const [query, setQuery] = useState('');
  const [details, setDetails] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeDigits(query).toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.label.toLowerCase().includes(q) || r.warehouse.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const baseHeaders = ['الصنف', 'المخزن', 'الدست والقطعة', 'إجمالي القطع', 'الحالة'];
  const detailHeaders = ['الصنف', 'المخزن', 'الدست والقطعة', 'إجمالي القطع', 'قطع الدستة', 'تكلفة القطعة', 'القيمة', 'الحالة'];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="اكتب اسم الصنف تلاقيه فوراً…"
          className="erp-input w-full max-w-xs py-2.5"
        />
        <div className="flex items-center gap-3">
          <span className="tnum text-[0.7rem] text-txt-4">
            {filtered.length} صنف · القيمة الإجمالية{' '}
            <span className="font-semibold text-brand">{totalValue}</span>
          </span>
          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            className="rounded-lg border border-line px-3 py-1.5 text-[0.7rem] font-medium text-txt-2 transition-colors hover:border-brand hover:text-brand"
          >
            {details ? 'إخفاء التفاصيل' : 'التفاصيل والتكاليف'}
          </button>
        </div>
      </div>

      <Table headers={details ? detailHeaders : baseHeaders} empty={filtered.length === 0}>
        {filtered.map((r) => (
          <tr key={r.id} className="hover:bg-card-2">
            <td className="px-4 py-3 text-txt">{r.label}</td>
            <td className="px-4 py-3 text-txt-3">{r.warehouse}</td>
            <td className="tnum px-4 py-3 font-semibold text-txt">
              {r.dozens > 0 ? `${r.dozens} دست` : ''}
              {r.dozens > 0 && r.looseP > 0 ? ' + ' : ''}
              {r.looseP > 0 ? `${r.looseP} قطعة` : r.dozens === 0 ? '—' : ''}
            </td>
            <td className="tnum px-4 py-3 text-txt-2">{r.onHand}</td>
            {details && <td className="tnum px-4 py-3 text-txt-4">{r.ppd}</td>}
            {details && (
              <td className="tnum px-4 py-3 text-txt-3">
                {r.unitCost === null ? <span className="text-warn">—</span> : r.unitCost}
              </td>
            )}
            {details && (
              <td className="tnum px-4 py-3 font-medium text-brand">{r.value ?? '—'}</td>
            )}
            <td className="px-4 py-3">
              <Badge tone={r.tone}>{r.status}</Badge>
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
        «الدست والقطعة» محسوبان من إجمالي القطع على أساس قطع دستة كل منتج (تُضبط من صفحة
        المنتج). زر «التفاصيل والتكاليف» يُظهر التكلفة والقيمة لمن يحتاجها.
      </p>
    </section>
  );
}
