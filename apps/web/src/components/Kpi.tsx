/**
 * KPI tile and empty-state — the two primitives every dashboard uses.
 *
 * `EmptyMetric` exists because most of the ERP has no data yet. A tile
 * showing "0 ج.م" would read as a measured zero; this reads as "not built",
 * which is the truth. Constitution P5: gaps are stated.
 */

export function Kpi({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="erp-card p-5">
      <p className="text-xs text-txt-3">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-2xl text-txt">{value}</span>
        {unit && <span className="text-xs text-txt-3">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-[0.7rem] text-txt-4">{hint}</p>}
    </div>
  );
}

export function EmptyMetric({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="erp-card border-dashed p-5 opacity-70">
      <p className="text-xs text-txt-3">{label}</p>
      <p className="mt-2 text-sm text-txt-4">—</p>
      <p className="mt-1.5 text-[0.7rem] text-txt-4">{reason}</p>
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="erp-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-sm text-txt">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
