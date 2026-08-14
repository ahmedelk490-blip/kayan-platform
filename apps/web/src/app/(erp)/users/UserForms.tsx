'use client';

import { useActionState } from 'react';
import { Field, Select, SubmitButton, FormError } from '@/components/crud/Form';
import type { FormState } from './actions';

/**
 * إنشاء حساب موظف.
 *
 * كلمة المرور تُكتب هنا مرة وتُسلَّم للموظف خارج النظام. لا تُعرض بعدها
 * أبداً ولا تُخزَّن إلا مجزّأة — لا شاشة في هذا النظام تستطيع إظهارها،
 * وهذا مقصود.
 */
export function CreateUserForm({
  action,
  roles,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  roles: { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="nameAr" label="اسم الموظف" required errors={state.fieldErrors} />
        <Field
          name="email"
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          required
          errors={state.fieldErrors}
          hint="هو اسم المستخدم الذي يدخل به."
        />
        <Select
          name="roleKey"
          label="الدور"
          required
          options={roles}
          errors={state.fieldErrors}
        />
        <Field
          name="password"
          label="كلمة المرور"
          type="password"
          required
          errors={state.fieldErrors}
          hint="8 أحرف على الأقل. سلّمها له خارج النظام."
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label="إنشاء الحساب" />
        {state.ok && <span className="text-xs text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}

/** تغيير كلمة مرور موظف. ينهي كل جلساته القائمة. */
export function ResetPasswordForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <div className="min-w-[190px]">
        <input
          name="password"
          type="password"
          required
          placeholder="كلمة مرور جديدة"
          aria-label="كلمة مرور جديدة"
          className="erp-input py-2 text-xs"
        />
        {state.fieldErrors?.password && (
          <p className="mt-1 text-[0.7rem] text-bad">{state.fieldErrors.password}</p>
        )}
        {state.error && <p className="mt-1 text-[0.7rem] text-bad">{state.error}</p>}
        {state.ok && <p className="mt-1 text-[0.7rem] text-ok">{state.ok}</p>}
      </div>
      <button type="submit" className="erp-btn-ghost text-xs">
        تغيير
      </button>
    </form>
  );
}
