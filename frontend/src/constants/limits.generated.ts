// ⚠️ AUTO-GENERATED bởi scripts/gen-limits.mjs — KHÔNG SỬA TAY.
// Nguồn: backend/src/common/limits.ts. Chạy lại: npm run gen-limits.

export const AUTH_LIMITS = {
  "USERNAME_MIN_LENGTH": 3,
  "USERNAME_MAX_LENGTH": 32,
  "PASSWORD_MIN_LENGTH": 8
} as const;

export const PRODUCT_LIMITS = {
  "NAME_MIN_LENGTH": 1,
  "NAME_MAX_LENGTH": 200,
  "MIN_PRICE": 0,
  "MIN_WEIGHT": 1,
  "MIN_DIMENSION": 1,
  "MIN_STOCK": 0,
  "MAX_VARIANTS": 30,
  "VARIANT": {
    "NAME_MIN_LENGTH": 1,
    "NAME_MAX_LENGTH": 100,
    "MIN_PRICE": 0,
    "MIN_STOCK": 0,
    "MIN_IMAGES": 1,
    "MAX_IMAGES": 3
  }
} as const;

export const SHOP_LIMITS = {
  "NAME_MIN_LENGTH": 3,
  "NAME_MAX_LENGTH": 100,
  "DESCRIPTION_MAX_LENGTH": 1000,
  "PICKUP_ADDRESS_MIN_LENGTH": 10,
  "MIN_CATEGORIES": 1,
  "REJECT_REASON_MIN_LENGTH": 5,
  "GALLERY": {
    "MAX_IMAGES": 3
  }
} as const;

export const BANK_LIMITS = {
  "BANK_NAME_MIN_LENGTH": 2,
  "BANK_NAME_MAX_LENGTH": 100,
  "ACCOUNT_NUMBER_MIN_LENGTH": 6,
  "ACCOUNT_NUMBER_MAX_LENGTH": 30,
  "ACCOUNT_HOLDER_MAX_LENGTH": 100
} as const;

export const COUPON_LIMITS = {
  "CODE_MIN_LENGTH": 3,
  "CODE_MAX_LENGTH": 20
} as const;

export const REVIEW_LIMITS = {
  "MIN_RATING": 1,
  "MAX_RATING": 5,
  "COMMENT_MAX_LENGTH": 2000,
  "REPLY_MIN_LENGTH": 1,
  "REPLY_MAX_LENGTH": 2000
} as const;

export const CART_LIMITS = {
  "MIN_QUANTITY_PER_ITEM": 1,
  "MAX_QUANTITY_PER_ITEM": 99,
  "MAX_DISTINCT_ITEMS": 50
} as const;

export const USER_LIMITS = {
  "MAX_ADDRESSES": 10,
  "FULL_NAME_MAX_LENGTH": 50
} as const;

export const ORDER_LIMITS = {
  "MAX_SHOP_COUPONS": 50
} as const;

export const PAYOUT_LIMITS = {
  "MIN_AMOUNT": 50000
} as const;

export const SHIPPING_LIMITS = {
  "FREE_SHIPPING_THRESHOLD": 500000
} as const;

export const CATEGORY_LIMITS = {
  "NAME_MAX_LENGTH": 255,
  "MIN_DISPLAY_ORDER": 0
} as const;
