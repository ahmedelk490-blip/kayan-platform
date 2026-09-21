import { dec, balance } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { withTenant } from '@/lib/prisma';
import { isDeliveryDesc } from '@/lib/delivery';
import { csvResponse, stampedName } from '../../csv';
import { resolveRange } from '../../range';

export const dynamic = 'force-dynamic';

/** تصدير تحليل العملاء للفترة إلى شيت Excel (CSV). */
export async function GET(request: Request) {
  const user = await requirePermission('reports.view');
  const sp = new URL(request.url).searchParams;
  const { from, to } = resolveRange({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, period: sp.get('period') ?? undefined });

  const invoices = await withTenant(user.tenantId, (tx) =>
    tx.invoice.findMany({
      where: { tenantId: user.tenantId, isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] }, issueDate: { gte: from, lte: to } },
      select: {
        id: true,
        total: true,
        paidAmount: true,
        customerId: true,
        customer: { select: { contactName: true, companyName: true } },
        lines: { select: { quantity: true, description: true, variant: { select: { cost: true, product: { select: { cost: true } } } } } },
      },
    }),
  );

  // نفس حساب الشاشة: المرتجعات تُنقص المستحق، وقاعُ balance يمنع فاتورةً
  // زائدة الدفع من إلغاء دَينٍ حقيقي على أخرى.
  const returnsByInvoice = new Map<string, ReturnType<typeof dec>>();
  if (invoices.length > 0) {
    const grouped = await withTenant(user.tenantId, (tx) =>
      tx.salesReturn.groupBy({
        by: ['invoiceId'],
        where: { tenantId: user.tenantId, isDeleted: false, invoiceId: { in: invoices.map((i) => i.id) } },
        _sum: { totalAmount: true },
      }),
    );
    for (const g of grouped) returnsByInvoice.set(g.invoiceId, dec(g._sum.totalAmount ?? 0));
  }

  const map = new Map<
    string,
    { name: string; count: number; invoiced: ReturnType<typeof dec>; collected: ReturnType<typeof dec>; cost: ReturnType<typeof dec>; outstanding: ReturnType<typeof dec> }
  >();
  for (const inv of invoices) {
    const id = inv.customerId;
    const name = inv.customer.companyName ?? inv.customer.contactName;
    const row = map.get(id) ?? { name, count: 0, invoiced: dec(0), collected: dec(0), cost: dec(0), outstanding: dec(0) };
    row.count += 1;
    row.invoiced = row.invoiced.plus(dec(inv.total));
    row.collected = row.collected.plus(dec(inv.paidAmount));
    row.outstanding = row.outstanding.plus(
      balance(dec(inv.total).minus(returnsByInvoice.get(inv.id) ?? dec(0)), inv.paidAmount),
    );
    for (const l of inv.lines) {
      if (isDeliveryDesc(l.description)) continue;
      const unitCost = l.variant?.cost ?? l.variant?.product?.cost ?? null;
      if (unitCost !== null) row.cost = row.cost.plus(dec(l.quantity).times(dec(unitCost)));
    }
    map.set(id, row);
  }

  const headers = ['العميل', 'الفواتير', 'إجمالي المفوتر', 'المحصَّل', 'المتبقّي', 'نسبة التحصيل %', 'الربح'];
  const rows = [...map.values()]
    .sort((a, b) => b.invoiced.minus(a.invoiced).toNumber())
    .map((r) => {
      const outstanding = r.outstanding;
      const rate = r.invoiced.lte(0) ? 0 : Number(r.collected.dividedBy(r.invoiced).times(100).toFixed(0));
      return [r.name, r.count, r.invoiced.toNumber(), r.collected.toNumber(), outstanding.toNumber(), rate, r.invoiced.minus(r.cost).toNumber()];
    });

  return csvResponse(stampedName('kayan-clients'), headers, rows);
}
