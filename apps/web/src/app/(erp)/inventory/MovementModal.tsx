'use client';

import { FormModal } from '@/components/crud/FormModal';
import { MovementForm, type VariantChoice } from './MovementForm';

/**
 * تسجيل حركة مخزون — modal.
 *
 * The highest-frequency form in the system, which is why it is the one that
 * most deserves not to cost a page navigation. The movement itself is
 * unchanged: still append-only, still posted by the same server action, and
 * still corrected by a reversal rather than an edit.
 */
export function MovementModal({
  variants,
}: {
  variants: VariantChoice[];
}) {
  return (
    <FormModal
      trigger="+ إدخال / صرف بضاعة"
      title="تسجيل حركة مخزون"
      description="أدخل رقماً موجباً — النظام يحدد الاتجاه من نوع الحركة. والعدد الغلط يُصحَّح بعدها من تبويب «الحركات»."
      wide
    >
      {(onSuccess) => (
        <MovementForm
          variants={variants}
          onSuccess={onSuccess}
        />
      )}
    </FormModal>
  );
}
