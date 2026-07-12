import { PayoutStatus, ReturnStatus } from '@/common/enums';
// Event types cho Transactional Outbox pattern
// Dùng chung giữa Orders module (writer) và Engagements Outbox Worker (reader)
export const OUTBOX_EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_STATUS_UPDATED: 'order.status_updated',
  REVIEW_CREATED: 'review.created',
  REVIEW_REPLIED: 'review.replied',
  PAYOUT_CREATED: 'payout.created',
  PAYOUT_STATUS_CHANGED: 'payout.status_changed',
  SHOP_REGISTERED: 'shop.registered',
  RETURN_REQUESTED: 'return.requested',
  RETURN_STATUS_CHANGED: 'return.status_changed',
} as const;

// Payload của event 'order.created' — ghi bởi Orders (writer), đọc bởi Outbox Worker (reader).
// Cột outbox_event.payload là jsonb nên TS không tự canh được giữa 2 module;
// cả writer lẫn reader phải dùng chung interface này để đổi/thiếu field là FAIL COMPILE,
// thay vì fail im lặng lúc runtime (worker đọc undefined → TypeError → event FAILED).
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  // enrich sellerId theo từng shop để consumer (DB#2, không có bảng shop)
  // không phải tra. sellerId null nếu shop mất seller (edge) → consumer skip notif
  // seller nhưng vẫn báo customer.
  shops: { shopId: string; sellerId: string | null }[];
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
  sellerId: string | null; // enrich để consumer không tra shop
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
  shopId: string; // shop sở hữu product (giữ để route WS toShop)
  sellerId: string | null; // enrich để consumer không tra shop
  rating: number;
}

// review.replied — notify CUSTOMER đã viết review
export interface ReviewRepliedPayload {
  reviewId: string;
  productId: string;
  productName: string;
  customerId: string; // người nhận thông báo
}

export interface PayoutCreatedOutboxPayload {
  payoutId: string;
  amount: number;
  shopId: string;
  shopName: string;
  adminIds: string[]; // snapshot admin lúc emit (consumer không có bảng user)
}

export interface PayoutStatusChangedOutboxPayload {
  payoutId: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string;
  shopName: string;
  amount: number;
  status: PayoutStatus; // COMPLETED | REJECTED
  reason: string | null;
}

export interface ShopRegisteredOutboxPayload {
  shopId: string;
  shopName: string;
  isReapply: boolean;
  adminIds: string[]; // snapshot admin lúc emit (consumer không có bảng user)
}

// return.requested — báo SELLER khách vừa tạo yêu cầu trả.
export interface ReturnRequestedOutboxPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  shopId: string; // để route WS toShop
  sellerId: string | null; // enrich để consumer không tra shop
  customerId: string;
}

// return.status_changed — báo CUSTOMER khi seller duyệt/từ chối/nhận hàng.
export interface ReturnStatusChangedOutboxPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  customerId: string; // người nhận thông báo
  status: ReturnStatus; // chỉ APPROVED | REJECTED | RECEIVED được emit
  sellerNote: string | null; // có giá trị khi status = REJECTED
}
