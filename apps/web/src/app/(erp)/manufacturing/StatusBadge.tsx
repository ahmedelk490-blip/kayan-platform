import {
  PRODUCTION_STATUS_AR,
  PRIORITY_AR,
  WORK_ORDER_STATUS_AR,
} from '@erp/domain';

/** Colour carries emphasis; the Arabic label carries the meaning. */
const TONE: Record<string, string> = {
  DRAFT: 'bg-card-2 text-txt-3',
  CONFIRMED: 'bg-brand-soft text-brand',
  IN_PROGRESS: 'bg-warn-soft text-warn',
  QC: 'bg-brand-soft text-brand',
  COMPLETED: 'bg-ok-soft text-ok',
  CANCELLED: 'bg-bad-soft text-bad',
  PENDING: 'bg-card-2 text-txt-3',
  DONE: 'bg-ok-soft text-ok',
  SKIPPED: 'bg-card-2 text-txt-4',
};

export function ProductionBadge({ status }: { status: string }) {
  const label = (PRODUCTION_STATUS_AR as Record<string, string>)[status] ?? status;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${TONE[status] ?? 'bg-card-2 text-txt-3'}`}>
      {label}
    </span>
  );
}

export function WorkOrderBadge({ status }: { status: string }) {
  const label = (WORK_ORDER_STATUS_AR as Record<string, string>)[status] ?? status;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${TONE[status] ?? 'bg-card-2 text-txt-3'}`}>
      {label}
    </span>
  );
}

/**
 * Priority is deliberately quieter than status — only URGENT and HIGH are
 * coloured, so a floor supervisor scanning the list sees the few orders that
 * actually need attention rather than a wall of colour.
 */
const PRIORITY_TONE: Record<string, string> = {
  URGENT: 'bg-bad-soft text-bad',
  HIGH: 'bg-warn-soft text-warn',
  NORMAL: 'text-txt-3',
  LOW: 'text-txt-4',
};

export function PriorityBadge({ priority }: { priority: string }) {
  const label = (PRIORITY_AR as Record<string, string>)[priority] ?? priority;
  const coloured = priority === 'URGENT' || priority === 'HIGH';
  return (
    <span
      className={`text-[0.7rem] ${coloured ? 'rounded-full px-2.5 py-1' : ''} ${PRIORITY_TONE[priority] ?? 'text-txt-3'}`}
    >
      {label}
    </span>
  );
}
