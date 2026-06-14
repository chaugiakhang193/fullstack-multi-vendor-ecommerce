import { Check, Truck, PackageCheck, X, RotateCcw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type OrderStatusType,
  ORDER_STATUS_LABELS,
  SUB_ORDER_STATE_MACHINE,
} from "@/schemaValidations/orders/orders.schema";

// Badge màu theo trạng thái sub-order.
const STATUS_STYLES: Record<OrderStatusType, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  processing: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  shipping: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  returned: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatusType;
  className?: string;
}) {
  const statusStyle = STATUS_STYLES[status];
  const label = ORDER_STATUS_LABELS[status];
  const badgeClassName = cn(
    "inline-block px-3 py-1 rounded-full text-xs font-bold",
    statusStyle,
    className,
  );
  return <span className={badgeClassName}>{label}</span>;
}

export interface TransitionAction {
  to: OrderStatusType;
  label: string;
  icon: LucideIcon;
  tone: "primary" | "danger";
}

// Nhãn/biểu tượng cho hành động "chuyển sang trạng thái X".
const ACTION_META: Record<
  OrderStatusType,
  { label: string; icon: LucideIcon; tone: "primary" | "danger" }
> = {
  pending: { label: "Chờ xác nhận", icon: Check, tone: "primary" },
  processing: { label: "Xác nhận đơn", icon: Check, tone: "primary" },
  shipping: { label: "Giao cho ĐVVC", icon: Truck, tone: "primary" },
  delivered: { label: "Xác nhận đã giao", icon: PackageCheck, tone: "primary" },
  cancelled: { label: "Hủy đơn", icon: X, tone: "danger" },
  returned: { label: "Trả hàng", icon: RotateCcw, tone: "danger" },
};

// Danh sách hành động hợp lệ từ trạng thái hiện tại (theo state machine).
export function getTransitions(status: OrderStatusType): TransitionAction[] {
  const allowed = SUB_ORDER_STATE_MACHINE[status] ?? [];
  return allowed.map((to) => {
    const meta = ACTION_META[to];
    return { to, label: meta.label, icon: meta.icon, tone: meta.tone };
  });
}
