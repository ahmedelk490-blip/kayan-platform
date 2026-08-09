'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { isLocked, lockUntil, shouldLock, landingPathFor, isRoleKey } from '@erp/domain';
// Login runs before any tenant is known — finding out which tenant this
// person belongs to is the whole point of it — so these three queries use the
// single BYPASSRLS connection. Everything after login goes through `prisma`,
// which is bound to the tenant by the guard.
import { authDb } from '@/lib/prisma';
import { createSession, verifyPassword, destroySession } from '@/lib/auth';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صحيح.'),
  password: z.string().min(1, 'كلمة المرور مطلوبة.'),
});

export interface LoginState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Sign in.
 *
 * Two rules that matter more than they look:
 *
 * 1. A wrong email and a wrong password return the SAME message. Saying
 *    "no such user" turns the form into an account-enumeration oracle.
 * 2. A hash is verified even when the user does not exist, against a dummy
 *    digest. Without it, a missing user returns in ~1ms and a real one in
 *    ~50ms, and that timing difference leaks which emails are registered.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Gk9C7bH0m5eZ0lFrLpX1sJx7VYd0kQnJ3vJ8yQ2mZ4A';

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { email, password } = parsed.data;
  const generic = { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' };

  const user = await authDb.user.findUnique({
    where: { email },
    include: { role: true },
  });

  if (!user) {
    await verifyPassword(DUMMY_HASH, password); // equalise timing
    return generic;
  }

  const now = new Date();

  if (isLocked(user.lockedUntil, now)) {
    return { error: 'تم إيقاف الحساب مؤقتاً بسبب محاولات دخول متكررة. حاول بعد قليل.' };
  }

  if (!user.isActive) {
    await verifyPassword(DUMMY_HASH, password);
    return generic;
  }

  const ok = await verifyPassword(user.passwordHash, password);

  if (!ok) {
    await authDb.user.update({
      where: { id: user.id },
      data: shouldLock(user.failedLogins)
        ? { failedLogins: 0, lockedUntil: lockUntil(now) }
        : { failedLogins: { increment: 1 } },
    });

    const headerList = await headers();
    await authDb.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'auth.login.failed',
        entityType: 'User',
        entityId: user.id,
        ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      },
    });

    return generic;
  }

  if (!isRoleKey(user.role.key)) {
    return { error: 'دور المستخدم غير معروف. تواصل مع مدير النظام.' };
  }

  await authDb.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now },
  });

  await createSession(user.id);

  await authDb.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login.success',
      entityType: 'User',
      entityId: user.id,
    },
  });

  // Role decides the destination — the whole point of the single login page.
  redirect(landingPathFor(user.role.key));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}
