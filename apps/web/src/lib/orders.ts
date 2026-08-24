import 'server-only';

import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';

/**
 * استقبال طلب سلّة من الموقع العام.
 *
 * كالـleads: مسار كتابة عامّ مقيّد، بلا جلسة، يُنشئ **طلباً معلّقاً فقط**
 * (WebOrder بحالة PENDING) بعدّة أصناف — لا فاتورة ولا وصولاً لأي كيان آخر.
 * المندوب يراجعه في الـERP ويحوّله لفاتورة. لا نثق بمعرّف مستأجر من العميل:
 * المستأجر ثابت للموقع، وكل منتج يُتحقّق أنه يخصّه.
 */

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export interface WebOrderItem {
  productId: string;
  color?: string;
  size?: string;
  quantity: number;
}

export interface WebOrderInput {
  name: string;
  phone: string;
  company?: string;
  note?: string;
  items: WebOrderItem[];
}

export type WebOrderResult =
  | { ok: true; number: string }
  | { ok: false; reason: 'items' };

export async function createWebOrder(input: WebOrderInput): Promise<WebOrderResult> {
  setCurrentTenant(PUBLIC_TENANT);

  // نبني سطراً لكل صنف تُطابق منتجه مستأجرَ الموقع. المتغيّر يُحلّ من اللون
  // والمقاس إن أمكن (ليُسعَّر تلقائياً)، وإلا يبقى نصّاً يحلّه المندوب.
  const lines: {
    productId: string;
    variantId: string | null;
    productLabel: string;
    colorLabel: string | null;
    sizeLabel: string | null;
    quantity: number;
  }[] = [];

  for (const item of input.items) {
    const product = await prisma.product.findFirst({
      where: { id: item.productId, tenantId: PUBLIC_TENANT, isDeleted: false, status: 'ACTIVE' },
      select: { id: true, nameAr: true },
    });
    if (!product) continue;

    let variantId: string | null = null;
    if (item.color || item.size) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          productId: product.id,
          isDeleted: false,
          ...(item.color ? { color: { nameAr: item.color } } : {}),
          ...(item.size ? { size: { code: item.size } } : {}),
        },
        select: { id: true },
      });
      variantId = variant?.id ?? null;
    }

    lines.push({
      productId: product.id,
      variantId,
      productLabel: product.nameAr,
      colorLabel: item.color || null,
      sizeLabel: item.size || null,
      quantity: Math.max(1, Math.round(item.quantity)),
    });
  }

  if (lines.length === 0) return { ok: false, reason: 'items' };

  const number = `WO-${Date.now().toString(36).toUpperCase()}`;

  await prisma.webOrder.create({
    data: {
      tenantId: PUBLIC_TENANT,
      number,
      customerName: input.name,
      phone: input.phone,
      company: input.company || null,
      note: input.note || null,
      status: 'PENDING',
      lines: { create: lines },
    },
  });

  return { ok: true, number };
}
