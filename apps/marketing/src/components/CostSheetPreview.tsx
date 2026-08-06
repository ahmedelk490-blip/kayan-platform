'use client';

import { useState } from 'react';
import { cn, formatNumber } from '@erp/utils';

/**
 * WOW #9 — Interactive Dashboard Preview.
 * Interaction grammar: real UI, genuinely clickable. Not a video, not a
 * rendering.
 *
 * It shows the Cost Sheet derivation tree (04_Database_Design §8) because
 * that is the single capability no generic ERP offers: every figure expands
 * to the formula version, the inputs, and where each input came from.
 *
 * Styled to the ERP philosophy, not the marketing one — dense, quiet, fast
 * (07_UI_UX §5). It proves the dashboard is comfortable by being comfortable.
 *
 * Uses @erp/brand tokens only. When @erp/ui-erp exists (Phase 4) this should
 * consume it instead — see 07_UI_UX §10.5.3.
 */

interface Input {
  name: string;
  value: string;
  source: string;
}

interface Node {
  id: string;
  label: string;
  value: number;
  formula?: string;
  inputs?: Input[];
  children?: Node[];
}

const SHEET: Node[] = [
  {
    id: 'material',
    label: 'Material cost',
    value: 42150.0,
    children: [
      {
        id: 'fabric',
        label: 'Fabric — polyester hi-vis',
        value: 44452.8,
        formula: 'FRM-UNIF-FAB v3',
        inputs: [
          { name: 'size_matrix[L]', value: '1.42 m²', source: 'BOM v7 · line 2' },
          { name: 'unit_cost', value: '58.00', source: 'FIFO layer LT-4471' },
          { name: 'waste_pct', value: '8.0%', source: 'BOM v7 · line 2' },
          { name: 'quantity', value: '500', source: 'Sales order SO-1180' },
        ],
      },
      {
        id: 'tape',
        label: 'Reflective tape — EN ISO 20471',
        value: 6820.0,
        formula: 'FRM-UNIF-TRIM v2',
        inputs: [
          { name: 'length_per_unit', value: '2.20 m', source: 'BOM v7 · line 5' },
          { name: 'unit_cost', value: '6.20', source: 'Weighted average' },
        ],
      },
    ],
  },
  {
    id: 'printing',
    label: 'Printing cost',
    value: 1060.0,
    formula: 'FRM-PRINT-SCR v5',
    inputs: [
      { name: 'setup_plates', value: '2 × 180.00', source: 'Work centre WC-SCR-01' },
      { name: 'run_rate', value: '1.40 / unit', source: 'Work centre WC-SCR-01' },
      { name: 'amortised_over', value: '500', source: 'Run quantity' },
    ],
  },
  {
    id: 'embroidery',
    label: 'Embroidery cost',
    value: 9840.0,
    formula: 'FRM-EMB-STITCH v2',
    inputs: [
      { name: 'stitch_count', value: '8,400', source: 'Design DSN-0042 v3' },
      { name: 'heads', value: '12', source: 'Work centre WC-EMB-02' },
      { name: 'machine_rate', value: '210.00 / hr', source: 'Work centre WC-EMB-02' },
      { name: 'digitising', value: 'amortised', source: 'Design DSN-0042 · 6 orders' },
    ],
  },
  {
    id: 'labour',
    label: 'Labour — cut, make, trim',
    value: 12400.0,
    formula: 'FRM-CMT-LAB v4',
    inputs: [
      { name: 'minutes_per_unit', value: '18.5', source: 'Routing RT-88 · stage 3' },
      { name: 'labour_rate', value: '80.40 / hr', source: 'Work centre WC-SEW-04' },
    ],
  },
  {
    id: 'packaging',
    label: 'Packaging',
    value: 2250.0,
    formula: 'FRM-PACK v1',
    inputs: [{ name: 'unit_cost', value: '4.50', source: 'BOM v7 · line 9' }],
  },
  {
    id: 'waste',
    label: 'Waste allowance',
    value: 3504.3,
    formula: 'FRM-WASTE v2',
    inputs: [
      { name: 'stage_waste', value: '4.2%', source: 'Routing RT-88' },
      { name: 'applied_to', value: 'material + labour', source: 'Costing policy' },
    ],
  },
];

const TOTAL = 71204.3;
const UNITS = 500;

function money(value: number) {
  return formatNumber(value, 'en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Row({ node, depth = 0 }: { node: Node; depth?: number }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(node.children?.length || node.inputs?.length);

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 border-b border-ink-800/60 py-2.5 pe-4 text-sm',
          expandable && 'cursor-pointer hover:bg-ink-800/40',
        )}
        style={{ paddingInlineStart: `${16 + depth * 18}px` }}
        {...(expandable
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-expanded': open,
              onClick: () => setOpen((v) => !v),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setOpen((v) => !v);
                }
              },
            }
          : {})}
      >
        <span
          aria-hidden="true"
          className={cn(
            'w-3 shrink-0 font-mono text-[0.7rem] transition-transform duration-200',
            expandable ? 'text-neutral-500' : 'text-transparent',
            open && 'rotate-90',
          )}
        >
          ›
        </span>

        <span className={cn('min-w-0 flex-1 truncate', depth === 0 ? 'text-neutral-100' : 'text-neutral-300')}>
          {node.label}
        </span>

        {node.formula && (
          <span className="hidden shrink-0 font-mono text-[0.68rem] text-neutral-500 sm:inline">
            {node.formula}
          </span>
        )}

        <span
          className={cn(
            'w-28 shrink-0 text-end font-mono tabular-nums',
            depth === 0 ? 'text-neutral-100' : 'text-neutral-400',
          )}
        >
          {money(node.value)}
        </span>
      </div>

      {open && node.inputs && (
        <dl className="border-b border-ink-800/60 bg-ink-950/60 py-2">
          {node.inputs.map((input) => (
            <div
              key={input.name}
              className="flex items-center gap-3 py-1.5 pe-4 text-[0.78rem]"
              style={{ paddingInlineStart: `${47 + depth * 18}px` }}
            >
              <dt className="w-40 shrink-0 truncate font-mono text-neutral-500">{input.name}</dt>
              <dd className="w-24 shrink-0 font-mono tabular-nums text-accent">{input.value}</dd>
              <dd className="min-w-0 flex-1 truncate text-neutral-500">← {input.source}</dd>
            </div>
          ))}
        </dl>
      )}

      {open && node.children?.map((child) => <Row key={child.id} node={child} depth={depth + 1} />)}
    </>
  );
}

export function CostSheetPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span className="font-mono text-xs text-neutral-300">CS-2026-0001 · rev 1</span>
        </div>
        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-500">
          Hi-vis vest · hybrid · 500 units
        </span>
      </div>

      <p className="border-b border-ink-800 px-4 py-2.5 text-xs text-neutral-500">
        Select any line to expand its derivation — formula version, inputs, and the source of
        each input.
      </p>

      <div>
        {SHEET.map((node) => (
          <Row key={node.id} node={node} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3.5 text-sm">
        <span className="text-neutral-100">Total production cost</span>
        <span className="font-mono tabular-nums text-neutral-100">{money(TOTAL)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-ink-800 bg-ink-950/60 px-4 py-3.5 text-sm">
        <span className="text-neutral-400">Cost per unit</span>
        <span className="font-mono tabular-nums text-accent">{money(TOTAL / UNITS)}</span>
      </div>
    </div>
  );
}
