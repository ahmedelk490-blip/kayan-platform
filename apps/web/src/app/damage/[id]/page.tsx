import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  can,
  formatMoney,
  formatQty,
  DAMAGE_TRANSITIONS,
  DAMAGE_STATUS_AR,
  PENALTY_TRANSITIONS,
  PENALTY_STATUS_AR,
  isDamageStatus,
  isPenaltyStatus,
  type DamageStatus,
  type PenaltyStatus,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import type { SearchParams } from '@/lib/query';
import { PenaltyForm } from '../PenaltyForm';
import { setDamageStatus, deleteDamage, createPenalty, setPenaltyStatus } from '../actions';

export const metadata: Metadata = { title: 'محضر الهالك' };

const ERRORS: Record<string, string> = {
  self: 'لا يعتمد المحضرَ من سجّله. الفصل بين التسجيل والاعتماد هو الغرض من الخطوة.',
  'self-penalty': 'لا يعتمد الجزاءَ من سجّله.',
  approved: 'لا يمكن حذف محضر معتمد — سبق أن دخل في تكلفة فترة مُعلنة.',
  penalties: 'لا يمكن حذف محضر عليه جزاءات. ألغِ الجزاءات أولاً.',
};

const PENALTY_TONE: Record<string, 'ok' | 'bad' | 'muted'> = {
  PAID: 'ok',
  APPROVED: 'ok',
  CANCELLED: 'bad',
  PENDING: 'muted',
};

