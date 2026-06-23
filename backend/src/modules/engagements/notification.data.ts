import { OrderStatus, PayoutStatus } from '@/common/enums';

// Dữ liệu cấu trúc cho 1 notification. FE render câu hiển thị (localized + in đậm token)
// TỪ ĐÂY thay vì backend bake sẵn câu chữ. Cột `content` (text) vẫn giữ làm fallback cho
// notification cũ (trước migration) và cho các kênh khác (email...) nếu có sau này.
// Phân biệt bằng `kind` vì `type` (NotificationType) quá thô — 2 giá trị gánh 5 loại câu.
export type NotificationData =
  | { kind: 'order_placed'; orderId: string; orderNumber: string; amount: number }
  | { kind: 'order_new_seller'; orderId: string; orderNumber: string }
  | { kind: 'suborder_cancelled_customer'; orderId: string; orderNumber: string }
  | { kind: 'suborder_cancelled_seller'; orderId: string; orderNumber: string }
  | { kind: 'suborder_status_changed'; orderId: string; orderNumber: string; status: OrderStatus }
  | { kind: 'review_new_seller'; productId: string; productName: string }
  | { kind: 'review_replied'; productId: string; productName: string }
  | { kind: 'payout_status_changed'; payoutId: string; amount: number; status: PayoutStatus; rejectReason?: string | null };
