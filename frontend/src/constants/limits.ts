export const AUTH_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 8,
} as const;

export const CART_LIMITS = {
  MIN_QUANTITY_PER_ITEM: 1,
  MAX_QUANTITY_PER_ITEM: 99,
} as const;

export const CATEGORY_LIMITS = {
  NAME_MAX_LENGTH: 255,
  MIN_DISPLAY_ORDER: 0,
} as const;

export const PRODUCT_LIMITS = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 200,
  MIN_PRICE: 0,
  MIN_WEIGHT: 1, // grams
  MIN_DIMENSION: 1, // cm (aligned to backend Min(1))
  MIN_STOCK: 0,
  MAX_VARIANTS: 30, // aligned to backend ArrayMaxSize(30)
  VARIANT: {
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 100,
    MIN_PRICE: 0,
    MIN_STOCK: 0,
    MIN_IMAGES: 1,
    MAX_IMAGES: 3,
  },
} as const;

export const SHOP_LIMITS = {
  SHOP_NAME_MAX_LENGTH: 100, // aligned max name length to 100
  SHOP_DESCRIPTION_MAX_LENGTH: 1000, // aligned max description length to 1000
  CREATE: {
    NAME_MIN_LENGTH: 3,
    PICKUP_ADDRESS_MIN_LENGTH: 10,
    BANK_ACCOUNT_NAME_MIN_LENGTH: 1,
    BANK_ACCOUNT_NUMBER_MIN_LENGTH: 6,
    BANK_NAME_MIN_LENGTH: 2,
    MIN_CATEGORIES: 1,
  },
  UPDATE: {
    NAME_MIN_LENGTH: 3,
    PICKUP_ADDRESS_MIN_LENGTH: 10, // aligned to 10
    BANK_ACCOUNT_INFO_MIN_LENGTH: 5,
    MAX_GALLERY_IMAGES: 3,
  },
  REJECT: {
    REASON_MIN_LENGTH: 5,
  },
} as const;
