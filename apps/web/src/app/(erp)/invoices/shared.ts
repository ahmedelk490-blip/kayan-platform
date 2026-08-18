import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Allocate the next invoice number, gaplessly.
 *
 * MUST be called inside a transaction, and is — `receiveNumber` takes the
 * transaction client rather than the global one, so the lock it takes is
 * released by the same commit that writes the invoice.
 *
 * `SELECT ... FOR UPDATE` is the whole mechanism. Two clerks pressing Issue
 * in the same second serialise on this row: the second waits, reads the
 * first's number, and takes the next. Deriving the number from `MAX(number)`
 * instead — the approach every other document here uses — would hand both of
 * them the same one, and a duplicate invoice number is a far worse problem
 * than a slow button.
 *
 * If the transaction rolls back, the increment rolls back with it, so a
 * failed issue returns the number rather than burning it. That is why this is
 * called at ISSUE and never at create: a deleted draft must leave no hole.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();

  // Upsert-then-lock: the row must exist before it can be locked, and the
  // first invoice of a year would otherwise find nothing to lock.
  //
  // MySQL spells the upsert differently from PostgreSQL, and the difference
  // is not only syntax. `ON DUPLICATE KEY UPDATE id = id` rather than
  // `INSERT IGNORE`: IGNORE downgrades every error on the statement to a
  // warning — a broken foreign key, a truncated value — and this row decides
  // invoice numbers. Only the duplicate should be tolerated here.
  //
  // Identifiers are backquoted; MySQL reads "double quotes" as a string
  // literal unless ANSI_QUOTES is set, and the hosting's mode is not ours to
  // assume.
  await tx.$executeRaw`
    INSERT INTO \`DocumentSequence\` (\`id\`, \`tenantId\`, \`kind\`, \`year\`, \`lastNumber\`, \`updatedAt\`)
    VALUES (${`seq_${tenantId}_INVOICE_${year}`}, ${tenantId}, 'INVOICE', ${year}, 0, NOW())
    ON DUPLICATE KEY UPDATE \`id\` = \`id\``;

  // FOR UPDATE carries across unchanged: InnoDB locks the row for the rest
  // of the transaction, so the second caller waits here rather than reading
  // the same number.
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    SELECT \`lastNumber\` FROM \`DocumentSequence\`
     WHERE \`tenantId\` = ${tenantId} AND \`kind\` = 'INVOICE' AND \`year\` = ${year}
     FOR UPDATE`;

  const next = (rows[0]?.lastNumber ?? 0) + 1;

  await tx.$executeRaw`
    UPDATE \`DocumentSequence\` SET \`lastNumber\` = ${next}, \`updatedAt\` = NOW()
     WHERE \`tenantId\` = ${tenantId} AND \`kind\` = 'INVOICE' AND \`year\` = ${year}`;

  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

/** Payments are not fiscal documents, so the cheaper derivation is fine. */
export async function nextPaymentNumber(tenantId: string): Promise<string> {
  const stem = `PAY-${new Date().getFullYear()}-`;
  const rows = await prisma.payment.findMany({
    where: { tenantId, number: { startsWith: stem } },
    select: { number: true },
  });
  const max = rows.reduce((acc, r) => {
    const n = Number.parseInt(r.number.slice(stem.length), 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `${stem}${String(max + 1).padStart(4, '0')}`;
}

/** The tenant's invoicing settings, with the documented defaults. */
export async function invoiceSettings(tenantId: string) {
  const company = await prisma.company.findFirst({ where: { tenantId } });
  return {
    prefix: company?.invoicePrefix ?? 'INV',
    taxRate: company?.defaultTaxRate ?? 0,
    termDays: company?.paymentTermDays ?? 0,
    currency: company?.currency ?? 'EGP',
    taxNumber: company?.taxNumber ?? null,
  };
}
