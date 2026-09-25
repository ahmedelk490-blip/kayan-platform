import 'server-only';

import { balance, dec, RECEIVABLE_STATUSES } from '@erp/domain';
import { prisma, tenantTransaction } from './prisma';

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/**
 * المستحق الحقيقي على الفواتير — بعد خصم ما أُرجع منها.
 *
 * فاتورةٌ رُجّعت بضاعتها لم تعد مستحقة، وإن بقيت حالتها «صادرة». كان المستحق
 * يُحسب من الإجمالي والمدفوع وحدهما، فيطالب النظام العميل بمال بضاعةٍ أعادها،
 * ويضخّم «مستحقات عند العملاء» في اللوحة وتقرير الأعمار والبيان المالي.
 *
 * تُحسب هنا مرةً واحدة وتُستعمل في كل شاشة، فلا تختلف الأرقام بين شاشتين.
 */
export async function returnsByInvoice(
  tenantId: string,
  invoiceIds: string[],
): Promise<Map<string, ReturnType<typeof dec>>> {
  const map = new Map<string, ReturnType<typeof dec>>();
  if (invoiceIds.length === 0) return map;

  const grouped = await prisma.salesReturn.groupBy({
    by: ['invoiceId'],
    where: { tenantId, isDeleted: false, invoiceId: { in: invoiceIds } },
    _sum: { totalAmount: true },
  });
  for (const g of grouped) map.set(g.invoiceId, dec(g._sum.totalAmount ?? 0));
  return map;
}

/** الإجمالي الصافي لفاتورة بعد مرتجعاتها — أساس أي حساب مستحق. */
export function netOwed(
  invoice: { id: string; total: unknown },
  returns: Map<string, ReturnType<typeof dec>>,
): ReturnType<typeof dec> {
  return dec(invoice.total as never).minus(returns.get(invoice.id) ?? dec(0));
}

/**
 * قيمة ما أُرجع من فاتورة واحدة — داخل المعاملة لا خارجها.
 *
 * التحصيل يقرّر خلف قفل تسلسل الدفعات، ومرتجعٌ يُسجّل بين القراءة والكتابة
 * يغيّر المستحقّ فعلاً — فتُقرأ القيمة طازجةً خلف القفل.
 */
export async function returnedValueInTx(
  tx: Tx,
  tenantId: string,
  invoiceId: string,
): Promise<ReturnType<typeof dec>> {
  const agg = await tx.salesReturn.aggregate({
    where: { tenantId, invoiceId, isDeleted: false },
    _sum: { totalAmount: true },
  });
  return dec(agg._sum.totalAmount ?? 0);
}

/** ونفسُها خارج معاملة — لفحصٍ مبدئيّ أو لاشتقاق حالة. */
export async function returnedValueOf(
  tenantId: string,
  invoiceId: string,
): Promise<ReturnType<typeof dec>> {
  const agg = await prisma.salesReturn.aggregate({
    where: { tenantId, invoiceId, isDeleted: false },
    _sum: { totalAmount: true },
  });
  return dec(agg._sum.totalAmount ?? 0);
}

/**
 * دين كل عميل من فواتيره المفتوحة — بعد مرتجعاتها.
 *
 * كان يُحسب بتجميعةٍ واحدة: مجموع الإجمالي ناقص مجموع المدفوع. وفي هذا
 * خطأان: المرتجعات لا تُطرح، وفاتورةٌ دُفعت زيادةً تمحو ديناً حقيقياً على
 * فاتورةٍ أخرى. والرقم لا يُقرأ على الشاشة وحده: منه تُبنى رسالة الواتساب
 * التي تُرسل للعميل نفسه — فيُطالَب بمال بضاعةٍ أعادها.
 *
 * فصار لكل فاتورة حسابٌ على حدة بقاعٍ عند الصفر، ثم تُجمع — كما تفعل
 * لوحة المدير وتقرير الأعمار. والعدد صار عددَ ما عليه فعلاً لا كلّ ما فُتح.
 */
export async function openDebtsByCustomer(
  tenantId: string,
): Promise<Map<string, { amount: number; count: number }>> {
  const open = await prisma.invoice.findMany({
    where: { tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
    select: { id: true, customerId: true, total: true, paidAmount: true },
  });
  const returns = await returnsByInvoice(tenantId, open.map((i) => i.id));

  const totals = new Map<string, { amount: ReturnType<typeof dec>; count: number }>();
  for (const inv of open) {
    const left = balance(netOwed(inv, returns), inv.paidAmount);
    if (left.lte(0)) continue;
    const cur = totals.get(inv.customerId) ?? { amount: dec(0), count: 0 };
    totals.set(inv.customerId, { amount: cur.amount.plus(left), count: cur.count + 1 });
  }

  const out = new Map<string, { amount: number; count: number }>();
  for (const [id, v] of totals) out.set(id, { amount: v.amount.toNumber(), count: v.count });
  return out;
}
