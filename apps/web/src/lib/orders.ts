import 'server-only';

import { prisma } from './prisma';
import { setCurrentTenant } from './tenant-context';

/**
 * استقبال طلب منتج من الموقع العام.
 *
 * كالـleads تماماً: مسار كتابة عامّ مقيّد، بلا جلسة، يُنشئ **طلباً معلّقاً
 * فقط** (WebOrder بحالة PENDING) — لا فاتورة ولا وصولاً لأي كيان آخر. المندوب
 * يراجعه في الـERP ويحوّله لفاتورة، فعندها تُخصَّص الأسعار والأرقام. لا نثق
 * بمعرّف مستأجر من العميل: المستأجر يُشتقّ من المنتج نفسه.
 */

const PUBLIC_TENANT = process.env.PUBLIC_TENANT_ID ?? 'kayan';

export interface WebOrderInput {
  productId: string;
  color?: string;
  size?: string;
  quantity: number;
  name: string;
  phone: string;
  company?: string;
  note?: string;
}

export type WebOrderResult =
  | { ok: true; number: string }
  | { ok: false; reason: 'product' };

export async function createWebOrder(input: WebOrderInput): Promise<WebOrderResult> {
  setCurrentTenant(PUBLIC_TENANT);

  // المنتج لازم يكون موجوداً ومعروضاً لهذا المستأجر — لا نثق بأي معرّف وارد.
  const product = await prisma.product.findFirst({
    where: { id: input.productId, tenantId: PUBLIC_TENANT, isDeleted: false, status: 'ACTIVE' },
    select: { id: true, nameAr: true },
  });
  if (!product) return { ok: false, reason: 'product' };

  // نحاول مطابقة المتغيّر من اللون والمقاس المختارين — إن طابق خزّنا معرّفه
  // ليُسعَّر تلقائياً عند التحويل؛ وإلا نخزّن النصوص فقط ويحلّه المندوب.
  let variantId: string | null = null;
  if (input.color || input.size) {
    const variant = await prisma.productVariant.findFirst({
      where: {
        productId: product.id,
        isDeleted: false,
        ...(input.color ? { color: { nameAr: input.color } } : {}),
        ...(input.size ? { size: { code: input.size } } : {}),
      },
      select: { id: true },
    });
    variantId = variant?.id ?? null;
  }

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
      lines: {
        create: {
          productId: product.id,
          variantId,
          productLabel: product.nameAr,
          colorLabel: input.color || null,
          sizeLabel: input.size || null,
          quantity: input.quantity,
        },
      },
    },
  });

  return { ok: true, number };
}
