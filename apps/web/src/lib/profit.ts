import { dec, DEDUCTION_KINDS } from '@erp/domain';
import { prisma } from '@/lib/prisma';
import { isDeliveryDesc } from '@/lib/delivery';

type Dec = ReturnType<typeof dec>;
type Amount = Parameters<typeof dec>[0];

/**
 * الربح الحقيقي لمدى — ما بقي فعلاً من المبيعات بعد كل ما كلّفته.
 *
 * ── لماذا ─────────────────────────────────────────────────
 *
 * «الربح الصافي الشامل» كان يخصم أوامر الشراء بدل تكلفة البضاعة المباعة،
 * والرواتب المصروفة وحدها. والمصنع يُدخل بضاعته بحركات استلام لا بأوامر شراء،
 * ورواتب الشهر لم تُصرف بعد — فخرج الربح ٩٢٪ من المبيعات، ورأى المالك الخطأ
 * بعينه.
 *
 * ── كيف ───────────────────────────────────────────────────
 *
 * مبيعات البضاعة − المرتجعات − تكلفة البضاعة المباعة = مجمل الربح؛ ثم −
 * المصروفات التشغيلية المعتمدة − الرواتب والالتزامات الثابتة بحصّة أيام المدى
 * (كيومية اليوم) − المكافآت والعمولات المصروفة − الهالك المعتمد + الجزاءات
 * المحصَّلة = صافي الربح.
 *
 * تكلفة القطعة من بطاقة المنتج (اللون إن كانت له تكلفته). والقطعة التي بيعت بلا
 * تكلفة مسجّلة تُعدّ وتُسمّى بدل أن تُحسب صفراً بصمت.
 *
 * وأجور التوصيل على الزبون تمرّ للسائق: لا إيراد ولا مصروف (بطلب المالك).
 * والمشتريات لا تُخصم هنا: تدخل المخزون، وتُخصم حين تُباع ضمن تكلفة البضاعة —
 * خصمُها يوم شرائها كان يأكل ربح بضاعةٍ ما زالت على الرف.
 */

const BAGHDAD = 3 * 60 * 60 * 1000;

/** كم شهراً (بكسوره) بين لحظتين — كل شهرٍ بعدد أيامه، كيومية اليوم. */
export function monthsBetween(start: Date, end: Date): number {
  let total = 0;
  let cur = start.getTime();
  const stop = end.getTime();
  while (cur < stop) {
    const b = new Date(cur + BAGHDAD);
    const first = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1) - BAGHDAD;
    const next = Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1) - BAGHDAD;
    const segEnd = Math.min(next, stop);
    total += (segEnd - cur) / (next - first);
    cur = segEnd;
  }
  return total;
}

type ProductCost = { nameAr: string; cost: Amount | null; dozenCost: Amount | null; piecesPerDozen: number };

/** تكلفة القطعة: تكلفة اللون إن سُجّلت، وإلا المنتج، وإلا الدستة ÷ قطعها. */
function pieceCost(variantCost: Amount | null | undefined, product: ProductCost | null | undefined): Dec | null {
  const v = variantCost == null ? null : dec(variantCost);
  if (v?.gt(0)) return v;
  const p = product?.cost == null ? null : dec(product.cost);
  if (p?.gt(0)) return p;
  const d = product?.dozenCost == null ? null : dec(product.dozenCost);
  if (d?.gt(0) && product && product.piecesPerDozen > 0) return d.dividedBy(product.piecesPerDozen);
  return null;
}

