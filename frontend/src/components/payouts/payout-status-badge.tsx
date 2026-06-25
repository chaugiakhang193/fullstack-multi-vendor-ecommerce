import { cn } from '@/lib/utils';
import { PayoutStatus } from '@/constants/enum.generated';

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  [PayoutStatus.PENDING]: 'Chờ xử lý',
  [PayoutStatus.PROCESSING]: 'Đang xử lý',
  [PayoutStatus.COMPLETED]: 'Đã chuyển khoản',
  [PayoutStatus.REJECTED]: 'Từ chối',
  [PayoutStatus.FAILED]: 'Thất bại',
};

const STATUS_STYLES: Record<PayoutStatus, string> = {
  [PayoutStatus.PENDING]:
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  [PayoutStatus.PROCESSING]:
    'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  [PayoutStatus.COMPLETED]:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  [PayoutStatus.REJECTED]:
    'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  [PayoutStatus.FAILED]:
    'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export function PayoutStatusBadge({
  status,
  className,
}: {
  status: PayoutStatus;
  className?: string;
}) {
  const statusStyle = STATUS_STYLES[status];
  const label = PAYOUT_STATUS_LABELS[status];
  const defaultStyle =
    'inline-block px-3 py-1 rounded-full text-xs font-semibold';
  const badgeClassName = cn(defaultStyle, statusStyle, className);
  return <span className={badgeClassName}>{label}</span>;
}
