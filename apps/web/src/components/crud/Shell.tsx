import Link from 'next/link';
import { buildHref, totalPages, type ListQuery } from '@/lib/query';

/** ترويسة صفحة الوحدة مع إجراء رئيسي. */
export function ModuleHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-lg font-semibold text-brand">{title}</h2>
        {count !== undefined && (
          <span className="tnum text-xs text-txt-3">{count} سجل</span>
        )}
      </div>
      {action}
    </div>
  );
}

/** جدول بيانات بسيط — لا تأثيرات، قراءة سريعة. */
export function Table({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="erp-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-card-2">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-start text-xs font-medium text-txt-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-10 text-center text-sm text-txt-3">
                لا توجد سجلات مطابقة.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  basePath,
  query,
  count,
}: {
  basePath: string;
  query: ListQuery;
  count: number;
}) {
  const pages = totalPages(count, query.perPage);
  if (pages <= 1) return null;

  return (
    <nav className="mt-4 flex items-center justify-center gap-2" aria-label="ترقيم الصفحات">
      <Link
        href={buildHref(basePath, query, { page: Math.max(1, query.page - 1) })}
        aria-disabled={query.page === 1}
        className={query.page === 1 ? 'pointer-events-none opacity-40 erp-btn-ghost' : 'erp-btn-ghost'}
      >
        السابق
      </Link>
      <span className="tnum text-xs text-txt-3">
        صفحة {query.page} من {pages}
      </span>
      <Link
        href={buildHref(basePath, query, { page: Math.min(pages, query.page + 1) })}
        aria-disabled={query.page === pages}
        className={query.page === pages ? 'pointer-events-none opacity-40 erp-btn-ghost' : 'erp-btn-ghost'}
      >
        التالي
      </Link>
    </nav>
  );
}

/** شارة حالة. */
export function Badge({ tone, children }: { tone: 'ok' | 'bad' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-ok-soft text-ok'
      : tone === 'bad'
        ? 'bg-bad-soft text-bad'
        : 'bg-card-2 text-txt-3';
  return <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${cls}`}>{children}</span>;
}
