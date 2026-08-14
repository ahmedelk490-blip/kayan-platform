'use client';

import { FormModal, EditModal } from '@/components/crud/FormModal';
import { SupplierForm, type SupplierValues } from './SupplierForm';
import { createSupplierInline, updateSupplier } from './actions';

export function NewSupplierModal() {
  return (
    <FormModal
      trigger="مورّد جديد"
      title="مورّد جديد"
      description="يُنشأ الكود تلقائياً. الحقول المطلوبة معلَّمة بنجمة."
    >
      {(onSuccess) => (
        <SupplierForm
          action={createSupplierInline}
          submitLabel="حفظ المورّد"
          onSuccess={onSuccess}
        />
      )}
    </FormModal>
  );
}

export function EditSupplierModal({
  id,
  code,
  values,
}: {
  id: string;
  code: string;
  values: SupplierValues;
}) {
  return (
    <EditModal label="تعديل" title={`تعديل المورّد ${code}`}>
      {(onSuccess) => (
        <SupplierForm
          action={updateSupplier.bind(null, id)}
          values={values}
          submitLabel="حفظ التعديلات"
          onSuccess={onSuccess}
        />
      )}
    </EditModal>
  );
}
