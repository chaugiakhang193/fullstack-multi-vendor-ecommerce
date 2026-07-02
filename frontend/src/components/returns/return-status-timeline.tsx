import { cn } from '@/lib/utils';
import { ReturnStatus } from '@/constants/enum';
import { type ReturnStatusType } from '@/schemaValidations/returns/returns.schema';

// Timeline tuyến tính: requested → approved → received.
// 'rejected'/'cancelled' KHÔNG nằm trên timeline → banner riêng.
const STEPS = [
  { key: ReturnStatus.REQUESTED, label: 'Đã gửi yêu cầu' },
  { key: ReturnStatus.APPROVED, label: 'Shop duyệt' },
  { key: ReturnStatus.RECEIVED, label: 'Shop nhận hàng' },
] as const;

export function ReturnStatusTimeline({
  status,
  className,
}: {
  status: ReturnStatusType;
  className?: string;
}) {
  if (status === ReturnStatus.REJECTED || status === ReturnStatus.CANCELLED) {
    const text =
      status === ReturnStatus.REJECTED
        ? 'Yêu cầu trả hàng đã bị shop từ chối'
        : 'Bạn đã hủy yêu cầu trả hàng này';
    return (
      <div
        className={cn(
          'rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-sm font-medium text-rose-600',
          className,
        )}
      >
        {text}
      </div>
    );
  }

  const currentIndex = Math.max(
    STEPS.findIndex((s) => s.key === status),
    0,
  );

  return (
    <div className={cn('flex items-center w-full', className)}>
      {STEPS.map((step, index) => {
        const isDoneOrActive = index <= currentIndex;
        const isLast = index === STEPS.length - 1;
        return (
          <div
            key={step.key}
            className="flex items-center flex-1 last:flex-none"
          >
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-bold transition-colors',
                  isDoneOrActive
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-muted-foreground/30 text-muted-foreground',
                )}
              >
                {index + 1}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  isDoneOrActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'h-0.5 flex-1 mx-1',
                  index < currentIndex
                    ? 'bg-violet-600'
                    : 'bg-muted-foreground/20',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
