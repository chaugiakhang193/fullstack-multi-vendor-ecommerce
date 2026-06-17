// Event types cho Transactional Outbox pattern
// Dùng chung giữa Orders module (writer) và Engagements Outbox Worker (reader)
export const OUTBOX_EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_STATUS_UPDATED: 'order.status_updated',
  REVIEW_CREATED: 'review.created',
  REVIEW_REPLIED: 'review.replied',
} as const;

// Payload của event 'order.created' — ghi bởi Orders (writer), đọc bởi Outbox Worker (reader).
// Cột outbox_event.payload là jsonb nên TS không tự canh được giữa 2 module;
// cả writer lẫn reader phải dùng chung interface này để đổi/thiếu field là FAIL COMPILE,
// thay vì fail im lặng lúc runtime (worker đọc undefined → TypeError → event FAILED).
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  shopIds: string[];
  userId: string;
  totalAmount: number;
}

// Payload của event 'order.cancelled' — ghi khi khách hủy 1 sub-order.
// shopId là của đúng sub-order bị hủy để worker chỉ thông báo đúng seller đó.
export interface OrderCancelledPayload {
  orderId: string;
  orderNumber: string;
  subOrderId: string;
  userId: string;
  shopId: string;
}

// Payload 'order.status_updated' — seller đổi trạng thái 1 sub-order.
// userId là CUSTOMER của đơn (người cần báo), không phải seller.
export interface OrderStatusUpdatedPayload {
  orderId: string;
  orderNumber: string;
  subOrderId: string;
  userId: string;
  shopId: string;
  newStatus: string;
}

// review.created — notify SELLER chủ shop của product
export interface ReviewCreatedPayload {
  reviewId: string;
  productId: string;
  productName: string;
  shopId: string; // shop sở hữu product → tìm seller để báo 
  rating: number;
}

// review.replied — notify CUSTOMER đã viết review
export interface ReviewRepliedPayload {
  reviewId: string;
  productId: string;
  productName: string;
  customerId: string; // người nhận thông báo
}
