import 'server-only';

import { redirect } from 'next/navigation';
import type { PermissionKey } from '@erp/domain';
import { can, landingPathFor } from '@erp/domain';
import { getSessionUser, type SessionUser } from './auth';

/**
 * Route guards — deny by default (NFR-12).
 *
 * Every protected page calls one of these as its first statement. A page that
 * forgets to has no session, so it cannot render user data by accident.
 */

/** Requires a signed-in user. Redirects to login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Requires a specific permission.
 *
 * A signed-in user lacking the permission is sent to their own landing page
 * rather than to login — bouncing them to a sign-in form they have already
 * satisfied is the classic confusing redirect loop.
 */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    redirect(landingPathFor(user.role));
  }
  return user;
}

/** For pages that should not be seen while signed in, e.g. /login. */
export async function redirectIfAuthenticated(): Promise<void> {
  const user = await getSessionUser();
  if (user) redirect(landingPathFor(user.role));
}
