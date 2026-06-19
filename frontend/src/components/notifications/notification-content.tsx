import { type ReactNode } from "react";

import { formatVnd } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/schemaValidations/orders/orders.schema";
import type { NotificationDataType } from "@/schemaValidations/engagements/notifications.schema";

// Tô đậm 1 token quan trọng (mã đơn / số tiền / trạng thái) trong câu thông báo.
function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

// Render câu hiển thị từ data cấu trúc (localized VN + in đậm token).
// Trả null khi không có data hoặc kind lạ (chưa hỗ trợ) → caller fallback về `content`.
export function renderNotificationData(
  data: NotificationDataType | null | undefined,
): ReactNode {
  if (!data) return null;
  switch (data.kind) {
    case "order_placed":
      return (
        <>
          Đơn hàng <B>{data.orderNumber}</B> đã được đặt thành công. Tổng giá trị:{" "}
          <B>{formatVnd.format(data.amount)}</B>
        </>
      );
    case "order_new_seller":
      return (
        <>
          Bạn vừa nhận được đơn hàng mới <B>{data.orderNumber}</B>.
        </>
      );
    case "suborder_cancelled_customer":
      return (
        <>
          Một shop trong đơn <B>{data.orderNumber}</B> đã được hủy theo yêu cầu của bạn.
        </>
      );
    case "suborder_cancelled_seller":
      return (
        <>
          Khách đã hủy 1 đơn hàng con thuộc đơn <B>{data.orderNumber}</B>.
        </>
      );
    case "suborder_status_changed":
      return (
        <>
          Một shop trong đơn <B>{data.orderNumber}</B> đã chuyển sang trạng thái{" "}
          <B>{ORDER_STATUS_LABELS[data.status]}</B>.
        </>
      );
    case "review_new_seller":
      return (
        <>
          Sản phẩm <B>{data.productName}</B> vừa nhận được một đánh giá mới.
        </>
      );
    case "review_replied":
      return (
        <>
          Cửa hàng đã phản hồi đánh giá của bạn về sản phẩm <B>{data.productName}</B>.
        </>
      );
    default:
      return null;
  }
}
