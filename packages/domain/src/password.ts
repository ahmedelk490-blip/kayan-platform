/**
 * Password policy — pure rules (FR-IAM-001).
 *
 * The *policy* lives in the domain; the *hashing* does not, because hashing
 * is infrastructure. Keeping them apart means the rules can be tested with no
 * native module loaded.
 */

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
};

export interface PolicyViolation {
  code: string;
  messageAr: string;
}

export function validatePassword(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (password.length < policy.minLength) {
    violations.push({
      code: 'too_short',
      messageAr: `كلمة المرور يجب أن تكون ${policy.minLength} أحرف على الأقل.`,
    });
  }
  if (policy.requireUpper && !/[A-Z]/.test(password)) {
    violations.push({ code: 'no_upper', messageAr: 'يجب أن تحتوي على حرف كبير واحد على الأقل.' });
  }
  if (policy.requireLower && !/[a-z]/.test(password)) {
    violations.push({ code: 'no_lower', messageAr: 'يجب أن تحتوي على حرف صغير واحد على الأقل.' });
  }
  if (policy.requireDigit && !/[0-9]/.test(password)) {
    violations.push({ code: 'no_digit', messageAr: 'يجب أن تحتوي على رقم واحد على الأقل.' });
  }

  return violations;
}

/** Account lockout after repeated failures (FR-IAM-012). */
export const LOCKOUT = {
  maxFailedAttempts: 5,
  lockMinutes: 15,
} as const;

export function shouldLock(failedLogins: number): boolean {
  return failedLogins + 1 >= LOCKOUT.maxFailedAttempts;
}

export function lockUntil(now: Date): Date {
  return new Date(now.getTime() + LOCKOUT.lockMinutes * 60_000);
}

export function isLocked(lockedUntil: Date | null | undefined, now: Date): boolean {
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > now.getTime();
}
