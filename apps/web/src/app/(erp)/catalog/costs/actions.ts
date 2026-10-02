'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { SERVICE_PRICE_NOTE, type PriceService } from '@erp/domain';
import { requirePermission, allows } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { num } from '@/lib/num';

/** الخدمات التي لها سعر قطعة في الشاشة — «بدون خدمة» سعرها سعر المنتج نفسه. */
const PRICED: PriceService[] = ['EMBROIDERY', 'PRINTING', 'DTF'];

/**
 * حفظ تكلفة القطعة وأسعار الخدمات لكل المنتجات — بضغطة واحدة.
 *
 * أرقامٌ للحساب لا تغيّر شيئاً قائماً (بطلب المالك): التكلفة تغذّي حساب الربح
 * وحده؛ وسعر الخدمة مقترحٌ في الفاتورة والكاشير يغيّره البائع، ولا يظهر على
 * الموقع (SERVICE_PRICE_NOTE) ولا يمسّ فاتورةً سابقة. وخدمةٌ لها شرائح أسعار
 * حقيقية لا يُمسّ منها شيء. ويُكتب ما تغيّر وحده.
 */
export async function saveProductNumbers(formData: FormData): Promise<void> {
  const user = await requirePermission('products.write');
  if (!allows(user, 'cost.view')) redirect('/catalog/costs');

  const ids = formData.getAll('pid').map(String);
  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, id: { in: ids }, isDeleted: false },
    select: {
      id: true,
      cost: true,
      piecesPerDozen: true,
      priceTiers: {
        where: { variantId: null },
        select: { id: true, service: true, notes: true, price: true },
      },
    },
  });

  let changed = 0;
  for (const p of products) {
    // تكلفة القطعة — ودستتها معها (القطعة × قطع الدستة) فلا يتعارض الحقلان.
    const typed = num(formData.get(`cost:${p.id}`));
    const cost = typed === null || typed < 0 ? null : Math.round(typed);
    const before = p.cost === null ? null : Math.round(Number(p.cost));
    if (cost !== before) {
      await prisma.product.updateMany({
        where: { id: p.id, tenantId: user.tenantId },
        data: { cost, dozenCost: cost === null ? null : cost * Math.max(1, p.piecesPerDozen) },
      });
      changed += 1;
    }

    for (const s of PRICED) {
      const key = `svc:${p.id}:${s}`;
      if (!formData.has(key)) continue; // خانةٌ مقفلة: للخدمة شرائح حقيقية
      const ofService = p.priceTiers.filter((t) => t.service === s);
      if (ofService.some((t) => t.notes !== SERVICE_PRICE_NOTE)) continue;
      const mark = ofService.find((t) => t.notes === SERVICE_PRICE_NOTE);
      const v = num(formData.get(key));
      const price = v === null || v <= 0 ? null : Math.round(v);

      if (price === null) {
        if (mark) {
          await prisma.priceTier.deleteMany({ where: { id: mark.id, tenantId: user.tenantId } });
          changed += 1;
        }
      } else if (!mark) {
        await prisma.priceTier.create({
          data: {
            tenantId: user.tenantId,
            productId: p.id,
            service: s,
            minQty: 1,
            price,
            notes: SERVICE_PRICE_NOTE,
          },
        });
        changed += 1;
      } else if (Math.round(Number(mark.price)) !== price) {
        await prisma.priceTier.updateMany({
          where: { id: mark.id, tenantId: user.tenantId },
          data: { price, isActive: true },
        });
        changed += 1;
      }
    }
  }

  if (changed > 0) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'costs.products',
      entityType: 'Product',
      detail: `${changed} تغيير في التكاليف وأسعار الخدمات`,
    });
  }

  revalidatePath('/catalog/costs');
  revalidatePath('/reports/profits');
  redirect(`/catalog/costs?saved=products&n=${changed}`);
}

/**
 * حفظ الرواتب الشهرية لكل الموظفين — بضغطة. فارغٌ يعني بلا راتب ثابت.
 *
 * يدخل الراتب حساب الأرباح بحصّة الأيام، وهو نفسه ما يقترحه صرف الرواتب.
 */
export async function saveSalaries(formData: FormData): Promise<void> {
  const user = await requirePermission('hr.manage');

  const ids = formData.getAll('uid').map(String);
  const staff = await prisma.user.findMany({
    where: { tenantId: user.tenantId, id: { in: ids } },
    select: { id: true, monthlySalary: true },
  });

  let changed = 0;
  for (const u of staff) {
    const v = num(formData.get(`sal:${u.id}`));
    const salary = v === null || v <= 0 ? null : Math.round(v);
    const before = u.monthlySalary === null ? null : Math.round(Number(u.monthlySalary));
    if (salary === before) continue;
    await prisma.user.updateMany({
      where: { id: u.id, tenantId: user.tenantId },
      data: { monthlySalary: salary },
    });
    changed += 1;
  }

  if (changed > 0) {
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'costs.salaries',
      entityType: 'User',
      detail: `${changed} راتب`,
    });
  }

  revalidatePath('/catalog/costs');
  revalidatePath('/reports/profits');
  revalidatePath('/hr');
  redirect(`/catalog/costs?saved=salaries&n=${changed}`);
}
