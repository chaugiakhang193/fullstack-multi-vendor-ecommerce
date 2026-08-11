import { cn } from '@/lib/utils';
import type { PaymentStatusType } from '@/schemaValidations/payments/payments.schema';

const MAP: Record<PaymentStatusType, { label: string; cls: string }> = {
  pending: {
    label: 'Chưa thanh toán',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  completed: {
    label: 'Đã thanh toán',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  },
  failed: {
    label: 'Thanh toán thất bại',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  },
  refunded: {
    label: 'Đã hoàn tiền',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
};

export function PaymentStatusBadge({
  status,
  className,
}: {
  status: PaymentStatusType;
  className?: string;
}) {
  const item = MAP[status];
  if (!item) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        item.cls,
        className,
      )}
    >
      {item.label}
    </span>
  );
}
