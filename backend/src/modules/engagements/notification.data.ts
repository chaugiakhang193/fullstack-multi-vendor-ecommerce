import { OrderStatus } from '@/common/enums';

// Dữ liệu cấu trúc cho 1 notification. FE render câu hiển thị (localized + in đậm token)
// TỪ ĐÂY thay vì backend bake sẵn câu chữ. Cột `content` (text) vẫn giữ làm fallback cho
// notification cũ (trước migration) và cho các kênh khác (email...) nếu có sau này.
// Phân biệt bằng `kind` vì `type` (NotificationType) quá thô — 2 giá trị gánh 5 loại câu.
export type NotificationData =
  | { kind: 'order_placed'; orderNumber: string; amount: number }
  | { kind: 'order_new_seller'; orderNumber: string }
  | { kind: 'suborder_cancelled_customer'; orderNumber: string }
  | { kind: 'suborder_cancelled_seller'; orderNumber: string }
  | { kind: 'suborder_status_changed'; orderNumber: string; status: OrderStatus };
