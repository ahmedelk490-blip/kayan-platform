/**
 * @erp/domain — business rules, framework-free.
 *
 * Constitution Article 1: this package must never import Next.js, Prisma, or
 * any I/O library. It is the layer that stays true when ADR-001's NestJS API
 * is built — both apps will import the same rules rather than reimplementing
 * them.
 */

export * from './rbac';
export * from './password';
