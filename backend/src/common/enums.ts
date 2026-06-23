export enum UserRole {
  ADMIN = 'admin',
  CUSTOMER = 'customer',
  SELLER = 'seller',
}

export enum AccountStatus {
  PENDING_VERIFICATION = 'pending_verification',
  PENDING_APPROVAL = 'pending_approval',
  NEW_SELLER = 'new_seller',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
  REJECTED = 'rejected',
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPING = 'shipping',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export enum PaymentMethod {
  COD = 'cod',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum CouponType {
  GLOBAL = 'global',
  SHOP = 'shop',
}

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
}

export enum VerificationTokenType {
  VERIFY_EMAIL = 'verify_email',
  RESET_PASSWORD = 'reset_password',
}

export enum AssetType {
  SHOP_LOGO = 'shop_logo',
  SHOP_BANNER = 'shop_banner',
  SHOP_GALLERY = 'shop_gallery',
  PRODUCT_IMAGE = 'product_image',
  PRODUCT_THUMBNAIL = 'product_thumbnail',
  PRODUCT_GALLERY = 'product_gallery',
  PRODUCT_VARIANT_IMAGE = 'product_variant_image',
  USER_AVATAR = 'user_avatar',
}

export enum ProductStatus {
  ACTIVE = 'active',
  DELETED = 'deleted',
}

export enum CartItemUnavailableReason {
  OUT_OF_STOCK = 'out_of_stock',
  INSUFFICIENT_STOCK = 'insufficient_stock',
  PRODUCT_HIDDEN = 'product_hidden',
  PRODUCT_DELETED = 'product_deleted',
  SHOP_INACTIVE = 'shop_inactive',
}

export enum IdempotencyStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export enum OutboxEventStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum NotificationType {
  ORDER_CREATED = 'order.created',
  ORDER_STATUS_CHANGED = 'order.status_changed',
  REVIEW_CREATED = 'review.created',
  REVIEW_REPLIED = 'review.replied',
  PAYOUT_CREATED = 'payout.created',
  PAYOUT_STATUS_CHANGED = 'payout.status_changed',
}

export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REJECTED = 'rejected',
}
