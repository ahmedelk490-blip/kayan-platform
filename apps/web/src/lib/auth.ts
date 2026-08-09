import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { hash, verify } from '@node-rs/argon2';
import type { RoleKey } from '@erp/domain';
import { isRoleKey } from '@erp/domain';
import { authDb } from './prisma';

/**
 * Authentication — infrastructure.
 *
 * The *rules* (password policy, lockout thresholds, the permission matrix)
 * live in @erp/domain. This file only does I/O: hashing, cookies, the session
 * table. Article 1.
 *
 * ── Why this file alone uses authDb (Phase 7) ───────────────
 *
 * Every query here runs before anyone knows which tenant the caller belongs
 * to — that is what logging in is for. RLS would deny them all. `authDb`
 * connects as the single BYPASSRLS role, and nothing outside this file may
 * import it, so the exception is one greppable line rather than a privilege
 * anybody can reach for.
 */

const SESSION_COOKIE = 'kayan_session';
const SESSION_DAYS = 7;

/**
 * Argon2id — the parameters matter as much as the algorithm.
 * 19 MiB / 2 passes / 1 lane is the OWASP-recommended baseline.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password);
  } catch {
    // A malformed digest must read as "wrong password", never as a crash.
    return false;
  }
}

/**
 * Sessions are opaque random tokens; only their SHA-256 is stored.
 *
 * A leaked database therefore does not hand over live sessions. The token
 * itself exists only in the user's cookie.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  nameAr: string | null;
  tenantId: string;
  role: RoleKey;
  roleNameAr: string;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const headerList = await headers();

  await authDb.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
      ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: headerList.get('user-agent')?.slice(0, 255) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });

  return token;
}

/** Returns the signed-in user, or null. Never throws. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await authDb.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } } },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.user.isActive) return null;
  if (!isRoleKey(session.user.role.key)) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    nameAr: session.user.nameAr,
    tenantId: session.user.tenantId,
    role: session.user.role.key,
    roleNameAr: session.user.role.nameAr,
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    // Revoke rather than delete — the session row is audit evidence.
    await authDb.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Revoke every session for a user (FR-IAM-008). */
export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await authDb.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Constant-time compare, for anywhere a secret is checked directly.
 * Kept here so no call site is tempted to use `===`.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export { SESSION_COOKIE };
