/**
 * @erp/domain — business rules, framework-free.
 *
 * Constitution Article 1: this package must never import Next.js, Prisma, or
 * any I/O library. It is the layer that stays true when ADR-001's NestJS API
 * is built — both apps will import the same rules rather than reimplementing
 * them.
 */

export * from './rbac.ts';
export * from './password.ts';
export * from './money.ts';
export * from './sales.ts';
export * from './production.ts';
export * from './formula.ts';
export * from './operations.ts';
export * from './purchasing.ts';
export * from './invoicing.ts';
export * from './reporting.ts';
export * from './pricing.ts';
export * from './consumption.ts';
export * from './hr.ts';
