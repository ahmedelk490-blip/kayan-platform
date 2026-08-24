'use client';

import { useActionState } from 'react';
import { Field, Select, TextArea, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from '@/lib/ops';

export interface Option {
  value: string;
  label: string;
}

export function DamageForm({
  action,
  employees,
  variants,
  productionOrders,
  today,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  employees: Option[];
  variants: Option[];
  productionOrders: Option[];
  today: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Field
          name="damageDate"
          label="التاريخ"
          type="date"
          dir="ltr"
          defaultValue={today}
          errors={state.fieldErrors}
        />
        <Select
          name="employeeId"
          label="الموظف"
          options={employees}
          placeholder="غير محدَّد"
          errors={state.fieldErrors}
        />
        <Field
          name="department"
          label="القسم"
          placeholder="طباعة · تطريز · خياطة"
          errors={state.fieldErrors}
        />
        <Field name="machine" label="الماكينة" placeholder="رقم أو اسم الماكينة" errors={state.fieldErrors} />
        <Select
          name="variantId"
          label="المنتج / المتغيّر (من النظام)"
          options={variants}
          placeholder="غير مرتبط بمنتج"
          errors={state.fieldErrors}
        />
        <Field
          name="productLabel"
          label="أو اكتب المنتج يدويًا"
          placeholder="اسم المنتج/الصنف التالف"
          hint="لِما لا يوجد في النظام — خامة أو صنف غير مسجَّل"
          errors={state.fieldErrors}
        />
        <Select
          name="productionOrderId"
          label="أمر الإنتاج"
          options={productionOrders}
          placeholder="غير مرتبط بأمر إنتاج"
          errors={state.fieldErrors}
        />
        <Field
          name="quantity"
          label="الكمية التالفة"
          type="number"
          required
          dir="ltr"
          errors={state.fieldErrors}
        />
        <Field
          name="materialCost"
          label="تكلفة الخامات (د.ع)"
          type="number"
          required
          dir="ltr"
          defaultValue="0"
          errors={state.fieldErrors}
        />
        <Field
          name="laborCost"
          label="تكلفة العمالة (د.ع)"
          type="number"
          required
          dir="ltr"
          defaultValue="0"
          hint="ما دُفع مرتين — الشغل الضائع"
          errors={state.fieldErrors}
        />
      </div>

      <TextArea name="reason" label="السبب (مطلوب)" rows={3} errors={state.fieldErrors} />

      <div className="flex items-center gap-3">
        <SubmitButton label="إنشاء المحضر" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>

      <p className="text-[0.7rem] text-txt-4">
        السبب حقل إلزامي بالتحقق لا بالعُرف — محضر هالك بلا سبب هو خسارة غير مُفسَّرة،
        وهي بالضبط ما يوجد هذا السجل لمنعه.
      </p>
    </form>
  );
}
