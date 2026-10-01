import { dec, EXPENSE_CATEGORY_AR } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { isDeliveryDesc } from '@/lib/delivery';
import { realProfit } from '@/lib/profit';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير البيان المالي الشامل للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const [[lines, expenses, stock], rp] = await Promise.all([
    withTenant(user.tenantId, (tx) =>
      Promise.all([
        tx.invoiceLine.findMany({
          where: { invoice: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: from, lte: to } } },
          select: { quantity: true, lineTotal: true, description: true, product: { select: { nameAr: true, category: { select: { nameAr: true } } } } },
        }),
        // بلا المسجَّل من القوالب الثابتة (REC-…) — في سطر الالتزامات بحصّة الفترة.
        tx.secondaryExpense.findMany({ where: { tenantId: user.tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: from, lte: to }, NOT: { number: { startsWith: 'REC-' } } }, select: { amount: true, category: true } }),
        tx.stock.findMany({ where: { variant: { product: { tenantId: user.tenantId } } }, select: { onHand: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } }),
      ]),
    ),
    // أرقام الربح من مصدر الشاشة نفسه (lib/profit) كي لا يختلف الملف عنها.
    realProfit(user.tenantId, from, to),
  ]);

  let pieces = dec(0);
  const byCategory = new Map<string, { revenue: ReturnType<typeof dec>; qty: ReturnType<typeof dec> }>();
  const byProduct = new Map<string, { revenue: ReturnType<typeof dec>; qty: ReturnType<typeof dec> }>();
  for (const l of lines) {
    // التوصيل 🚚 على الزبون يمرّ للسائق — كما في الشاشة تماماً كي لا يختلف الملف عنها.
    if (isDeliveryDesc(l.description)) continue;
    const rev = dec(l.lineTotal), qty = dec(l.quantity);
    pieces = pieces.plus(qty);
    const cat = l.product?.category?.nameAr ?? 'غير مصنّف';
    const c = byCategory.get(cat) ?? { revenue: dec(0), qty: dec(0) };
    byCategory.set(cat, { revenue: c.revenue.plus(rev), qty: c.qty.plus(qty) });
    const pn = l.product?.nameAr ?? 'غير معروف';
    const p = byProduct.get(pn) ?? { revenue: dec(0), qty: dec(0) };
    byProduct.set(pn, { revenue: p.revenue.plus(rev), qty: p.qty.plus(qty) });
  }
  const expensesByCat = new Map<string, ReturnType<typeof dec>>();
  for (const e of expenses) expensesByCat.set(e.category, (expensesByCat.get(e.category) ?? dec(0)).plus(dec(e.amount)));
  const inventoryValue = stock.reduce((s, r) => {
    const unit = r.variant.cost ?? r.variant.product.cost ?? null;
    return unit === null ? s : s.plus(dec(r.onHand).times(dec(unit)));
  }, dec(0));
  const totalOpex = rp.expenses.plus(rp.salaries).plus(rp.fixed).plus(rp.bonuses).plus(rp.damage);

  const headers = ['البند', 'القيمة (د.ع)', 'العدد'];
  const rows: unknown[][] = [
    ['المبيعات (حسب الصنف)', '', ''],
    ...[...byCategory.entries()].sort((a, b) => b[1].revenue.minus(a[1].revenue).toNumber()).map(([c, v]) => [c, v.revenue.toNumber(), v.qty.toNumber()]),
    ['مبيعات البضاعة', rp.sales.toNumber(), pieces.toNumber()],
    ...(rp.deliveryCharged.gt(0) ? [['أجور توصيل على الزبون (تمرّ للسائق — خارج الربح)', rp.deliveryCharged.toNumber()]] : []),
    ['الرواجع (المرتجعات)', rp.returns.toNumber()],
    ['', '', ''],
    ['تكلفة البضاعة المباعة (ناقص ما رجع)', rp.cogs.toNumber()],
    ['مجمل الربح', rp.grossProfit.toNumber()],
    ['', ''],
    ['المصروفات', ''],
    ['الرواتب — حصّة الفترة', rp.salaries.toNumber()],
    ['الالتزامات الثابتة — حصّة الفترة', rp.fixed.toNumber()],
    ['مكافآت وعمولات مصروفة', rp.bonuses.toNumber()],
    ...[...expensesByCat.entries()].sort((a, b) => b[1].minus(a[1]).toNumber()).map(([c, v]) => [(EXPENSE_CATEGORY_AR as Record<string, string>)[c] ?? c, v.toNumber()]),
    ['الهالك', rp.damage.toNumber()],
    ['إجمالي المصروفات', totalOpex.toNumber()],
    ['جزاءات محصَّلة', rp.penalties.toNumber()],
    ['', ''],
    ['الربح الصافي', rp.net.toNumber()],
    ...(rp.missingCost.pieces > 0 ? [[`تنبيه: ${rp.missingCost.pieces} قطعة بيعت بلا تكلفة مسجّلة — الربح أعلى من حقيقته`, '']] : []),
    ['قيمة المخزون الحالية (بالتكلفة)', inventoryValue.toNumber()],
    ['', ''],
    ['المنتجات الأكثر طلباً', 'العدد / الإيراد'],
    ...[...byProduct.entries()].sort((a, b) => b[1].qty.minus(a[1].qty).toNumber()).slice(0, 20).map(([n, v]) => [n, `${v.qty.toNumber()} / ${v.revenue.toNumber()}`]),
  ];

  return csvResponse(stampedName('kayan-statement'), headers, rows);
}
