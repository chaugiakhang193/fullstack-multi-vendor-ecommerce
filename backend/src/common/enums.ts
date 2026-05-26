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
