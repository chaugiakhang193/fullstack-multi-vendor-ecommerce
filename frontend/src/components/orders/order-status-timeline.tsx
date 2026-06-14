import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { type OrderStatusType } from "@/schemaValidations/orders/orders.schema";

// Khớp OrderStatus enum backend (common/enums.ts): pending/processing/shipping/delivered/cancelled.
// 'cancelled' KHÔNG nằm trên timeline tuyến tính → xử lý banner riêng.
const STEPS = [
  { key: "pending", label: "Chờ xử lý" },
  { key: "processing", label: "Đang xử lý" },
  { key: "shipping", label: "Đang giao" },
  { key: "delivered", label: "Đã giao" },
] as const;

interface OrderStatusTimelineProps {
  status: OrderStatusType;
  className?: string;
}

export function OrderStatusTimeline({
  status,
  className,
}: OrderStatusTimelineProps) {
  // 'cancelled' và 'returned' KHÔNG nằm trên timeline tuyến tính → banner riêng,
  // tránh foundIndex = -1 khiến render nhầm về bước "Chờ xử lý".
  if (status === "cancelled" || status === "returned") {
    const bannerText =
      status === "cancelled" ? "Đơn hàng đã bị hủy" : "Đơn hàng đã được trả lại";
    return (
      <div
        className={cn(
          "rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-sm font-medium text-rose-600",
          className,
        )}
      >
        {bannerText}
      </div>
    );
  }

  const foundIndex = STEPS.findIndex((s) => s.key === status);
  const currentIndex = foundIndex === -1 ? 0 : foundIndex;

  return (
    <div className={cn("flex items-center w-full", className)}>
      {STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isActive = index === currentIndex;
        const isLast = index === STEPS.length - 1;

        return (
          <div
            key={step.key}
            className="flex items-center flex-1 last:flex-none"
          >
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                  isDone && "bg-emerald-500 border-emerald-500 text-white",
                  isActive &&
                    "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
                  !isDone &&
                    !isActive &&
                    "border-zinc-300 dark:border-zinc-700 text-zinc-400",
                )}
              >
                {isDone ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-bold">{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium whitespace-nowrap",
                  isDone || isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1 sm:mx-2 rounded transition-colors",
                  index < currentIndex
                    ? "bg-emerald-500"
                    : "bg-zinc-200 dark:bg-zinc-800",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
