import { QUOTATION_STATUS_AR, ORDER_STATUS_AR } from '@erp/domain';

/** Colour carries emphasis; the Arabic label carries the meaning. */
const TONE: Record<string, string> = {
  DRAFT: 'bg-card-2 text-txt-3',
  SENT: 'bg-brand-soft text-brand',
  ACCEPTED: 'bg-ok-soft text-ok',
  CONFIRMED: 'bg-ok-soft text-ok',
  IN_PRODUCTION: 'bg-warn-soft text-warn',
  READY: 'bg-brand-soft text-brand',
  DELIVERED: 'bg-ok-soft text-ok',
  COMPLETED: 'bg-ok-soft text-ok',
  REJECTED: 'bg-bad-soft text-bad',
  CANCELLED: 'bg-bad-soft text-bad',
  EXPIRED: 'bg-card-2 text-txt-4',
  CONVERTED: 'bg-brand-soft text-brand',
};

export function StatusBadge({ status, kind }: { status: string; kind: 'quotation' | 'order' }) {
  const label =
    kind === 'quotation'
      ? (QUOTATION_STATUS_AR as Record<string, string>)[status]
      : (ORDER_STATUS_AR as Record<string, string>)[status];

  return (
    <span className={`rounded-full px-2.5 py-1 text-[0.7rem] ${TONE[status] ?? 'bg-card-2 text-txt-3'}`}>
      {label ?? status}
    </span>
  );
}
