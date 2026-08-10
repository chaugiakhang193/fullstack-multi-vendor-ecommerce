// ⚠️ AUTO-GENERATED bởi scripts/gen-enums.mjs — KHÔNG SỬA TAY.
// Nguồn: backend/src/common/enums.ts. Chạy lại: npm run gen-enums.

export enum UserRole {
  ADMIN = "admin",
  CUSTOMER = "customer",
  SELLER = "seller",
}

export enum AccountStatus {
  PENDING_VERIFICATION = "pending_verification",
  PENDING_APPROVAL = "pending_approval",
  NEW_SELLER = "new_seller",
  ACTIVE = "active",
  SUSPENDED = "suspended",
  BANNED = "banned",
  REJECTED = "rejected",
}

export enum OrderStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SHIPPING = "shipping",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  RETURNED = "returned",
}

export enum PaymentMethod {
  COD = "cod",
  VNPAY = "vnpay",
}

export enum PaymentStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
}

export enum CouponType {
  GLOBAL = "global",
  SHOP = "shop",
}

export enum DiscountType {
  PERCENTAGE = "percentage",
  FIXED_AMOUNT = "fixed_amount",
}

export enum VerificationTokenType {
  VERIFY_EMAIL = "verify_email",
  RESET_PASSWORD = "reset_password",
}

export enum ProductStatus {
  ACTIVE = "active",
  DELETED = "deleted",
  SUSPENDED = "suspended",
}

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

export enum CartItemUnavailableReason {
  OUT_OF_STOCK = "out_of_stock",
  INSUFFICIENT_STOCK = "insufficient_stock",
  PRODUCT_HIDDEN = "product_hidden",
  PRODUCT_DELETED = "product_deleted",
  PRODUCT_SUSPENDED = "product_suspended",
  SHOP_INACTIVE = "shop_inactive",
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

export enum ReturnReason {
  DAMAGED = "damaged",
  WRONG_ITEM = "wrong_item",
  NOT_AS_DESCRIBED = "not_as_described",
  MISSING_PARTS = "missing_parts",
  CHANGED_MIND = "changed_mind",
  OTHER = "other",
}
