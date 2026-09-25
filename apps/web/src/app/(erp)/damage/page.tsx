import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { formatMoney, formatQty, DAMAGE_STATUSES, DAMAGE_STATUS_AR, userCan} from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Pager, Badge } from '@/components/crud/Shell';
import { Note } from '@/components/crud/Note';
import { Toolbar } from '@/components/crud/Toolbar';
import { parseListQuery, skipTake, type SearchParams } from '@/lib/query';

export const metadata: Metadata = { title: 'محاضر الهالك' };

const SORTS = [
  { value: 'damageDate', label: 'التاريخ' },
  { value: 'totalCost', label: 'التكلفة' },
  { value: 'number', label: 'الرقم' },
];

const TONE: Record<string, 'ok' | 'bad' | 'muted'> = {
  APPROVED: 'ok',
  REJECTED: 'bad',
  PENDING: 'muted',
  DRAFT: 'muted',
};

export default async function DamagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('damage.view');
  // رابط أمر الإنتاج لمن يملك فتحه — وإلا رقمٌ نصّي. كان يردّ أمين
  // المخزن من حيث أتى بلا رسالة على أكثر شاشاته استعمالاً.
  const canSeeProduction = userCan(user.role, user.overrides, 'manufacturing.view');
  const seeCosts = userCan(user.role, user.overrides, 'cost.view');
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: 'damageDate',
    allowedSorts: SORTS.map((s) => s.value),
  });
  const statusFilter = Array.isArray(params.status) ? params.status[0] : params.status;

  const where: Prisma.DamageRecordWhereInput = {
    tenantId: user.tenantId,
    isDeleted: false,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q } },
            { reason: { contains: query.q } },
            { department: { contains: query.q } },
          ],
        }
      : {}),
  };

  const [rows, count, approved] = await Promise.all([
    prisma.damageRecord.findMany({
      where,
      orderBy: { [query.sort]: query.dir },
      ...skipTake(query),
      include: {
        employee: { select: { nameAr: true, name: true } },
        product: { select: { nameAr: true } },
        productionOrder: { select: { id: true, number: true } },
        _count: { select: { penalties: true } },
      },
    }),
    prisma.damageRecord.count({ where }),
    prisma.damageRecord.aggregate({
      where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED' },
      _sum: { totalCost: true },
    }),
  ]);

  const canWrite = allows(user, 'damage.write');

  return (
    <AppShell user={user} title="محاضر الهالك">
      <ModuleHeader
        title="محاضر الهالك"
        count={count}
        action={
          canWrite ? (
            <Link href="/damage/new" className="erp-btn">
              محضر جديد
            </Link>
          ) : null
        }
      />

      <Note>
        {seeCosts ? (
          <>
            إجمالي تكلفة الهالك المعتمد:{' '}
            <span className="tnum font-medium text-brand">
              {formatMoney(approved._sum.totalCost ?? 0)}
            </span>{' '}
          </>
        ) : null}
        — المعتمد فقط، لأن المحضر غير المعتمد ليس تكلفة بعد.
      </Note>

      <Toolbar placeholder="ابحث بالرقم أو السبب أو القسم…" sorts={SORTS} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/damage"
          className={
            statusFilter
              ? 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2'
              : 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
          }
        >
          الكل
        </Link>
        {DAMAGE_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/damage?status=${s}`}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand px-3 py-1.5 text-xs text-white'
                : 'rounded-full border border-line-2 px-3 py-1.5 text-xs text-txt-2 hover:border-brand hover:text-brand'
            }
          >
            {DAMAGE_STATUS_AR[s]}
          </Link>
        ))}
      </div>

      <Table
        headers={[
          'الرقم', 'التاريخ', 'الموظف', 'القسم', 'المنتج', 'أمر الإنتاج', 'الكمية',
          ...(seeCosts ? ['التكلفة'] : []),
          'جزاءات', 'الحالة', '',
        ]}
        empty={rows.length === 0}
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-card-2">
            <td dir="ltr" className="tnum px-4 py-3 text-start font-medium text-txt">
              {row.number}
            </td>
            <td className="tnum px-4 py-3 text-txt-3">
              {row.damageDate.toLocaleDateString('ar-EG')}
            </td>
            <td className="px-4 py-3 text-txt-2">
              {row.employee ? (row.employee.nameAr ?? row.employee.name) : '—'}
            </td>
            <td className="px-4 py-3 text-txt-3">{row.department ?? '—'}</td>
            <td className="px-4 py-3 text-txt-3">{row.product?.nameAr ?? row.productLabel ?? '—'}</td>
            <td className="tnum px-4 py-3">
              {row.productionOrder ? (
                canSeeProduction ? (
                <Link
                  href={`/manufacturing/${row.productionOrder.id}`}
                  dir="ltr"
                  className="text-brand hover:underline"
                >
                  {row.productionOrder.number}
                </Link>
                ) : (
                  <span dir="ltr" className="text-txt-3">{row.productionOrder.number}</span>
                )
              ) : (
                <span className="text-txt-4">—</span>
              )}
            </td>
            <td className="tnum px-4 py-3 text-txt-2">{formatQty(row.quantity)}</td>
            {seeCosts && (
              <td className="tnum px-4 py-3 font-medium text-brand">
                {formatMoney(row.totalCost)}
              </td>
            )}
            <td className="tnum px-4 py-3 text-txt-3">
              {row._count.penalties > 0 ? row._count.penalties : '—'}
            </td>
            <td className="px-4 py-3">
              <Badge tone={TONE[row.status] ?? 'muted'}>
                {(DAMAGE_STATUS_AR as Record<string, string>)[row.status] ?? row.status}
              </Badge>
            </td>
            <td className="px-4 py-3 text-end">
              <Link href={`/damage/${row.id}`} className="text-xs text-brand hover:underline">
                عرض
              </Link>
            </td>
          </tr>
        ))}
      </Table>

      <Pager basePath="/damage" query={query} count={count} />
    </AppShell>
  );
}
