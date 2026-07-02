import { cn } from '@/lib/utils';
import {
  type ReturnStatusType,
  RETURN_STATUS_LABELS,
} from '@/schemaValidations/returns/returns.schema';

const STATUS_STYLES: Record<ReturnStatusType, string> = {
  requested:
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  received:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  cancelled: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export function ReturnStatusBadge({
  status,
  className,
}: {
  status: ReturnStatusType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block px-3 py-1 rounded-full text-xs font-bold',
        STATUS_STYLES[status],
        className,
      )}
    >
      {RETURN_STATUS_LABELS[status]}
    </span>
  );
}
