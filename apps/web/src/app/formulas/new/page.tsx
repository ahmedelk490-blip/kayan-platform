import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/guard';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader } from '@/components/crud/Shell';
import { FormulaForm } from '../FormulaForm';
import { createFormula } from '../actions';

export const metadata: Metadata = { title: 'معادلة جديدة' };

export default async function NewFormulaPage() {
  const user = await requirePermission('formula.write');

  return (
    <AppShell user={user} title="معادلة جديدة">
      <ModuleHeader
        title="معادلة جديدة"
        action={
          <Link href="/formulas" className="erp-btn-ghost">
            رجوع
          </Link>
        }
      />
      <div className="erp-card p-6">
        <FormulaForm action={createFormula} submitLabel="إنشاء المعادلة" />
        <p className="mt-4 text-[0.7rem] text-txt-4">
          تُنشأ المعادلة بإصدار مسودة رقم ١. أضِف البنود والمعاملات ثم انشر الإصدار —
          المعادلة لا تُستخدم في حساب أي تكلفة قبل النشر.
        </p>
      </div>
    </AppShell>
  );
}
