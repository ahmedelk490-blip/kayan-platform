/**
 * Manufacturing status rules and priorities.
 *
 * Pure data and pure functions — no database, no framework (Article 1), so
 * the workflow can be reasoned about and tested without standing anything up.
 */

export const PRODUCTION_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'QC',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const PRODUCTION_STATUS_AR: Record<ProductionStatus, string> = {
  DRAFT: 'مسودة',
  CONFIRMED: 'مؤكَّد',
  IN_PROGRESS: 'قيد التنفيذ',
  QC: 'فحص الجودة',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

/**
 * Allowed transitions.
 *
 * COMPLETED is reachable only through QC — a finished order that never
 * passed inspection is exactly the thing this workflow exists to prevent.
 * COMPLETED and CANCELLED are both terminal.
 */
export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['QC', 'CANCELLED'],
  QC: ['COMPLETED', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_AR: Record<Priority, string> = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

/** Sort weight — URGENT first in a planning list. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export const WORK_ORDER_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_STATUS_AR: Record<WorkOrderStatus, string> = {
  PENDING: 'في الانتظار',
  IN_PROGRESS: 'قيد التنفيذ',
  DONE: 'منتهي',
  SKIPPED: 'متخطّى',
};

/** Statuses in which the order is live on the floor. */
export const ACTIVE_PRODUCTION_STATUSES: ProductionStatus[] = [
  'CONFIRMED',
  'IN_PROGRESS',
  'QC',
];

export function isProductionStatus(v: string): v is ProductionStatus {
  return (PRODUCTION_STATUSES as readonly string[]).includes(v);
}

export function isPriority(v: string): v is Priority {
  return (PRIORITIES as readonly string[]).includes(v);
}

export function isWorkOrderStatus(v: string): v is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as readonly string[]).includes(v);
}
