import 'server-only';

import { headers } from 'next/headers';
import { prisma } from './prisma';

/**
 * Write an audit row. Append-only (DI-1).
 *
 * Called from every mutating server action, so a record's history survives
 * even after the record itself is soft-deleted.
 */
export async function audit(input: {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
}) {
  const headerList = await headers();
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      detail: input.detail ?? null,
      ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    },
  });
}

/** Turn a Zod error into a field -> message map for the form. */
export function fieldErrors(error: {
  issues: { path: (string | number)[]; message: string }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** Next sequential code for a tenant-scoped entity, e.g. CUS-0007. */
export async function nextCode(
  prefix: string,
  existing: { code: string }[],
): Promise<string> {
  const max = existing.reduce((acc, row) => {
    const n = Number.parseInt(row.code.replace(`${prefix}-`, ''), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