export async function realProfit(tenantId: string, from: Date, to: Date) {
  const period = { gte: from, lte: to };
  const issued = { tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } };
  const productCost = { select: { nameAr: true, cost: true, dozenCost: true, piecesPerDozen: true } };

  const [
    invoiceAgg,
    lines,
    returnLines,
    returnsAgg,
    expensesAgg,
    staff,
    recurring,
    firstInvoice,
    bonusesAgg,
    damageAgg,
    penaltiesAgg,
    salaryPayments,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: { ...issued, issueDate: period },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.invoiceLine.findMany({
      where: { invoice: { ...issued, issueDate: period } },
      select: {
        description: true,
        quantity: true,
        lineTotal: true,
        product: productCost,
        variant: { select: { cost: true } },
      },
    }),
    prisma.salesReturnLine.findMany({
      where: { salesReturn: { tenantId, isDeleted: false, returnDate: period } },
      select: { productId: true, variantId: true, quantity: true, description: true },
    }),
    prisma.salesReturn.aggregate({
      where: { tenantId, isDeleted: false, returnDate: period },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    // المصروفات التشغيلية — بلا ما سُجّل من القوالب الثابتة (REC-…، انظر
    // postRecurring): تلك هي الالتزامات نفسها، تُحسب بحصّة الأيام أدناه،
    // فخصمُها هنا أيضاً يكرّرها.
    prisma.secondaryExpense.aggregate({
      where: {
        tenantId,
        isDeleted: false,
        status: 'APPROVED',
        expenseDate: period,
        NOT: { number: { startsWith: 'REC-' } },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { tenantId, isActive: true, monthlySalary: { gt: 0 } },
      select: { id: true, monthlySalary: true, createdAt: true },
    }),
    prisma.recurringExpense.findMany({
      where: { tenantId, isActive: true },
      select: { nameAr: true, amount: true },
    }),
    // أول فاتورة في النظام = أول يوم عمل مسجَّل: الالتزامات لا تُحسب قبله.
    prisma.invoice.findFirst({
      where: { ...issued, issueDate: { not: null } },
      orderBy: { issueDate: 'asc' },
      select: { issueDate: true },
    }),
    // ما صُرف للموظف فوق راتبه: مكافأة وعمولة. الراتب نفسه من الحصّة أدناه،
    // والخصم والسلفة مالٌ يعود للشركة لا يخرج منها.
    prisma.employeePayment.aggregate({
      where: { tenantId, isDeleted: false, kind: { notIn: [...DEDUCTION_KINDS, 'SALARY'] }, paidAt: period },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.damageRecord.aggregate({
      where: { tenantId, isDeleted: false, status: 'APPROVED', damageDate: period },
      _sum: { totalCost: true },
      _count: { _all: true },
    }),
    prisma.penalty.aggregate({
      where: { tenantId, status: 'PAID', paidAt: period },
      _sum: { amount: true },
    }),
    // رواتب صُرفت في المدى — تُحسب لمن لا راتبَ شهرياً مضبوطاً له وحده
    // (موظفٌ يُصرف له من قسم الرواتب ولم يُكتب راتبه في حسابه، أو تَرَك
    // العمل). من له راتبٌ شهري تكفيه حصّته أدناه، فصرفه لا يُحسب مرتين.
    prisma.employeePayment.findMany({
      where: { tenantId, isDeleted: false, kind: 'SALARY', paidAt: period },
      select: { employeeId: true, amount: true },
    }),
  ]);

  // ── المبيعات وتكلفة البضاعة ──
  const invoiced = dec(invoiceAgg._sum.total ?? 0);
  let deliveryCharged = dec(0);
  let cogsSold = dec(0);
  let pieces = 0;
  const missing = new Map<string, number>();
  for (const l of lines) {
    if (isDeliveryDesc(l.description)) {
      deliveryCharged = deliveryCharged.plus(dec(l.lineTotal));
      continue;
    }
    const q = dec(l.quantity);
    pieces += q.toNumber();
    const c = pieceCost(l.variant?.cost, l.product);
    if (c) cogsSold = cogsSold.plus(q.times(c));
    else {
      const name = l.product?.nameAr ?? l.description;
      missing.set(name, (missing.get(name) ?? 0) + q.toNumber());
    }
  }

  // ما رجع إلى الرف تُردّ تكلفته: بيعٌ رُدّ لم يكلّفنا بضاعته.
  const variantIds = [...new Set(returnLines.map((r) => r.variantId).filter((x): x is string => !!x))];
  const productIds = [...new Set(returnLines.map((r) => r.productId).filter((x): x is string => !!x))];
  const [rVariants, rProducts] = await Promise.all([
    variantIds.length
      ? prisma.productVariant.findMany({
          where: { id: { in: variantIds }, product: { tenantId } },
          select: { id: true, cost: true },
        })
      : Promise.resolve([]),
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, tenantId },
          select: { id: true, nameAr: true, cost: true, dozenCost: true, piecesPerDozen: true },
        })
      : Promise.resolve([]),
  ]);
  const variantCost = new Map(rVariants.map((v) => [v.id, v.cost]));
  const productById = new Map(rProducts.map((p) => [p.id, p]));
  let cogsReturned = dec(0);
  for (const r of returnLines) {
    if (isDeliveryDesc(r.description)) continue;
    const c = pieceCost(
      r.variantId ? variantCost.get(r.variantId) : null,
      r.productId ? productById.get(r.productId) : null,
    );
    if (c) cogsReturned = cogsReturned.plus(dec(r.quantity).times(c));
  }

  // ── الرواتب والالتزامات الثابتة بحصّة أيام المدى ──
  //
  // من أول يوم عملٍ مسجَّل (أو بداية المدى إن كانت بعده) حتى نهاية المدى أو
  // اليوم أيّهما أسبق: سنةٌ كاملة لا تُحمَّل رواتب أشهرٍ لم تأتِ، ولا أشهرٍ قبل
  // أن يُستعمل النظام. وراتب الموظف من يوم إضافة حسابه.
  const firstDay = firstInvoice?.issueDate?.getTime() ?? null;
  const winStart = firstDay === null ? null : Math.max(from.getTime(), firstDay);
  const winEnd = Math.min(to.getTime(), Date.now());
  const live = winStart !== null && winStart < winEnd;
  const months = live ? monthsBetween(new Date(winStart), new Date(winEnd)) : 0;

  const salariesMonthly = staff.reduce((s, u) => s.plus(dec(u.monthlySalary ?? 0)), dec(0));
  let salaries = dec(0);
  if (live) {
    for (const u of staff) {
      const start = Math.max(winStart, u.createdAt.getTime());
      if (start < winEnd) {
        salaries = salaries.plus(dec(u.monthlySalary ?? 0).times(monthsBetween(new Date(start), new Date(winEnd))));
      }
    }
  }
  const salaried = new Set(staff.map((u) => u.id));
  for (const p of salaryPayments) {
    if (!salaried.has(p.employeeId)) salaries = salaries.plus(dec(p.amount));
  }
  const fixedMonthly = recurring.reduce((s, r) => s.plus(dec(r.amount)), dec(0));

  // ── القائمة — دنانير كاملة، فيطابق مجموعُ السطور المعروضة الصافي ──
  const whole = (d: Dec) => d.toDecimalPlaces(0);
  const sales = invoiced.minus(deliveryCharged);
  const returns = dec(returnsAgg._sum.totalAmount ?? 0);
  const cogs = whole(cogsSold.minus(cogsReturned));
  const grossProfit = sales.minus(returns).minus(cogs);
  const expenses = dec(expensesAgg._sum.amount ?? 0);
  const salariesShare = whole(salaries);
  const fixed = whole(fixedMonthly.times(months));
  const bonuses = dec(bonusesAgg._sum.amount ?? 0);
  const damage = dec(damageAgg._sum.totalCost ?? 0);
  const penalties = dec(penaltiesAgg._sum.amount ?? 0);
  const net = grossProfit
    .minus(expenses)
    .minus(salariesShare)
    .minus(fixed)
    .minus(bonuses)
    .minus(damage)
    .plus(penalties);

  const missingSorted = [...missing.entries()].sort((a, b) => b[1] - a[1]);

  return {
    invoiced,
    invoiceCount: invoiceAgg._count._all,
    deliveryCharged,
    sales,
    returns,
    returnsCount: returnsAgg._count._all,
    pieces,
    cogs,
    missingCost: {
      pieces: missingSorted.reduce((s, [, q]) => s + q, 0),
      products: missingSorted.map(([name]) => name),
    },
    grossProfit,
    expenses,
    expensesCount: expensesAgg._count._all,
    salaries: salariesShare,
    salariesMonthly,
    staffCount: staff.length,
    fixed,
    fixedMonthly,
    fixedNames: recurring.map((r) => r.nameAr),
    months,
    obligationsFrom: live ? new Date(winStart) : null,
    obligationsTo: live ? new Date(winEnd) : null,
    bonuses,
    bonusesCount: bonusesAgg._count._all,
    damage,
    damageCount: damageAgg._count._all,
    penalties,
    net,
  };
}

export type RealProfit = Awaited<ReturnType<typeof realProfit>>;
