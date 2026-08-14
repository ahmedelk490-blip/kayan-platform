import type { Metadata } from 'next';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS, type RoleKey } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { authDb } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { ModuleHeader, Table, Badge } from '@/components/crud/Shell';
import { CreateUserForm, ResetPasswordForm } from './UserForms';
import { createUser, resetPassword, setUserActive, grantableRoles } from './actions';

export const metadata: Metadata = { title: 'حسابات الفريق' };

/**
 * حسابات الفريق.
 *
 * المدير يفتح الحسابات ويغلقها ويغيّر كلمات المرور. حساب مدير النظام
 * (ADMIN) يُعرض ولا يُمَس: مدير يصنع مدير نظام يمنح نفسه كل شيء.
 *
 * جدول الصلاحيات أسفل الصفحة للقراءة: يوضّح ما يراه كل دور فعلاً قبل أن
 * يُمنح لأحد. الصلاحيات نفسها تُعدَّل في الكود لا من الشاشة — مصفوفة
 * تُحرَّر أثناء التشغيل تعني أن أحداً قد يمنح نفسه ما لم يُقصد له.
 */
export default async function UsersPage() {
  const actor = await requirePermission('users.manage');

  const [users, roles] = await Promise.all([
    authDb.user.findMany({
      where: { tenantId: actor.tenantId },
      include: { role: true, _count: { select: { sessions: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    grantableRoles(),
  ]);

  return (
    <AppShell user={actor} title="حسابات الفريق">
      <ModuleHeader title="حسابات الفريق" />

      <div className="space-y-6">
        <section className="erp-card p-6">
          <h3 className="mb-1 text-sm font-semibold text-brand">إنشاء حساب</h3>
          <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
            البريد هو اسم المستخدم. كلمة المرور تُكتب مرة وتُسلَّم للموظف — لا شاشة
            في النظام تستطيع إظهارها بعد ذلك.
          </p>
          <CreateUserForm action={createUser} roles={roles} />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-brand">
            الحسابات — {users.length}
          </h3>
          <Table
            headers={['الاسم', 'البريد', 'الدور', 'الحالة', 'كلمة المرور', '']}
            empty={users.length === 0}
          >
            {users.map((u) => {
              const isAdmin = u.role.key === 'ADMIN';
              const isSelf = u.id === actor.id;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3 text-txt">{u.nameAr ?? u.name}</td>
                  <td dir="ltr" className="px-4 py-3 text-start text-txt-3">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={isAdmin ? 'bad' : 'muted'}>
                      {ROLES[u.role.key as RoleKey]?.nameAr ?? u.role.key}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <Badge tone="ok">نشط</Badge>
                    ) : (
                      <Badge tone="bad">معطّل</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <span className="text-[0.7rem] text-txt-4">محمي</span>
                    ) : (
                      <ResetPasswordForm action={resetPassword.bind(null, u.id)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {!isAdmin && !isSelf && (
                      <form action={setUserActive.bind(null, u.id, !u.isActive)}>
                        <button
                          type="submit"
                          className={`text-[0.7rem] hover:underline ${
                            u.isActive ? 'text-bad' : 'text-ok'
                          }`}
                        >
                          {u.isActive ? 'تعطيل' : 'تفعيل'}
                        </button>
                      </form>
                    )}
                    {isSelf && <span className="text-[0.7rem] text-txt-4">أنت</span>}
                  </td>
                </tr>
              );
            })}
          </Table>
        </section>

        {/* ما يراه كل دور — للقراءة، ليُعرف قبل المنح لا بعده. */}
        <section className="erp-card p-6">
          <h3 className="mb-1 text-sm font-semibold text-brand">ماذا يرى كل دور</h3>
          <p className="mb-4 text-[0.7rem] leading-[1.9] text-txt-4">
            الصلاحيات تُعدَّل في الكود لا من هنا. مصفوفة تُحرَّر أثناء التشغيل تعني
            أن أحداً قد يمنح نفسه ما لم يُقصد له.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(ROLES) as RoleKey[]).map((key) => {
              const granted = ROLE_PERMISSIONS[key];
              return (
                <div key={key} className="rounded-lg border border-line p-4">
                  <p className="text-xs font-medium text-txt">{ROLES[key].nameAr}</p>
                  <p className="mt-1 text-[0.7rem] text-txt-4">
                    {granted.length} من {Object.keys(PERMISSIONS).length} صلاحية
                  </p>
                  <p className="mt-2 text-[0.7rem] leading-[1.8] text-txt-3">
                    يهبط على <span dir="ltr">{ROLES[key].landingPath}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
