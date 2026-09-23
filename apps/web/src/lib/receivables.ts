import 'server-only';

import { dec } from '@erp/domain';
import { prisma } from './prisma';

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
