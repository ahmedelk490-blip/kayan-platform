'use client';

import type { SupplyKind } from '@erp/domain';
import { FormModal } from '@/components/crud/FormModal';
import { SupplyForm } from './SupplyForms';
import type { FormState } from '@/lib/ops';

/**
 * تعديل مستلزم من داخل جدول القائمة — modal.
 *
 * يعيد استخدام نموذج الإضافة نفسه بقيم أوّلية، فلا يتباعد نموذجان. الرصيد
 * ليس بينها: يُغيَّر بحركة لا بتحرير حقل.
 */
export function SupplyEditModal({
  action,
  defaults,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults: { nameAr: string; kind: SupplyKind; category: string; unit: string; minStock: number };
}) {
  return (
    <FormModal trigger="تعديل" title={`تعديل ${defaults.nameAr}`} wide>
      {() => <SupplyForm action={action} defaults={defaults} submitLabel="حفظ التعديل" />}
    </FormModal>
  );
}
