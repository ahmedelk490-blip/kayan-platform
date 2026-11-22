import { dec, formatMoney, balance, RECEIVABLE_STATUSES, EXPENSE_CATEGORY_AR, type ExpenseCategory } from '@erp/domain';
import { prisma } from './prisma';
import { realProfit } from './profit';
import { isDeliveryDesc } from './delivery';
import { returnsByInvoice, netOwed } from './receivables';
import { resolveRange } from '@/app/(erp)/reports/range';
import { categoryOf } from '@/app/(erp)/returns/category';
import { giftOf, governorateOf } from './gift';

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
  {
    name: 'list_invoices',
    description: 'قائمة الفواتير لمدى تاريخ مع العميل والمبلغ والمدفوع والحالة والمحافظة والهدية. اختياري: بحث باسم العميل أو رقم الفاتورة.',
    inputSchema: {
      type: 'object',
      properties: { ...RANGE_PROPS, search: { type: 'string' }, limit: { type: 'integer', description: 'افتراضياً 50' } },
      additionalProperties: false,
    },
  },
  {
    name: 'invoice_detail',
    description: 'تفاصيل فاتورة واحدة برقمها: الأصناف والكميات والأسعار والتكلفة والدفعات والملاحظات.',
    inputSchema: { type: 'object', properties: { number: { type: 'string' } }, required: ['number'], additionalProperties: false },
  },
  {
    name: 'customers',
    description: 'العملاء مع هواتفهم وعناوينهم وعدد فواتيرهم ومجموع مشترياتهم والمتبقي عليهم. اختياري: بحث بالاسم أو الهاتف.',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string' }, limit: { type: 'integer', description: 'افتراضياً 50' } },
      additionalProperties: false,
    },
  },
  {
    name: 'products_catalog',
    description: 'كتالوج الموديلات: الكود، سعر البيع، تكلفة القطعة، الألوان، والظهور على الموقع.',
    inputSchema: { type: 'object', properties: { search: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'staff',
    description: 'الموظفون: الاسم والدور والراتب الشهري ونسبة العمولة، وقطع كل موظف وقيمة مبيعاته في مدى تاريخ.',
    inputSchema: { type: 'object', properties: { ...RANGE_PROPS }, additionalProperties: false },
  },
  {
    name: 'purchases',
    description: 'أوامر الشراء لمدى تاريخ مع المورّد والمبلغ والمدفوع والمتبقي، ومجموع المستحق للمورّدين.',
    inputSchema: { type: 'object', properties: { ...RANGE_PROPS }, additionalProperties: false },
  },
  {
    name: 'returns_and_damage',
    description: 'المرتجعات والهالك لمدى تاريخ: الأرقام والمبالغ والأسباب.',
    inputSchema: { type: 'object', properties: { ...RANGE_PROPS }, additionalProperties: false },
  },
  {
    name: 'cost_batches',
    description: 'دفعات البضاعة بأسعار شرائها (الأقدم أولاً): الكمية والباقي وسعر القطعة لكل موديل ولون.',
    inputSchema: { type: 'object', properties: { search: { type: 'string' } }, additionalProperties: false },
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
    case 'list_invoices': {
      const r = range(args);
      const q = str(args.search)?.trim();
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      const rows = await prisma.invoice.findMany({
        where: {
          tenantId,
          isDeleted: false,
          issueDate: { gte: r.from, lte: r.to },
          ...(q
            ? { OR: [{ number: { contains: q } }, { customer: { contactName: { contains: q } } }, { customer: { companyName: { contains: q } } }] }
            : {}),
        },
        orderBy: { issueDate: 'desc' },
        take: limit,
        select: {
          number: true, status: true, issueDate: true, total: true, paidAmount: true, notes: true, source: true,
          customer: { select: { companyName: true, contactName: true, phone: true } },
        },
      });
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        invoices: rows.map((i) => ({
          number: i.number,
          date: i.issueDate?.toISOString().slice(0, 10),
          customer: i.customer.companyName ?? i.customer.contactName,
          phone: i.customer.phone,
          status: i.status,
          total: money(i.total),
          paid: money(i.paidAmount),
          source: i.source,
          governorate: governorateOf(i.notes),
          gift: giftOf(i.notes),
        })),
      };
    }
    case 'invoice_detail': {
      const number = str(args.number)?.trim();
      if (!number) throw new Error('اكتب رقم الفاتورة');
      const i = await prisma.invoice.findFirst({
        where: { tenantId, number },
        select: {
          number: true, status: true, issueDate: true, dueDate: true, subtotal: true, discountAmount: true, total: true,
          paidAmount: true, notes: true, source: true, voidReason: true,
          customer: { select: { companyName: true, contactName: true, phone: true, address: true } },
          lines: { select: { description: true, quantity: true, unitPrice: true, lineTotal: true, unitCost: true } },
        },
      });
      if (!i) throw new Error('الفاتورة غير موجودة');
      return {
        number: i.number,
        status: i.status,
        issueDate: i.issueDate?.toISOString().slice(0, 10),
        dueDate: i.dueDate?.toISOString().slice(0, 10),
        subtotal: money(i.subtotal),
        discount: money(i.discountAmount),
        total: money(i.total),
        paid: money(i.paidAmount),
        notes: i.notes,
        source: i.source,
        voidReason: i.voidReason,
        customer: i.customer.companyName ?? i.customer.contactName,
        phone: i.customer.phone,
        address: i.customer.address,
        lines: i.lines.map((l) => ({
          item: l.description,
          qty: Number(l.quantity),
          price: money(l.unitPrice),
          total: money(l.lineTotal),
          unitCost: l.unitCost == null ? null : money(l.unitCost),
        })),
      };
    }
    case 'customers': {
      const q = str(args.search)?.trim();
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 300);
      const rows = await prisma.customer.findMany({
        where: {
          tenantId,
          isDeleted: false,
          ...(q ? { OR: [{ contactName: { contains: q } }, { companyName: { contains: q } }, { phone: { contains: q } }] } : {}),
        },
        take: limit,
        select: {
          code: true, companyName: true, contactName: true, phone: true, address: true, source: true,
          invoices: { where: { isDeleted: false, status: { notIn: ['DRAFT', 'VOID'] } }, select: { total: true, paidAmount: true } },
        },
      });
      return rows
        .map((c) => {
          const total = c.invoices.reduce((s, i) => s.plus(dec(i.total)), dec(0));
          const paid = c.invoices.reduce((s, i) => s.plus(dec(i.paidAmount)), dec(0));
          return {
            name: c.companyName ?? c.contactName, code: c.code, phone: c.phone, address: c.address, source: c.source,
            invoices: c.invoices.length, purchases: money(total), remaining: money(total.minus(paid)),
          };
        })
        .sort((a, b) => b.invoices - a.invoices);
    }
    case 'products_catalog': {
      const q = str(args.search)?.trim();
      const rows = await prisma.product.findMany({
        where: { tenantId, isDeleted: false, ...(q ? { nameAr: { contains: q } } : {}) },
        select: {
          nameAr: true, sku: true, sellingPrice: true, cost: true, dozenPrice: true, piecesPerDozen: true, showOnSite: true, status: true,
          variants: { where: { isDeleted: false, isActive: true }, select: { color: { select: { nameAr: true } } } },
        },
      });
      return rows.map((p) => ({
        model: p.nameAr, sku: p.sku, status: p.status, onSite: p.showOnSite,
        price: p.sellingPrice == null ? null : money(p.sellingPrice),
        cost: p.cost == null ? null : money(p.cost),
        dozenPrice: p.dozenPrice == null ? null : money(p.dozenPrice),
        piecesPerDozen: p.piecesPerDozen,
        colors: [...new Set(p.variants.map((v) => v.color?.nameAr ?? 'بلا لون'))],
      }));
    }
    case 'staff': {
      const r = range(args);
      const [users, lines] = await Promise.all([
        prisma.user.findMany({
          where: { tenantId },
          select: { id: true, name: true, nameAr: true, isActive: true, monthlySalary: true, commissionPercent: true, role: { select: { nameAr: true } } },
        }),
        prisma.invoiceLine.findMany({
          where: { invoice: { ...issued(tenantId), issueDate: { gte: r.from, lte: r.to } } },
          select: { description: true, quantity: true, lineTotal: true, invoice: { select: { issuedById: true, createdById: true } } },
        }),
      ]);
      const per = new Map<string, { pieces: number; value: ReturnType<typeof dec> }>();
      for (const l of lines) {
        if (isDeliveryDesc(l.description)) continue;
        const who = l.invoice.issuedById ?? l.invoice.createdById ?? '';
        const f = per.get(who) ?? { pieces: 0, value: dec(0) };
        f.pieces += Number(l.quantity);
        f.value = f.value.plus(dec(l.lineTotal));
        per.set(who, f);
      }
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        staff: users.map((u) => ({
          name: u.nameAr ?? u.name,
          role: u.role?.nameAr,
          active: u.isActive,
          monthlySalary: u.monthlySalary == null ? null : money(u.monthlySalary),
          commissionPercent: u.commissionPercent == null ? null : Number(u.commissionPercent),
          piecesSold: per.get(u.id)?.pieces ?? 0,
          salesValue: money(per.get(u.id)?.value ?? 0),
        })),
      };
    }
    case 'purchases': {
      const r = range(args);
      const [rows, open] = await Promise.all([
        prisma.purchaseOrder.findMany({
          where: { tenantId, isDeleted: false, orderDate: { gte: r.from, lte: r.to } },
          orderBy: { orderDate: 'desc' },
          select: { number: true, status: true, orderDate: true, total: true, paidAmount: true, supplier: { select: { name: true } } },
        }),
        prisma.purchaseOrder.findMany({
          where: { tenantId, isDeleted: false, status: { not: 'CANCELLED' } },
          select: { total: true, paidAmount: true },
        }),
      ]);
      const owed = open.reduce((s, o) => s.plus(dec(o.total).minus(dec(o.paidAmount))), dec(0));
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        owedToSuppliersNow: money(owed),
        orders: rows.map((o) => ({
          number: o.number, supplier: o.supplier.name, status: o.status, date: o.orderDate.toISOString().slice(0, 10),
          total: money(o.total), paid: money(o.paidAmount), remaining: money(dec(o.total).minus(dec(o.paidAmount))),
        })),
      };
    }
    case 'returns_and_damage': {
      const r = range(args);
      const [rets, dmg] = await Promise.all([
        prisma.salesReturn.findMany({
          where: { tenantId, isDeleted: false, returnDate: { gte: r.from, lte: r.to } },
          select: { number: true, invoiceNumber: true, customerName: true, reason: true, totalAmount: true, returnDate: true },
        }),
        prisma.damageRecord.findMany({
          where: { tenantId, isDeleted: false, damageDate: { gte: r.from, lte: r.to } },
          select: { number: true, productLabel: true, quantity: true, reason: true, totalCost: true, status: true, damageDate: true },
        }),
      ]);
      return {
        period: `${r.fromStr} → ${r.toStr}`,
        returnsTotal: money(rets.reduce((s, x) => s.plus(dec(x.totalAmount)), dec(0))),
        returns: rets.map((x) => ({ ...x, totalAmount: money(x.totalAmount), returnDate: x.returnDate.toISOString().slice(0, 10) })),
        damageTotal: money(dmg.reduce((s, x) => s.plus(dec(x.totalCost)), dec(0))),
        damage: dmg.map((x) => ({ ...x, quantity: Number(x.quantity), totalCost: money(x.totalCost), damageDate: x.damageDate.toISOString().slice(0, 10) })),
      };
    }
    case 'cost_batches': {
      const q = str(args.search)?.trim();
      const products = await prisma.product.findMany({
        where: { tenantId, isDeleted: false, ...(q ? { nameAr: { contains: q } } : {}) },
        select: { id: true, nameAr: true },
      });
      const name = new Map(products.map((p) => [p.id, p.nameAr]));
      const layers = await prisma.costLayer.findMany({
        where: { tenantId, productId: { in: products.map((p) => p.id) } },
        orderBy: [{ productId: 'asc' }, { receivedAt: 'asc' }],
      });
      const colors = new Map(
        (await prisma.color.findMany({ where: { tenantId }, select: { id: true, nameAr: true } })).map((c) => [c.id, c.nameAr]),
      );
      return layers.map((l) => ({
        model: name.get(l.productId),
        color: l.colorId ? colors.get(l.colorId) : 'بلا لون',
        date: l.receivedAt.toISOString().slice(0, 10),
        quantity: Number(l.quantity),
        remaining: Number(l.remaining),
        unitCost: money(l.unitCost),
        note: l.note,
      }));
    }
    default:
      throw new Error(`أداة غير معروفة: ${name}`);
  }
}
