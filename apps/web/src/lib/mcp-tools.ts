import { dec, formatMoney, balance, RECEIVABLE_STATUSES, EXPENSE_CATEGORY_AR, type ExpenseCategory } from '@erp/domain';
import { prisma } from './prisma';
import { realProfit } from './profit';
import { isDeliveryDesc } from './delivery';
import { returnsByInvoice, netOwed } from './receivables';
import { resolveRange } from '@/app/(erp)/reports/range';
import { categoryOf } from '@/app/(erp)/returns/category';

/**
 * أدوات «ربط Claude» — قراءة فقط. Claude عند المالك (claude.ai ← Connectors)
 * يسأل بها عن الحسابات: المبيعات والأرباح والمصروفات والمخزون والديون.
 * لا أداة تكتب أو تحذف شيئاً.
 */

const RANGE_PROPS = {
  from: { type: 'string', description: 'بداية المدى YYYY-MM-DD (افتراضياً بداية هذا الشهر)' },
  to: { type: 'string', description: 'نهاية المدى YYYY-MM-DD (افتراضياً اليوم)' },
} as const;

export const MCP_TOOLS = [
  {
    name: 'sales_summary',
    description: 'ملخص المبيعات لمدى تاريخ: عدد الفواتير، المبيعات، المحصّل، عدد القطع، وتفصيل القطع حسب النوع (يلك، تيشيرت…). المبالغ بالدينار العراقي.',
    inputSchema: { type: 'object', properties: { ...RANGE_PROPS }, additionalProperties: false },
  },
  {
    name: 'profit_report',
    description: 'الربح الصافي الحقيقي لمدى تاريخ: المبيعات، المرتجعات، تكلفة البضاعة (الأقدم أولاً)، المصروفات، الرواتب والالتزامات، الهالك، وصافي الربح.',
    inputSchema: { type: 'object', properties: { ...RANGE_PROPS }, additionalProperties: false },
  },
  {
    name: 'expenses_by_category',
    description: 'المصروفات المعتمدة لمدى تاريخ مجمّعة حسب البند.',
    inputSchema: { type: 'object', properties: { ...RANGE_PROPS }, additionalProperties: false },
  },
  {
    name: 'top_products',
    description: 'أكثر الموديلات والألوان مبيعاً لمدى تاريخ (بالقطع).',
    inputSchema: {
      type: 'object',
      properties: { ...RANGE_PROPS, limit: { type: 'integer', description: 'عدد الصفوف (افتراضياً 20)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'stock_levels',
    description: 'رصيد المخزون الحالي لكل موديل ولون (بالعدد). اختياري: بحث باسم الموديل.',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string', description: 'جزء من اسم الموديل' } },
      additionalProperties: false,
    },
  },
  {
    name: 'receivables',
    description: 'الديون المستحقة على العملاء الآن (بعد خصم المرتجعات)، الأكبر أولاً.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'عدد العملاء (افتراضياً 20)' } },
      additionalProperties: false,
    },
  },
] as const;

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const money = (v: Parameters<typeof dec>[0]) => formatMoney(dec(v));

function range(args: Args) {
  const from = str(args.from);
  const to = str(args.to);
  return from || to
    ? resolveRange({ from: from ?? to, to: to ?? from })
    : resolveRange({ period: 'MONTH' });
}

const issued = (tenantId: string) => ({
  tenantId,
  isDeleted: false,
  status: { notIn: ['DRAFT', 'VOID'] },
});

export async function runMcpTool(tenantId: string, name: string, args: Args): Promise<unknown> {
  switch (name) {
    case 'sales_summary': {
      const r = range(args);
      const where = { ...issued(tenantId), issueDate: { gte: r.from, lte: r.to } };
      const [invoices, lines] = await Promise.all([
        prisma.invoice.findMany({ where, select: { total: true, paidAmount: true } }),
        prisma.invoiceLine.findMany({ where: { invoice: where }, select: { description: true, quantity: true, lineTotal: true } }),
      ]);
      const byType = new Map<string, { pieces: number; value: ReturnType<typeof dec> }>();
      let pieces = 0;
      for (const l of lines) {
        if (isDeliveryDesc(l.description)) continue;
        const q = Number(l.quantity);
        pieces += q;
        const t = categoryOf(l.description);
        const f = byType.get(t) ?? { pieces: 0, value: dec(0) };
        f.pieces += q;
        f.value = f.value.plus(dec(l.lineTotal));
        byType.set(t, f);
      }
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        invoices: invoices.length,
        sales: money(invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0))),
        collected: money(invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0))),
        pieces,
        byType: [...byType.entries()]
          .sort((a, b) => b[1].pieces - a[1].pieces)
          .map(([type, f]) => ({ type, pieces: f.pieces, value: money(f.value) })),
        currency: 'IQD',
      };
    }
    case 'profit_report': {
      const r = range(args);
      const p = await realProfit(tenantId, r.from, r.to);
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        sales: money(p.sales),
        returns: money(p.returns),
        costOfGoods: money(p.cogs),
        grossProfit: money(p.grossProfit),
        expenses: money(p.expenses),
        salaries: money(p.salaries),
        fixedObligations: money(p.fixed),
        bonuses: money(p.bonuses),
        damage: money(p.damage),
        penaltiesCollected: money(p.penalties),
        netProfit: money(p.net),
        piecesSold: p.pieces,
        piecesWithoutCost: p.missingCost.pieces,
        currency: 'IQD',
      };
    }
    case 'expenses_by_category': {
      const r = range(args);
      const rows = await prisma.secondaryExpense.groupBy({
        by: ['category'],
        where: { tenantId, isDeleted: false, status: 'APPROVED', expenseDate: { gte: r.from, lte: r.to } },
        _sum: { amount: true },
        _count: { _all: true },
      });
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        categories: rows
          .sort((a, b) => dec(b._sum.amount ?? 0).minus(dec(a._sum.amount ?? 0)).toNumber())
          .map((x) => ({
            category: EXPENSE_CATEGORY_AR[x.category as ExpenseCategory] ?? x.category,
            amount: money(x._sum.amount ?? 0),
            count: x._count._all,
          })),
        currency: 'IQD',
      };
    }
    case 'top_products': {
      const r = range(args);
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const lines = await prisma.invoiceLine.findMany({
        where: { invoice: { ...issued(tenantId), issueDate: { gte: r.from, lte: r.to } } },
        select: {
          description: true,
          quantity: true,
          lineTotal: true,
          product: { select: { nameAr: true } },
          variant: { select: { color: { select: { nameAr: true } } } },
        },
      });
      const m = new Map<string, { pieces: number; value: ReturnType<typeof dec> }>();
      for (const l of lines) {
        if (isDeliveryDesc(l.description)) continue;
        const key = `${l.product?.nameAr ?? l.description.split(' · ')[0]} · ${l.variant?.color?.nameAr ?? 'بلا لون'}`;
        const f = m.get(key) ?? { pieces: 0, value: dec(0) };
        f.pieces += Number(l.quantity);
        f.value = f.value.plus(dec(l.lineTotal));
        m.set(key, f);
      }
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        rows: [...m.entries()]
          .sort((a, b) => b[1].pieces - a[1].pieces)
          .slice(0, limit)
          .map(([item, f]) => ({ item, pieces: f.pieces, value: money(f.value) })),
      };
    }
    case 'stock_levels': {
      const search = str(args.search)?.trim();
      const stock = await prisma.stock.findMany({
        where: {
          variant: {
            isDeleted: false,
            product: { tenantId, isDeleted: false, ...(search ? { nameAr: { contains: search } } : {}) },
          },
        },
        select: {
          onHand: true,
          variant: { select: { product: { select: { nameAr: true } }, color: { select: { nameAr: true } } } },
        },
      });
      const m = new Map<string, number>();
      for (const s of stock) {
        const key = `${s.variant.product.nameAr} · ${s.variant.color?.nameAr ?? 'بلا لون'}`;
        m.set(key, (m.get(key) ?? 0) + Number(s.onHand));
      }
      const rows = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
      return {
        totalPieces: rows.reduce((s, [, n]) => s + n, 0),
        note: 'الرقم السالب = قطع بيعت بلا بضاعة داخلة مسجّلة.',
        rows: rows.map(([item, pieces]) => ({ item, pieces })),
      };
    }
    case 'receivables': {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const inv = await prisma.invoice.findMany({
        where: { tenantId, isDeleted: false, status: { in: RECEIVABLE_STATUSES } },
        select: {
          id: true,
          total: true,
          paidAmount: true,
          customer: { select: { companyName: true, contactName: true } },
        },
      });
      const rets = await returnsByInvoice(tenantId, inv.map((i) => i.id));
      const m = new Map<string, ReturnType<typeof dec>>();
      let total = dec(0);
      for (const i of inv) {
        const owed = balance(netOwed(i, rets), i.paidAmount);
        if (dec(owed).lte(0)) continue;
        const name = i.customer.companyName ?? i.customer.contactName ?? '—';
        m.set(name, (m.get(name) ?? dec(0)).plus(dec(owed)));
        total = total.plus(dec(owed));
      }
      return {
        totalOutstanding: money(total),
        customers: [...m.entries()]
          .sort((a, b) => b[1].minus(a[1]).toNumber())
          .slice(0, limit)
          .map(([customer, amount]) => ({ customer, amount: money(amount) })),
        currency: 'IQD',
      };
    }
    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}
