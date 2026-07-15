// AUTO-GENERATED bởi notification-service/scripts/gen-contracts.mjs — DO NOT EDIT.
// Nguồn: backend/src/common/enums.ts. Chạy lại: npm run gen-contracts.

export enum NotificationType {
  ORDER_CREATED = "order.created",
  ORDER_STATUS_CHANGED = "order.status_changed",
  REVIEW_CREATED = "review.created",
  REVIEW_REPLIED = "review.replied",
  PAYOUT_CREATED = "payout.created",
  PAYOUT_STATUS_CHANGED = "payout.status_changed",
  SHOP_REGISTERED = "shop.registered",
  RETURN_REQUESTED = "return.requested",
  RETURN_STATUS_CHANGED = "return.status_changed",
  PRODUCT_MODERATED = "product.moderated",
}

export enum OrderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SHIPPING = "shipping",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  RETURNED = "returned",
}

export enum PayoutStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  REJECTED = "rejected",
}

export enum ReturnStatus {
  REQUESTED = "requested",
  APPROVED = "approved",
  REJECTED = "rejected",
  RECEIVED = "received",
  CANCELLED = "cancelled",
}

export enum ProductModerationAction {
  TAKEN_DOWN = "taken_down",
  RESTORED = "restored",
}
