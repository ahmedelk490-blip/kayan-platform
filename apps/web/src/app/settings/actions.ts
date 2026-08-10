'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';
import type { FormState } from './shared';

/**
 * إعدادات الشركة المالية.
 *
 * Until now these five facts were readable by the invoicing module and by the
 * printed document, but nothing in the application could write them — they
 * existed only as schema defaults. That is why every invoice carried 0% VAT
 * and every printout showed the "no tax number" warning: not a bug in the
 * document, a missing screen.
 *
 * Nothing here is invented. The tax number and commercial register stay null
 * until the business types them, and a null tax number still makes the printed
 * document warn rather than quietly look official.
 *
 * These settings apply to NEW documents only. An issued invoice carries its
 * own tax rate, its own totals and its own number; changing the rate here has
 * no reach backwards, which is the same snapshot rule the formula versions
 * follow.
 */

const SettingsSchema = z.object({
  nameAr: z.string().trim().min(2, 'اسم الشركة مطلوب.').max(160),
  currency: z
    .string()
    .trim()
    .min(1, 'رمز العملة مطلوب.')
    .max(8, 'رمز العملة طويل.')
    .regex(/^[A-Za-z؀-ۿ.]+$/u, 'رمز العملة يحتوي على رموز غير مقبولة.'),
  defaultTaxRate: z
    .number({ message: 'نسبة الضريبة يجب أن تكون رقماً.' })
    .min(0, 'نسبة الضريبة لا يمكن أن تكون سالبة.')
    // A rate above 100% is arithmetically expressible and commercially
    // meaningless — far likelier to be 14 typed as 1400 than a real tax.
    .max(100, 'نسبة الضريبة لا يمكن أن تتجاوز 100%.'),
  paymentTermDays: z
    .number({ message: 'مهلة السداد يجب أن تكون رقماً.' })
    .int('مهلة السداد بالأيام، بلا كسور.')
    .min(0, 'مهلة السداد لا يمكن أن تكون سالبة.')
    .max(365, 'مهلة السداد لا تتجاوز 365 يوماً.'),
  invoicePrefix: z
    .string()
    .trim()
    .min(1, 'بادئة الفاتورة مطلوبة.')
    .max(8, 'بادئة الفاتورة 8 أحرف على الأكثر.')
    .regex(/^[A-Z0-9]+$/, 'بادئة الفاتورة بحروف لاتينية كبيرة وأرقام فقط.'),
  taxNumber: z.string().trim().max(40).optional().or(z.literal('')),
  commercialRegister: z.string().trim().max(40).optional().or(z.literal('')),
  paymentTerms: z.string().trim().max(400).optional().or(z.literal('')),
});

/** Read a numeric field, distinguishing "empty" from "not a number". */
function num(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? '').trim();
  if (raw === '') return Number.NaN;
  return Number(raw);
}

export async function updateCompanySettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('settings.manage');

  const parsed = SettingsSchema.safeParse({
    nameAr: String(formData.get('nameAr') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    defaultTaxRate: num(formData, 'defaultTaxRate'),
    paymentTermDays: num(formData, 'paymentTermDays'),
    invoicePrefix: String(formData.get('invoicePrefix') ?? '').toUpperCase(),
    taxNumber: String(formData.get('taxNumber') ?? ''),
    commercialRegister: String(formData.get('commercialRegister') ?? ''),
    paymentTerms: String(formData.get('paymentTerms') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const company = await prisma.company.findFirst({
    where: { tenantId: user.tenantId },
    select: { id: true, invoicePrefix: true, defaultTaxRate: true },
  });
  if (!company) return { error: 'لا توجد بيانات شركة لهذا المستأجر.' };

  // The prefix feeds the gapless invoice sequence, which counts per prefix and
  // per year. Changing it after invoices exist restarts the count at 0001 and
  // produces two documents that look like the same number to anyone reading
  // quickly. Refuse rather than renumber history.
  const wantsNewPrefix = parsed.data.invoicePrefix !== company.invoicePrefix;
  if (wantsNewPrefix) {
    const issued = await prisma.invoice.count({
      where: { tenantId: user.tenantId, number: { not: null } },
    });
    if (issued > 0) {
      return {
        fieldErrors: {
          invoicePrefix: `لا يمكن تغيير البادئة بعد إصدار ${issued} فاتورة — الترقيم المتسلسل سيبدأ من جديد ويتكرر.`,
        },
      };
    }
  }

  const before = company.defaultTaxRate.toString();

  await prisma.company.update({
    where: { id: company.id },
    data: {
      nameAr: parsed.data.nameAr,
      currency: parsed.data.currency,
      // Decimal all the way down: the string goes to NUMERIC(19,4) without
      // passing through a JS float.
      defaultTaxRate: parsed.data.defaultTaxRate.toFixed(4),
      paymentTermDays: parsed.data.paymentTermDays,
      invoicePrefix: parsed.data.invoicePrefix,
      // Empty means "not supplied", not an empty string on a tax document.
      taxNumber: parsed.data.taxNumber || null,
      commercialRegister: parsed.data.commercialRegister || null,
      paymentTerms: parsed.data.paymentTerms || null,
    },
  });

  await audit({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'settings.update',
    entityType: 'Company',
    entityId: company.id,
    detail: `الضريبة ${before}% ← ${parsed.data.defaultTaxRate}% · السداد ${parsed.data.paymentTermDays} يوم · الرقم الضريبي ${parsed.data.taxNumber ? 'مُدخَل' : 'غير مُدخَل'}`,
  });

  revalidatePath('/settings');
  revalidatePath('/invoices');
  return { ok: 'حُفظت الإعدادات. تُطبَّق على المستندات الجديدة فقط.' };
}
