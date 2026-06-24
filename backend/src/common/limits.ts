// Hợp đồng limit chia sẻ FE↔BE. Anh em của enums.ts.
// CHỈ literal số + object lồng nhau. KHÔNG import, KHÔNG biểu thức, KHÔNG cross-ref.
// FE đồng bộ qua: npm run gen-limits (đọc đúng file này).
export const AUTH_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 8,
} as const;

export const PRODUCT_LIMITS = {
  NAME_MAX_LENGTH: 200,
  MAX_VARIANTS: 30,
  VARIANT: {
    NAME_MAX_LENGTH: 100,
    MAX_IMAGES: 3,
  },
} as const;

export const SHOP_LIMITS = {
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 1000,
  PICKUP_ADDRESS_MIN_LENGTH: 10,
  GALLERY: {
    MAX_IMAGES: 3,
  },
} as const;

export const BANK_LIMITS = {
  BANK_NAME_MIN_LENGTH: 2,
  BANK_NAME_MAX_LENGTH: 100,
  ACCOUNT_NUMBER_MIN_LENGTH: 6,
  ACCOUNT_NUMBER_MAX_LENGTH: 30,
  ACCOUNT_HOLDER_MAX_LENGTH: 100,
} as const;

export const COUPON_LIMITS = {
  CODE_MIN_LENGTH: 3,
  CODE_MAX_LENGTH: 20,
} as const;

export const REVIEW_LIMITS = {
  RATING_MIN: 1,
  RATING_MAX: 5,
  CONTENT_MAX_LENGTH: 2000,
  REPLY_MIN_LENGTH: 1,
  REPLY_MAX_LENGTH: 2000,
} as const;

export const CART_LIMITS = {
  MIN_QUANTITY_PER_ITEM: 1,
  MAX_QUANTITY_PER_ITEM: 99,
  MAX_DISTINCT_ITEMS: 50,
} as const;

export const USER_LIMITS = {
  MAX_ADDRESSES: 10,
} as const;

export const ORDER_LIMITS = {
  MAX_SHOP_COUPONS: 50,
} as const;

export const PAYOUT_LIMITS = {
  MIN_AMOUNT: 50000,
} as const;

export const SHIPPING_LIMITS = {
  FREE_SHIPPING_THRESHOLD: 500000,
} as const;