export default async function DamageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('damage.view');
  const { id } = await params;
  const sp = await searchParams;
  const errKey = Array.isArray(sp.err) ? sp.err[0] : sp.err;

  const damage = await prisma.damageRecord.findFirst({
    where: { id, tenantId: user.tenantId, isDeleted: false },
    include: {
      employee: { select: { nameAr: true, name: true } },
      createdBy: { select: { nameAr: true, name: true } },
      approvedBy: { select: { nameAr: true, name: true } },
      product: { select: { nameAr: true } },
      variant: { select: { sku: true } },
      productionOrder: { select: { id: true, number: true } },
      penalties: {
        orderBy: { createdAt: 'asc' },
        include: {
          employee: { select: { nameAr: true, name: true } },
          events: {
            orderBy: { createdAt: 'asc' },
            include: { user: { select: { nameAr: true, name: true } } },
          },
        },
      },
    },
  });
  if (!damage) notFound();

  const employees = await prisma.user.findMany({
    where: { tenantId: user.tenantId, isActive: true },
    select: { id: true, name: true, nameAr: true },
    orderBy: { name: 'asc' },
  });

  const canWrite = can(user.role, 'damage.write');
  const canApprove = can(user.role, 'damage.approve');
  const canPenalise = can(user.role, 'penalties.approve');

  const status: DamageStatus = isDamageStatus(damage.status) ? damage.status : 'DRAFT';
  const next = DAMAGE_TRANSITIONS[status];

  return (
    <AppShell user={user} title={damage.number}>
      <ModuleHeader
        title={damage.number}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/damage" className="erp-btn-ghost">
              رجوع
            </Link>
            {canWrite && status === 'DRAFT' && next.includes('PENDING') && (
              <form action={setDamageStatus.bind(null, damage.id, 'PENDING')}>
                <button type="submit" className="erp-btn">
                  إرسال للاعتماد
                </button>
              </form>
            )}
            {canApprove && status === 'PENDING' && (
              <>
                <form action={setDamageStatus.bind(null, damage.id, 'APPROVED')}>
                  <button type="submit" className="erp-btn">
                    اعتماد
                  </button>
                </form>
                <form action={setDamageStatus.bind(null, damage.id, 'REJECTED')}>
                  <button
                    type="submit"
                    className="rounded-lg border border-bad px-4 py-2 text-xs text-bad hover:bg-bad-soft"
                  >
                    رفض
                  </button>
                </form>
              </>
            )}
            {canWrite && status === 'REJECTED' && (
              <form action={setDamageStatus.bind(null, damage.id, 'DRAFT')}>
                <button type="submit" className="erp-btn-ghost">
                  إعادة للمسودة
                </button>
              </form>
            )}
            {canWrite && status !== 'APPROVED' && damage.penalties.length === 0 && (
              <form action={deleteDamage.bind(null, damage.id)}>
                <button type="submit" className="erp-btn-ghost">
                  حذف
                </button>
              </form>
            )}
          </div>
        }
      />

      {errKey && ERRORS[errKey] && (
        <p role="alert" className="mb-5 rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
          {ERRORS[errKey]}
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-4 text-xs text-txt-3">
        <Badge tone={status === 'APPROVED' ? 'ok' : status === 'REJECTED' ? 'bad' : 'muted'}>
          {DAMAGE_STATUS_AR[status]}
        </Badge>
        <span className="tnum">{damage.damageDate.toLocaleDateString('ar-EG')}</span>
        <span className="tnum">الكمية التالفة: {formatQty(damage.quantity)}</span>
        {damage.productionOrder && (
          <Link
            href={`/manufacturing/${damage.productionOrder.id}`}
            className="text-brand underline"
          >
            أمر الإنتاج {damage.productionOrder.number}
          </Link>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">السبب</h3>
            <p className="whitespace-pre-wrap text-sm text-txt">{damage.reason}</p>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-brand">الجزاءات</h3>
              <span className="text-[0.7rem] text-txt-4">
                الحد الأقصى للجزاء = تكلفة الهالك {formatMoney(damage.totalCost)}
              </span>
            </div>

            <Table
              headers={['الرقم', 'الموظف', 'المبلغ', 'السبب', 'الحالة', '']}
              empty={damage.penalties.length === 0}
            >
              {damage.penalties.map((p) => {
                const pStatus: PenaltyStatus = isPenaltyStatus(p.status) ? p.status : 'PENDING';
                return (
                  <tr key={p.id}>
                    <td dir="ltr" className="tnum px-4 py-3 text-start text-txt">
                      {p.number}
                    </td>
                    <td className="px-4 py-3 text-txt-2">
                      {p.employee.nameAr ?? p.employee.name}
                    </td>
                    <td className="tnum px-4 py-3 font-medium text-brand">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-[0.7rem] text-txt-3">{p.reason}</td>
                    <td className="px-4 py-3">
                      <Badge tone={PENALTY_TONE[pStatus] ?? 'muted'}>
                        {PENALTY_STATUS_AR[pStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {canPenalise && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {PENALTY_TRANSITIONS[pStatus].map((s) => (
                            <form key={s} action={setPenaltyStatus.bind(null, damage.id, p.id, s)}>
                              <button
                                type="submit"
                                className={`rounded-md border px-2 py-1 text-[0.7rem] ${
                                  s === 'CANCELLED'
                                    ? 'border-line-2 text-txt-3 hover:border-bad hover:text-bad'
                                    : 'border-line-2 text-txt-3 hover:border-brand hover:text-brand'
                                }`}
                              >
                                {PENALTY_STATUS_AR[s]}
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>

            {damage.penalties.some((p) => p.events.length > 0) && (
              <div className="erp-card mt-4 p-5">
                <h4 className="mb-3 text-xs font-semibold text-brand">سجل الجزاءات</h4>
                <ul className="space-y-2 text-[0.7rem] text-txt-3">
                  {damage.penalties.flatMap((p) =>
                    p.events.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-baseline gap-2">
                        <span dir="ltr" className="tnum text-txt-2">
                          {p.number}
                        </span>
                        <span>
                          {e.fromStatus
                            ? `${(PENALTY_STATUS_AR as Record<string, string>)[e.fromStatus] ?? e.fromStatus} ← `
                            : ''}
                          {(PENALTY_STATUS_AR as Record<string, string>)[e.toStatus] ?? e.toStatus}
                        </span>
                        <span className="text-txt-4">
                          {e.user ? (e.user.nameAr ?? e.user.name) : 'النظام'} ·{' '}
                          {e.createdAt.toLocaleString('ar-EG')}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
                <p className="mt-3 text-[0.7rem] text-txt-4">
                  سجل غير قابل للتعديل أو الحذف. صف الجزاء يقول ما هو صحيح الآن، وهذا يقول
                  كيف وصل إليه ومن قرّر.
                </p>
              </div>
            )}

            {canWrite && status !== 'REJECTED' && (
              <div className="erp-card mt-4 p-5">
                <h4 className="mb-4 text-xs font-semibold text-brand">تسجيل جزاء</h4>
                <PenaltyForm
                  action={createPenalty.bind(null, damage.id)}
                  employees={employees.map((e) => ({ value: e.id, label: e.nameAr ?? e.name }))}
                  damageCost={damage.totalCost.toString()}
                />
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">التكلفة</h3>
            <dl className="space-y-2 text-sm">
              <Row label="خامات" value={formatMoney(damage.materialCost)} />
              <Row label="عمالة" value={formatMoney(damage.laborCost)} />
              <div className="border-t border-line pt-2">
                <Row label="الإجمالي" value={formatMoney(damage.totalCost)} strong />
              </div>
            </dl>
          </section>

          <section className="erp-card p-5">
            <h3 className="mb-3 text-sm font-semibold text-brand">التفاصيل</h3>
            <dl className="space-y-2 text-sm">
              <Row
                label="الموظف"
                value={damage.employee ? (damage.employee.nameAr ?? damage.employee.name) : '—'}
              />
              <Row label="القسم" value={damage.department ?? '—'} />
              <Row label="الماكينة" value={damage.machine ?? '—'} />
              <Row
                label="المنتج"
                value={damage.product ? `${damage.product.nameAr} · ${damage.variant?.sku ?? ''}` : '—'}
              />
              <Row
                label="سجّله"
                value={damage.createdBy ? (damage.createdBy.nameAr ?? damage.createdBy.name) : '—'}
              />
              <Row
                label="اعتمده"
                value={damage.approvedBy ? (damage.approvedBy.nameAr ?? damage.approvedBy.name) : '—'}
              />
            </dl>
          </section>

          <section className="erp-card p-5">
            <h3 className="mb-2 text-sm font-semibold text-brand">الصور</h3>
            <p className="text-[0.7rem] text-txt-4">
              أعمدة المرفقات جاهزة في قاعدة البيانات، ورفع الملفات لم يُبنَ بعد — العمود
              موجود الآن حتى لا يُعدَّل جدول تشير إليه محاضر فعلية لاحقاً.
            </p>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? 'font-medium text-txt' : 'text-txt-3'}>{label}</dt>
      <dd className={`tnum ${strong ? 'font-semibold text-brand' : 'text-txt-2'}`}>{value}</dd>
    </div>
  );
}
