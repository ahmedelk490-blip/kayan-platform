'use client';

import { FormModal, EditModal } from '@/components/crud/FormModal';
import { CustomerForm, type CustomerValues } from './CustomerForm';
import { createCustomerInline, updateCustomer } from './actions';

/**
 * إضافة عميل — modal.
 *
 * The same CustomerForm the full-page route renders, and the same validation
 * and RBAC behind it. Only the ending differs: this stays on the list.
 */
export function NewCustomerModal() {
  return (
    <FormModal
      trigger="عميل جديد"
      title="عميل جديد"
      description="يُنشأ الكود تلقائياً. الحقول المطلوبة معلَّمة بنجمة."
    >
      {(onSuccess) => (
        <CustomerForm
          action={createCustomerInline}
          submitLabel="حفظ العميل"
          onSuccess={onSuccess}
        />
      )}
    </FormModal>
  );
}

/** تعديل عميل — modal, from the list row. */
export function EditCustomerModal({
  id,
  code,
  values,
}: {
  id: string;
  code: string;
  values: CustomerValues;
}) {
  return (
    <EditModal label="تعديل" title={`تعديل العميل ${code}`}>
      {(onSuccess) => (
        <CustomerForm
          action={updateCustomer.bind(null, id)}
          values={values}
          submitLabel="حفظ التعديلات"
          onSuccess={onSuccess}
        />
      )}
    </EditModal>
  );
}
