'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hash } from '@node-rs/argon2';
import {
  isRoleKey,
  ROLES,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  toPermissionKeys,
  userCan,
  type RoleKey,
  type PermissionKey,
} from '@erp/domain';
import { requirePermission } from '@/lib/guard';
import { authDb } from '@/lib/prisma';
import { audit, fieldErrors } from '@/lib/audit';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * إدارة حسابات الفريق.
 *
 * نفس معاملات Argon2id التي تستخدمها البذرة وتسجيل الدخول — حساب يُفتح من
 * هنا لا يختلف في شيء عن حساب أُنشئ هناك.
 *
 * ── لماذا authDb ──────────────────────────────────────────
 *
 * جداول الهوية يقرأها ويكتبها الاتصال الذي يحمل BYPASSRLS، لأن المستخدم قد
 * يُبحث عنه قبل معرفة مستأجره. الاستخدام هنا محصور في الحسابات ولا يمتد
 * لأي كيان آخر.
 */

/**
 * الأدوار التي يملك المدير منحها.
 *
 * ADMIN مستثنى عمداً: مدير يصنع مدير نظام يمنح نفسه كل صلاحية، وهذه تصعيد
 * صلاحيات لا تفويض. الحد هنا في الخادم لا في الواجهة — إخفاء خيار من قائمة
 * ليس منعاً.
 */
const GRANTABLE = ['MANAGER', 'SALES', 'CASHIER', 'CUSTOMER'] as const;

const UserSchema = z.object({
  email: z.string().trim().toLowerCase().email('بريد إلكتروني غير صحيح.'),
  nameAr: z.string().trim().min(2, 'الاسم مطلوب.').max(120),
  roleKey: z
    .string()
    .refine(isRoleKey, 'دور غير معروف.')
    .refine((r) => (GRANTABLE as readonly string[]).includes(r), 'لا يمكنك منح هذا الدور.'),
  // ثمانية أحرف حدّ أدنى. ليست حماية كافية وحدها، لكنها تمنع الحسابات
  // بكلمة من ثلاثة أحرف — وهي الحالة التي تحدث فعلاً حين يستعجل أحد.
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل.').max(200),
});

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('users.manage');

  const parsed = UserSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    nameAr: String(formData.get('nameAr') ?? ''),
    roleKey: String(formData.get('roleKey') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const role = await authDb.role.findUnique({ where: { key: parsed.data.roleKey } });
  if (!role) return { error: 'الدور غير موجود في قاعدة البيانات.' };

  const existing = await authDb.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { fieldErrors: { email: 'هذا البريد مستخدم بالفعل.' } };

  const passwordHash = await hash(parsed.data.password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const created = await authDb.user.create({
    data: {
      tenantId: actor.tenantId,
      email: parsed.data.email,
      nameAr: parsed.data.nameAr,
      name: parsed.data.nameAr,
      passwordHash,
      roleId: role.id,
      isActive: true,
    },
    select: { id: true, email: true },
  });

  // كلمة المرور لا تدخل السجل. السجل يقول من أنشأ ماذا ومتى، لا بأي كلمة.
  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: 'user.create',
    entityType: 'User',
    entityId: created.id,
    detail: `${created.email} · ${ROLES[parsed.data.roleKey as keyof typeof ROLES].nameAr}`,
  });

  revalidatePath('/users');
  return { ok: `أُنشئ حساب ${created.email}. سلّم كلمة المرور للموظف خارج النظام.` };
}

const PasswordSchema = z.object({
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل.').max(200),
});

