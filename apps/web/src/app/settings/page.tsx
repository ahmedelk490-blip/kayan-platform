import type { Metadata } from 'next';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { SettingsForm } from './SettingsForm';
import { updateCompanySettings } from './actions';

export const metadata: Metadata = { title: 'الإعدادات المالية' };

/**
 * إعدادات الشركة المالية.
 *
 * The write side of five fields the invoicing module and the printed document
 * have been reading since Phase 10. They had schema defaults and no screen, so
 * every invoice carried 0% VAT and every printout warned about a missing tax
 * number — correct behaviour with no way to correct the cause.
 */
export default async function SettingsPage() {
  const user = await requirePermission('settings.manage');

  const [company, issuedInvoices] = await Promise.all([
    prisma.company.findFirst({ where: { tenantId: user.tenantId } }),
    prisma.invoice.count({ where: { tenantId: user.tenantId, number: { not: null } } }),
  ]);

  return (
    <AppShell user={user} title="الإعدادات المالية">
      <ModuleHeader title="الإعدادات المالية" />

      {company ? (
        <div className="max-w-3xl">
          <SettingsForm
            action={updateCompanySettings}
            issuedInvoices={issuedInvoices}
            company={{
              nameAr: company.nameAr,
              currency: company.currency,
              // Decimal does not cross to a client component.
              defaultTaxRate: company.defaultTaxRate.toString(),
              paymentTermDays: company.paymentTermDays,
              invoicePrefix: company.invoicePrefix,
              taxNumber: company.taxNumber,
              commercialRegister: company.commercialRegister,
              paymentTerms: company.paymentTerms,
            }}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-bad bg-bad-soft px-4 py-3 text-xs text-bad">
          لا توجد بيانات شركة لهذا المستأجر. لا يمكن إنشاؤها من هنا — راجِع إعداد
          النظام.
        </p>
      )}
    </AppShell>
  );
}
