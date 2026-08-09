import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { can, FORMULA_KINDS, FORMULA_KIND_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Toolbar } from '@/components/crud/Toolbar';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'المعادلات' };

const SORTS = [
  { value: 'code', label: 'الكود' },
  { value: 'nameAr', label: 'الاسم' },
  { value: 'updatedAt', label: 'آخر تعديل' },
];

export default async function FormulasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('formula.view');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'code',
    allowedSorts: SORTS.map((s) => s.value),
  });
  const kindFilter = Array.isArray(params.kind) ? params.kind[0] : params.kind;

  const where: Prisma.FormulaWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(query.q
      ? { OR: [{ code: { contains: query.q } }, { nameAr: { contains: query.q } }] }
      : {}),
  };

  const [rows, count] = await Promise.all([
    prisma.formula.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        currentVersion: { select: { version: true, _count: { select: { lines: true } } } },
        _count: { select: { versions: true, products: true } },
      },
    }),
    prisma.formula.count({ where }),
  ]);

  const canWrite = can(user.role, 'formula.write');

  return (
    <AppShell user={user} title="المعادلات">
      <ModuleHeader
        title="المعادلات"
        count={count}
        action={
          canWrite ? (
            <Link href="/formulas/new" className="erp-btn">
              معادلة جديدة
            </Link>
          ) : null
        }
      />

      <Toolbar placeholder="ابحث بالكود أو الاسم…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/formulas"
          className={
            kindFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {FORMULA_KINDS.map((k) => (
          <Link
            key={k}
            href={`/formulas?kind=${k}`}
            className={
              kindFilter === k
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {FORMULA_KIND_AR[k]}
          </Link>
        ))}
      </div>

      <Table
        headers={['الكود', 'الاسم', 'النوع', 'الإصدار المنشور', 'البنود', 'الإصدارات', 'المنتجات المرتبطة', '']}
        empty={rows.length === 0}
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.code}
            </td>
            <td className="px-4 py-3 text-txt-2">{row.nameAr}</td>
            <td className="px-4 py-3 text-txt-3">
              {(FORMULA_KIND_AR as Record<string, string>)[row.kind] ?? row.kind}
            </td>
            <td className="px-4 py-3">
              {row.currentVersion ? (
                <Badge tone="ok">إصدار {row.currentVersion.version}</Badge>
              ) : (
                // Not an error, but it does mean this formula costs nothing
                // yet — worth saying plainly rather than showing a dash.
                <Badge tone="muted">لم يُنشر بعد</Badge>
              )}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.currentVersion?._count.lines ?? 0}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.versions}</td>
            <td className="tnum px-4 py-3 text-txt-3">{row._count.products}</td>
            <td className="px-4 py-3 text-end">
              <Link href={`/formulas/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/formulas" query={query} count={count} />
    </AppShell>
  );
}
