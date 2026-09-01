import type { Metadata } from 'next';
import { requirePermission } from '@/lib/guard';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/AppShell';
import { Kpi, Panel } from '@/components/Kpi';
import { can } from '@erp/domain';
import { SeedButton } from './SeedButton';

export const metadata: Metadata = { title: 'الإدارة' };

/**
 * لوحة الإدارة — users, roles and the live permission matrix.
 *
 * The matrix is read from the database rather than from the code constant, so
 * this page shows what is actually granted, not what was intended.
 */
export default async function AdminPage() {
  const user = await requirePermission('admin.view');

  const [users, roles, sessionCount, auditCount] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.role.findMany({
      include: { _count: { select: { permissions: true, users: true } } },
      orderBy: { key: 'asc' },
    }),
    // جلسات هذا المستأجر فقط — بلا شرط المستخدم كانت تُعدّ جلسات كل المستأجرين.
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { tenantId: user.tenantId } } }),
    prisma.auditLog.count({ where: { tenantId: user.tenantId } }),
  ]);

  return (
    <AppShell user={user} title="الإدارة">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="المستخدمون" value={String(users.length)} unit="مستخدم" />
          <Kpi label="الأدوار" value={String(roles.length)} unit="دور" />
          <Kpi label="الجلسات النشطة" value={String(sessionCount)} unit="جلسة" />
          <Kpi label="سجل التدقيق" value={String(auditCount)} unit="سجل" />
        </div>

        <Panel title="المستخدمون">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-start text-xs text-txt-3">
                  <th className="py-2.5 text-start font-normal">الاسم</th>
                  <th className="py-2.5 text-start font-normal">البريد</th>
                  <th className="py-2.5 text-start font-normal">الدور</th>
                  <th className="py-2.5 text-start font-normal">آخر دخول</th>
                  <th className="py-2.5 text-start font-normal">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-3 text-txt">{entry.nameAr ?? entry.name}</td>
                    <td dir="ltr" className="py-3 text-start text-txt-3">
                      {entry.email}
                    </td>
                    <td className="py-3 text-txt-3">{entry.role.nameAr}</td>
                    <td className="tnum py-3 text-txt-3">
                      {entry.lastLoginAt
                        ? entry.lastLoginAt.toLocaleString('ar-EG', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="py-3">
                      <span
                        className={
                          entry.isActive
                            ? 'rounded-full bg-ok-soft px-2.5 py-1 text-[0.7rem] text-ok'
                            : 'rounded-full bg-bad-soft px-2.5 py-1 text-[0.7rem] text-bad'
                        }
                      >
                        {entry.isActive ? 'نشط' : 'موقوف'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {can(user.role, 'products.write') && (
          <Panel title="تهيئة الأسعار والألوان والمعادلات">
            <SeedButton />
          </Panel>
        )}

        <Panel title="الأدوار والصلاحيات">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((role) => (
              <li key={role.id} className="rounded-lg border border-line p-4">
                <p className="text-sm text-txt">{role.nameAr}</p>
                <p className="tnum mt-1.5 text-xs text-txt-3">
                  {role._count.permissions} صلاحية · {role._count.users} مستخدم
                </p>
                <p dir="ltr" className="mt-2 text-start text-[0.7rem] text-txt-4">
                  {role.landingPath}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
