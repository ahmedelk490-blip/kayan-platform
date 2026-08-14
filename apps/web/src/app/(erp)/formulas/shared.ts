import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Types and helpers a `'use server'` module cannot hold — it may only export
 * async functions. Same split the sales and manufacturing modules use.
 */

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/** Next formula code for a tenant: FRM-0007. */
export async function nextFormulaCode(tenantId: string): Promise<string> {
  const rows = await prisma.formula.findMany({
    where: { tenantId },
    select: { code: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.code.replace('FRM-', ''), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `FRM-${String(max + 1).padStart(4, '0')}`;
}
