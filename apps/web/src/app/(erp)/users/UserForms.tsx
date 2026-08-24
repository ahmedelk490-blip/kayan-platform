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

// ── تحكّم صلاحيات الموظف ─────────────────────────────────────

import { useState, useTransition } from 'react';
import { PERMISSIONS, type PermissionKey } from '@erp/domain';
import { EditModal } from '@/components/crud/FormModal';
import { setUserPermissions } from './actions';

const EDITABLE = (Object.keys(PERMISSIONS) as PermissionKey[]).filter((p) => p !== 'users.manage');

/** مجموعات الصلاحيات بترتيب ظهورها، لعرضها مقسّمة. */
function permissionGroups(): { title: string; perms: PermissionKey[] }[] {
  const groups: { title: string; perms: PermissionKey[] }[] = [];
  for (const key of EDITABLE) {
    const g = PERMISSIONS[key].group;
    let bucket = groups.find((x) => x.title === g);
    if (!bucket) { bucket = { title: g, perms: [] }; groups.push(bucket); }
    bucket.perms.push(key);
  }
  return groups;
}

/**
 * محرّر صلاحيات موظف — يؤشّر المدير ما يراه الموظف من لوحات ووحدات، فوق دوره.
 * ما يُلغى تأشيره من صلاحيات دوره يُسحب، وما يُؤشَّر زيادة يُمنح (بشرط أن
 * يملكه المدير). القائمة الجانبية للموظف تُبنى من هذه الصلاحيات.
 */
export function PermissionsModal({
  userId,
  userName,
  roleNameAr,
  effective,
}: {
  userId: string;
  userName: string;
  roleNameAr: string;
  effective: PermissionKey[];
}) {
  return (
    <EditModal label="الصلاحيات" title={`صلاحيات ${userName}`} description={`الدور: ${roleNameAr} — أشّر ما يظهر لهذا الموظف`} wide>
      {(onSuccess) => <PermissionsBody userId={userId} effective={effective} onSuccess={onSuccess} />}
    </EditModal>
  );
}

function PermissionsBody({ userId, effective, onSuccess }: { userId: string; effective: PermissionKey[]; onSuccess: () => void }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState<Set<PermissionKey>>(new Set(effective));
  const groups = permissionGroups();

  const toggle = (p: PermissionKey) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });

  const setGroup = (perms: PermissionKey[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const p of perms) on ? next.add(p) : next.delete(p);
      return next;
    });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const p of checked) fd.append('perm', p);
    start(async () => {
      await setUserPermissions(userId, fd);
      onSuccess();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="max-h-[55vh] space-y-5 overflow-y-auto pe-1">
        {groups.map((g) => {
          const allOn = g.perms.every((p) => checked.has(p));
          return (
            <div key={g.title} className="rounded-xl border border-line bg-card-2 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-brand">{g.title}</h4>
                <button type="button" onClick={() => setGroup(g.perms, !allOn)} className="text-[0.7rem] text-brand hover:underline">
                  {allOn ? 'إلغاء الكل' : 'تحديد الكل'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.perms.map((p) => (
                  <label key={p} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-card">
                    <input type="checkbox" checked={checked.has(p)} onChange={() => toggle(p)} className="h-4 w-4 accent-[var(--color-brand)]" />
                    <span className="text-xs text-txt-2">{PERMISSIONS[p].nameAr}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[0.7rem] leading-[1.8] text-txt-4">
        ما تلغي تأشيره يُخفى عن الموظف ويُمنع فعلاً (لا يظهر في قائمته ولا يفتح صفحته).
        لا يمكنك منح صلاحية لا تملكها أنت، و«إدارة المستخدمين» لا تُمنح من هنا.
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="erp-btn disabled:opacity-60">
          {pending ? 'جارٍ الحفظ…' : 'حفظ الصلاحيات'}
        </button>
      </div>
    </form>
  );
}
