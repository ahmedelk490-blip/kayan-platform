'use server';

import { revalidatePath } from 'next/cache';
import { ROLES, ROLE_KEYS, PERMISSIONS, ROLE_PERMISSIONS, type RoleKey, type PermissionKey } from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { authDb } from '@/lib/prisma';
import { audit } from '@/lib/audit';

export interface RoleSyncState {
  ok?: string;
  error?: string;
}

/**
 * مزامنة الأدوار والصلاحيات من الكود إلى قاعدة البيانات.
 *
 * الصلاحية الفعلية تُقرأ من الكود (ROLE_PERMISSIONS)، لكن إنشاء مستخدمٍ يبحث
 * عن صفّ الدور في القاعدة — فدورٌ يُضاف في الكود وحده يجعل إنشاء حسابٍ به
 * يفشل بـ«الدور غير موجود في قاعدة البيانات». وهذه تُنشئ الناقص.
 *
 * آمنة للتكرار: تُحدِّث الاسم ومسار الدخول ولا تُنشئ مكرَّراً، ولا تحذف دوراً
 * غير معروفٍ للكود — قد تكون عليه حسابات قائمة، وحذفه يتيمها.
 */
export async function syncRoles(): Promise<RoleSyncState> {
  const user = await requirePermission('admin.view');

  try {
    let rolesAdded = 0;
    let permsAdded = 0;

    // الصلاحيات أولاً: جدول الأدوار يشير إليها، ولوحة الصلاحيات تعرضها.
    for (const [key, meta] of Object.entries(PERMISSIONS) as [PermissionKey, { nameAr: string; group: string }][]) {
      const existing = await authDb.permission.findUnique({ where: { key }, select: { id: true } });
      if (existing) {
        await authDb.permission.update({ where: { key }, data: { nameAr: meta.nameAr, group: meta.group } });
      } else {
        await authDb.permission.create({ data: { key, nameAr: meta.nameAr, group: meta.group } });
        permsAdded += 1;
      }
    }

    for (const key of ROLE_KEYS) {
      const def = ROLES[key as RoleKey];
      const existing = await authDb.role.findUnique({ where: { key }, select: { id: true } });
      const role = existing
        ? await authDb.role.update({
            where: { key },
            data: { name: def.name, nameAr: def.nameAr, landingPath: def.landingPath },
            select: { id: true },
          })
        : await authDb.role.create({
            data: { key, name: def.name, nameAr: def.nameAr, landingPath: def.landingPath },
            select: { id: true },
          });
      if (!existing) rolesAdded += 1;

      // مصفوفة الصلاحيات في القاعدة تُعرَض في شاشة الإدارة، فتُبقى مطابقةً
      // للكود — وإلا عرضت الشاشة ما لا يُطبَّق فعلاً.
      const wanted = ROLE_PERMISSIONS[key as RoleKey] ?? [];
      const rows = await authDb.permission.findMany({
        where: { key: { in: wanted as string[] } },
        select: { id: true },
      });
      await authDb.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (rows.length > 0) {
        await authDb.rolePermission.createMany({
          data: rows.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'roles.sync',
      entityType: 'Role',
      entityId: 'all',
      detail: `${rolesAdded} دور جديد · ${permsAdded} صلاحية جديدة`,
    });

    revalidatePath('/admin');
    revalidatePath('/users');

    return {
      ok:
        rolesAdded === 0 && permsAdded === 0
          ? 'الأدوار والصلاحيات محدَّثة بالفعل — لا جديد.'
          : `تمت المزامنة: ${rolesAdded} دور جديد و${permsAdded} صلاحية جديدة. صارت متاحة عند إنشاء الحسابات.`,
    };
  } catch (e) {
    return { error: `تعذّرت المزامنة: ${e instanceof Error ? e.message : 'خطأ غير معروف'}` };
  }
}
