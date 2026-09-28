import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  dec,
  formatMoney,
  paymentSign,
  EMPLOYEE_PAYMENT_KIND_AR,
  PENALTY_STATUS_AR,
  type EmployeePaymentKind,
} from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { isDeliveryDesc } from '@/lib/delivery';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table } from '@/components/crud/Shell';
import { Figure } from '../../reports/Shell';
import { PaymentModal } from '../HRForms';
import { deleteEmployeePayment } from '../actions';

export const metadata: Metadata = { title: 'كشف الموظف' };

export default async function EmployeeStatement({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('hr.manage');
  // الربح والعمولة أرقامٌ للمالك وحده: مَن يصرف الرواتب لا يلزمه أن يعرف
  // ربح المصنع من فواتير كل مندوب (قاعدة المالك: الجملة والربح للمدير فقط).
  const seeProfit = allows(user, 'cost.margin');
  const { id } = await params;
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);

  const employee = await prisma.user.findFirst({
    where: { id, tenantId: user.tenantId },
    select: { id: true, name: true, nameAr: true, monthlySalary: true, commissionPercent: true, role: { select: { nameAr: true } } },
  });
  if (!employee) notFound();

  const [payments, penalties, invoices] = await Promise.all([
    prisma.employeePayment.findMany({
      where: { tenantId: user.tenantId, employeeId: id, isDeleted: false },
      orderBy: { paidAt: 'desc' },
      select: { id: true, number: true, kind: true, amount: true, paidAt: true, note: true },
    }),
    prisma.penalty.findMany({
      where: { tenantId: user.tenantId, employeeId: id, status: { in: ['APPROVED', 'PAID'] } },
      select: {
        id: true,
        number: true,
        amount: true,
        collectedAmount: true,
        installments: true,
        reason: true,
        status: true,
        approvedAt: true,
        createdAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        isDeleted: false,
        status: { notIn: ['DRAFT', 'VOID'] },
        createdById: id,
        issueDate: { gte: yearStart, lte: yearEnd },
      },
      select: {
        id: true,
        total: true,
        lines: {
          select: {
            quantity: true,
            lineTotal: true,
            // الوصف لتمييز بند التوصيل 🚚 — أجرةُ توصيلٍ ليست بيعاً للمندوب.
            description: true,
            variant: { select: { cost: true, product: { select: { cost: true } } } },
          },
        },
      },
    }),
  ]);

  // ما أُرجع من فواتيره — بضاعةٌ عادت ليست بيعاً، ولا يُعمَّل عليها.
  //
  // كانت العمولة تُحسب من الفواتير وحدها: مندوبٌ باع بمليون وأعاد الزبون
  // نصفه يقبض عمولة المليون كاملاً. والمرتجع يُطرح من الطرفين معاً — قيمتُه
  // من الإيراد وتكلفةُ بضاعته من التكلفة — وإلا عوقب المندوب بتكلفةٍ عادت
  // إلى المخزن.
  const returns = await prisma.salesReturn.findMany({
    where: {
      tenantId: user.tenantId,
      isDeleted: false,
      invoiceId: { in: invoices.map((i) => i.id) },
    },
    select: { lines: { select: { description: true, quantity: true, lineTotal: true, variantId: true } } },
  });

  const returnedVariantIds = [
    ...new Set(
      returns
        .flatMap((r) => r.lines)
        .map((l) => l.variantId)
        .filter((v): v is string => v !== null),
    ),
  ];
  const returnedVariants = returnedVariantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: returnedVariantIds }, product: { tenantId: user.tenantId } },
        select: { id: true, cost: true, product: { select: { cost: true } } },
      })
    : [];
  const costOfVariant = new Map(
    returnedVariants.map((v) => [v.id, v.cost ?? v.product?.cost ?? null]),
  );

  let returnedRevenue = dec(0);
  let returnedCost = dec(0);
  for (const r of returns)
    for (const l of r.lines) {
      // بند توصيلٍ مردود ليس بضاعة — خارج الطرفين كما هو خارج قاعدة العمولة.
      if (isDeliveryDesc(l.description)) continue;
      returnedRevenue = returnedRevenue.plus(dec(l.lineTotal));
      const unitCost = l.variantId ? costOfVariant.get(l.variantId) ?? null : null;
      if (unitCost !== null) returnedCost = returnedCost.plus(dec(l.quantity).times(dec(unitCost)));
    }

  // أداء الموظف من فواتيره هذه السنة.
  //
  // أجور التوصيل تُستبعد من قاعدة العمولة: المندوب لم يبعها، وهي إمّا مبلغ
  // مرّ على الفاتورة للزبون أو تكلفة علينا — احتسابها ربحاً يدفع عمولة على
  // مالٍ ليس ربحاً.
  let revenue = dec(0);
  let cost = dec(0);
  for (const inv of invoices) {
    const delivery = inv.lines
      .filter((l) => isDeliveryDesc(l.description))
      .reduce((s, l) => s.plus(dec(l.lineTotal)), dec(0));
    revenue = revenue.plus(dec(inv.total)).minus(delivery);
    for (const l of inv.lines) {
      if (isDeliveryDesc(l.description)) continue;
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost !== null) cost = cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
  }
  const profit = revenue.minus(returnedRevenue).minus(cost.minus(returnedCost));
  const commissionRate = employee.commissionPercent === null ? dec(0) : dec(employee.commissionPercent);
  const commissionEarned = profit.gt(0) ? profit.times(commissionRate).dividedBy(100) : dec(0);

  // ما صُرف له وما خُصم منه (كل السجلّ).
  let paidOut = dec(0);
  let deducted = dec(0);
  const byKind = new Map<string, ReturnType<typeof dec>>();
  for (const p of payments) {
    byKind.set(p.kind, (byKind.get(p.kind) ?? dec(0)).plus(dec(p.amount)));
    if (paymentSign(p.kind) < 0) deducted = deducted.plus(dec(p.amount));
    else paidOut = paidOut.plus(dec(p.amount));
  }
  // العمولة المستحقة = ما استحقّه ناقص ما صُرف له منها فعلاً.
  //
  // كانت محسوبةً من ربح السنة وحده، فتبقى «١٥٠٬٠٠٠ مستحقة» بعد صرفها —
  // فتُصرف مرة أخرى. الآن تنزل بما دُفع تحت بند عمولة وتصل صفراً.
  const commissionPaid = payments
    .filter((p) => p.kind === 'COMMISSION')
    .reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const commissionDue = commissionEarned.minus(commissionPaid);

  // الجزاء المعتمد خطّةٌ لا مالٌ خرج.
  //
  // كان يُطرح كاملاً من صافي الموظّف لحظة اعتماده، فيظهر من عليه جزاءٌ
  // براتب شهر وكأنّه لم يقبض شيئاً — وهو لم يُستقطع منه بعد. المال يخرج بصفّ
  // خصمٍ (قسط) وهو داخلٌ في `deducted` أصلاً، فطرحه مرّتين مضاعفة.
  //
  // فالصافي يقول ما تحرّك فعلاً، والباقي من الجزاءات يُعرض خبراً لا خصماً.
  const penaltyTotal = penalties.reduce((s, p) => s.plus(dec(p.amount)), dec(0));
  const penaltyCollected = penalties.reduce((s, p) => s.plus(dec(p.collectedAmount)), dec(0));
  const penaltyRemaining = penaltyTotal.minus(penaltyCollected);
  const netPaid = paidOut.minus(deducted);

  const name = employee.nameAr ?? employee.name;
  const fmt = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium' });

  return (
    <AppShell user={user} title={`كشف ${name}`}>
      <ModuleHeader
        title={name}
        action={
          <div className="flex gap-2">
            <PaymentModal employees={[{ value: id, label: name }]} defaultEmployeeId={id} trigger="تسجيل دفعة" />
            <a href={`/hr/${id}/export`} className="erp-btn-ghost">تصدير Excel</a>
            <Link href="/hr" className="erp-btn-ghost">رجوع</Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Figure label="الراتب الشهري" value={employee.monthlySalary === null ? '—' : formatMoney(employee.monthlySalary)} hint={employee.role.nameAr} />
        {seeProfit ? (
          <>
            <Figure label={`ربح فواتيره (${year})`} value={formatMoney(profit)} hint={`${invoices.length} فاتورة`} strong tone={profit.lt(0) ? 'bad' : undefined} />
            <Figure
              label="العمولة المتبقية"
              value={formatMoney(commissionDue.lt(0) ? dec(0) : commissionDue)}
              hint={
                commissionPaid.gt(0)
                  ? `استحقّ ${formatMoney(commissionEarned)} · صُرف ${formatMoney(commissionPaid)}`
                  : `${commissionRate.toFixed(1)}٪ من الربح`
              }
            />
          </>
        ) : (
          // بديلٌ لا يكشف ربحاً: عدد الفواتير وحده يكفي من يصرف الراتب.
          <Figure label={`فواتيره (${year})`} value={String(invoices.length)} hint="فاتورة" />
        )}
        <Figure
          label="المحمّل عليه"
          value={formatMoney(deducted)}
          hint="خصومات وخسائر وسلف + جزاءات"
          tone={deducted.gt(0) ? 'warn' : undefined}
        />
        <Figure label="صافي المصروف له" value={formatMoney(netPaid)} hint="مدفوعات ناقص المحمّل" strong tone={netPaid.lt(0) ? 'warn' : undefined} />
      </div>

      {penaltyTotal.gt(0) && (
        <p className="mb-4 rounded-lg border border-warn bg-warn-soft px-4 py-2.5 text-xs leading-[1.9] text-warn">
          جزاءات على الموظف بقيمة {formatMoney(penaltyTotal)} — استُقطِع منها{' '}
          {formatMoney(penaltyCollected)}
          {penaltyRemaining.gt(0) && <> وباقٍ {formatMoney(penaltyRemaining)}</>}. المستقطَع وحده
          داخلٌ في الصافي أعلاه (كصفّ خصم) — والباقي يُستقطع قسطاً قسطاً من شاشة
          «الهالك والجزاءات».
        </p>
      )}

      {/* الجزاءات في الكشف نفسه — لا في شاشة الهالك وحدها.
          من يقرأ كشف موظّف يريد أن يرى ما عليه كلّه في مكانٍ واحد: ما قبضه
          وما خُصِم منه وما بقي عليه من جزاءات وكم قسطاً بقي. */}
      {penalties.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-brand">الجزاءات</h3>
          <Table
            headers={['الرقم', 'السبب', 'المبلغ', 'المستقطَع', 'الباقي', 'الأقساط', 'الحالة']}
            empty={false}
          >
            {penalties.map((pen) => {
              const left = dec(pen.amount).minus(dec(pen.collectedAmount));
              return (
                <tr key={pen.id}>
                  <td dir="ltr" className="tnum px-4 py-3 text-start text-txt-3">{pen.number}</td>
                  <td className="px-4 py-3 text-[0.7rem] text-txt-3">{pen.reason}</td>
                  <td className="tnum px-4 py-3 font-medium text-txt">{formatMoney(pen.amount)}</td>
                  <td className="tnum px-4 py-3 text-bad">{formatMoney(pen.collectedAmount)}</td>
                  <td className={`tnum px-4 py-3 font-medium ${left.gt(0) ? 'text-warn' : 'text-ok'}`}>
                    {formatMoney(left)}
                  </td>
                  <td className="tnum px-4 py-3 text-txt-3">{pen.installments}</td>
                  <td className="px-4 py-3 text-[0.7rem] text-txt-3">
                    {(PENALTY_STATUS_AR as Record<string, string>)[pen.status] ?? pen.status}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-4">
            المستقطَع وحده داخلٌ في الصافي أعلاه — يظهر صفّ خصمٍ في الجدول أدناه عند
            كل قسط. والباقي يُستقطع من شاشة «الهالك والجزاءات» قسطاً قسطاً.
          </p>
        </section>
      )}

      <h3 className="mb-3 text-sm font-semibold text-brand">الدفعات والخصومات</h3>
      <Table headers={['الرقم', 'النوع', 'المبلغ', 'التاريخ', 'ملاحظة', '']} empty={payments.length === 0}>
        {payments.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3 text-txt-3" dir="ltr">{p.number}</td>
            <td className="px-4 py-3 text-txt-2">{EMPLOYEE_PAYMENT_KIND_AR[p.kind as EmployeePaymentKind] ?? p.kind}</td>
            <td className={`tnum px-4 py-3 font-medium ${paymentSign(p.kind) < 0 ? 'text-bad' : 'text-txt'}`}>
              {paymentSign(p.kind) < 0 ? '-' : ''}{formatMoney(p.amount)}
            </td>
            <td className="px-4 py-3 text-txt-3">{fmt.format(p.paidAt)}</td>
            <td className="px-4 py-3 text-txt-3">{p.note ?? '—'}</td>
            <td className="px-4 py-3 text-end">
              <form action={deleteEmployeePayment.bind(null, p.id)}>
                <button type="submit" className="text-xs text-bad hover:underline">حذف</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
    </AppShell>
  );
}