export async function resetPassword(
  userId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission('users.manage');

  const target = await authDb.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
    include: { role: true },
  });
  if (!target) return { error: 'المستخدم غير موجود.' };
  if (target.role.key === 'ADMIN') return { error: 'لا يمكنك تغيير كلمة مرور مدير النظام.' };

  const parsed = PasswordSchema.safeParse({ password: String(formData.get('password') ?? '') });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const passwordHash = await hash(parsed.data.password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await authDb.user.update({
    where: { id: userId },
    // كلمة جديدة تفتح القفل وتصفّر المحاولات الفاشلة: ترك الحساب مقفلاً
    // بسبب كلمة لم تعد قائمة هو منع بلا سبب.
    data: { passwordHash, failedLogins: 0, lockedUntil: null },
  });

  // كل الجلسات القائمة تنتهي. تغيير كلمة المرور بلا إنهاء الجلسات يترك من
  // كان داخلاً داخلاً — وهو بالضبط ما يُغيَّر من أجله عند تسريبها.
  await authDb.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: 'user.reset-password',
    entityType: 'User',
    entityId: userId,
    detail: `${target.email} · أُنهيت جلساته`,
  });

  revalidatePath('/users');
  return { ok: 'غُيّرت كلمة المرور وأُنهيت كل جلسات هذا المستخدم.' };
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requirePermission('users.manage');

  const target = await authDb.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
    include: { role: true },
  });
  if (!target || target.role.key === 'ADMIN') return;
  // لا يُعطّل المرء حسابه فيقفل على نفسه الباب.
  if (target.id === actor.id) return;

  await authDb.user.update({ where: { id: userId }, data: { isActive: active } });
  if (!active) {
    await authDb.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: active ? 'user.activate' : 'user.deactivate',
    entityType: 'User',
    entityId: userId,
    detail: target.email,
  });

  revalidatePath('/users');
}

/** الأدوار المتاحة للمنح، بأسمائها العربية. */
export async function grantableRoles() {
  return GRANTABLE.map((key) => ({ value: key, label: ROLES[key].nameAr }));
}

// ── تحكّم صلاحيات لكل موظف ───────────────────────────────────

/** المفاتيح القابلة للتعديل من الشاشة — «إدارة المستخدمين» مستثناة عمداً
 *  فلا يُصنع مديرُ حسابات جزئيّ يعدّل غيره (تصعيد صلاحيات). ملف «use server»
 *  لا يصدّر إلا دوالّ async، فتبقى هذه محليّة. */
const EDITABLE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p !== 'users.manage');

/**
 * ضبط صلاحيات موظف فوق دوره.
 *
 * المدير يؤشّر ما يراه الموظف؛ نحوّل ذلك إلى دلتا عن الدور: ما زيد يُخزَّن
 * ممنوحاً، وما نُزع يُخزَّن مسحوباً. حواجز ضد التصعيد:
 *   - لا يُعدَّل حساب مدير النظام (ADMIN) ولا حساب المستخدم نفسه.
 *   - لا يَمنح المدير صلاحية لا يملكها هو (لا يُعطي ما ليس له).
 *   - «إدارة المستخدمين» غير قابلة للمنح إطلاقاً من هنا.
 */
export async function setUserPermissions(userId: string, formData: FormData): Promise<void> {
  const actor = await requirePermission('users.manage');

  const target = await authDb.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
    include: { role: true },
  });
  if (!target) return;
  if (target.role.key === 'ADMIN') return; // محمي
  if (target.id === actor.id) return; // لا يعدّل نفسه

  const roleKey = isRoleKey(target.role.key) ? (target.role.key as RoleKey) : undefined;
  const rolePerms = new Set<PermissionKey>(roleKey ? ROLE_PERMISSIONS[roleKey] : []);

  // ما أشّره المدير (مقصوراً على المفاتيح القابلة للتعديل).
  const editable = new Set<PermissionKey>(EDITABLE_PERMISSIONS);
  const chosen = new Set<PermissionKey>(
    toPermissionKeys(formData.getAll('perm')).filter((p) => editable.has(p)),
  );

  // المسحوب: من صلاحيات الدور ما لم يُؤشَّر (السحب لا يُصعّد، فمسموح دائماً).
  const deny = [...rolePerms].filter((p) => editable.has(p) && !chosen.has(p));

  // الممنوح: ما أُشّر وليس في الدور — بشرط أن يملكه المدير نفسه.
  const grant = [...chosen].filter(
    (p) => !rolePerms.has(p) && userCan(actor.role, actor.overrides, p),
  );

  await authDb.user.update({
    where: { id: target.id },
    data: {
      grantedPermissions: grant.length ? JSON.stringify(grant) : null,
      deniedPermissions: deny.length ? JSON.stringify(deny) : null,
    },
  });

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: 'user.permissions',
    entityType: 'User',
    entityId: target.id,
    detail: `${target.email} · +${grant.length} / −${deny.length}`,
  });

  revalidatePath('/users');
}
