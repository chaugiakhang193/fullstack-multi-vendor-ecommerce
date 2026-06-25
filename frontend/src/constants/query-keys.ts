// Root scopes — GIỮ string cũ để invalidate theo prefix (socket-provider, notification-bell)
// vẫn match. Thêm các root còn thiếu cho shop/product detail/recommend/category/seller inventory.
export const QUERY_KEYS = {
  CART: 'cart',
  CATEGORIES: 'categories',
  CATEGORY_DETAIL: 'category-detail',
  PRODUCTS: 'products',
  PRODUCT_DETAIL: 'product-detail',
  PRODUCT_SUGGESTIONS: 'product-suggestions',
  RECOMMEND_PRODUCTS: 'recommend-products',
  SELLER_INVENTORY: 'seller-inventory',
  MY_SHOP: 'my-shop',
  SHOP_DETAIL: 'shop-detail',
  SHOP_CATALOG: 'shop-catalog',
  ADDRESSES: 'addresses',
  CHECKOUT_PREVIEW: 'checkout-preview',
  SELLER_ORDERS: 'seller-orders',
  SELLER_ORDER_DETAIL: 'seller-order-detail',
  CUSTOMER_ORDERS: 'customer-orders',
  CUSTOMER_ORDER_DETAIL: 'customer-order-detail',
  NOTIFICATIONS: 'notifications',
  COUPONS: 'coupons',
  REVIEWS: 'reviews',
  PAYOUTS: 'payouts',
  PENDING_SHOPS: 'pending-shops',
} as const;

// staleTime presets tập trung (ms) — hết magic number rải rác.
export const STALE_TIME = {
  SHORT: 1000 * 30, // 30s — đơn hàng, dữ liệu đổi nhanh
  MEDIUM: 1000 * 60 * 2, // 2m — danh sách sản phẩm
  LONG: 1000 * 60 * 5, // 5m — chi tiết shop/sản phẩm
  STATIC: 1000 * 60 * 10, // 10m — danh mục, gợi ý
} as const;

// ===== Query Key Factories =====
// Quy ước: phần tử [0] LUÔN là root string cũ → invalidate prefix tương thích ngược.

export const productKeys = {
  all: [QUERY_KEYS.PRODUCTS] as const,
  list: (params?: Record<string, unknown>) =>
    [QUERY_KEYS.PRODUCTS, 'list', params ?? {}] as const,
  detail: (id: string) => [QUERY_KEYS.PRODUCT_DETAIL, id] as const,
  recommend: (limit: number) => [QUERY_KEYS.RECOMMEND_PRODUCTS, limit] as const,
  sellerInventory: (params?: Record<string, unknown>) =>
    [QUERY_KEYS.SELLER_INVENTORY, params ?? {}] as const,
};

export const categoryKeys = {
  all: [QUERY_KEYS.CATEGORIES] as const,
  detail: (id: string) => [QUERY_KEYS.CATEGORY_DETAIL, id] as const,
};

export const shopKeys = {
  detail: (id: string) => [QUERY_KEYS.SHOP_DETAIL, id] as const,
  catalog: (id: string, query?: Record<string, unknown>) =>
    [QUERY_KEYS.SHOP_CATALOG, id, query ?? {}] as const,
  mine: [QUERY_KEYS.MY_SHOP] as const,
};

export const pendingShopKeys = {
  all: [QUERY_KEYS.PENDING_SHOPS] as const,
};

export const sellerOrderKeys = {
  all: [QUERY_KEYS.SELLER_ORDERS] as const,
  list: (filter: { tab: string; page: number }) =>
    [QUERY_KEYS.SELLER_ORDERS, 'list', filter] as const,
  detailAll: [QUERY_KEYS.SELLER_ORDER_DETAIL] as const,
  detail: (id: string) => [QUERY_KEYS.SELLER_ORDER_DETAIL, id] as const,
};

export const customerOrderKeys = {
  all: [QUERY_KEYS.CUSTOMER_ORDERS] as const,
  list: (filter: { tab: string; page: number }) =>
    [QUERY_KEYS.CUSTOMER_ORDERS, 'list', filter] as const,
  detail: (id: string) => [QUERY_KEYS.CUSTOMER_ORDER_DETAIL, id] as const,
};

export const notificationKeys = {
  all: [QUERY_KEYS.NOTIFICATIONS] as const,
  list: [QUERY_KEYS.NOTIFICATIONS, 'list'] as const,
  unreadCount: [QUERY_KEYS.NOTIFICATIONS, 'unread-count'] as const,
};

export const couponKeys = {
  all: [QUERY_KEYS.COUPONS] as const,
  adminList: (query?: Record<string, unknown>) =>
    [QUERY_KEYS.COUPONS, 'admin-list', query ?? {}] as const,
  sellerList: (query?: Record<string, unknown>) =>
    [QUERY_KEYS.COUPONS, 'seller-list', query ?? {}] as const,
  browse: (query?: Record<string, unknown>) =>
    [QUERY_KEYS.COUPONS, 'browse', query ?? {}] as const,
  wallet: (query?: Record<string, unknown>) =>
    [QUERY_KEYS.COUPONS, 'wallet', query ?? {}] as const,
};

export const reviewKeys = {
  all: [QUERY_KEYS.REVIEWS] as const,
  productReviews: (productId: string, query?: Record<string, unknown>) =>
    [QUERY_KEYS.REVIEWS, 'product', productId, query ?? {}] as const,
  reviewable: (query?: Record<string, unknown>) =>
    [QUERY_KEYS.REVIEWS, 'reviewable', query ?? {}] as const,
  sellerReviews: (query?: Record<string, unknown>) =>
    [QUERY_KEYS.REVIEWS, 'seller-list', query ?? {}] as const,
};

export const payoutKeys = {
  all: [QUERY_KEYS.PAYOUTS] as const,
  balance: [QUERY_KEYS.PAYOUTS, 'balance'] as const,
  historyAll: [QUERY_KEYS.PAYOUTS, 'history'] as const,
  history: (page: number) => [QUERY_KEYS.PAYOUTS, 'history', page] as const,
  adminAll: [QUERY_KEYS.PAYOUTS, 'admin'] as const,
  adminList: (page: number, status?: string) =>
    [QUERY_KEYS.PAYOUTS, 'admin', page, status ?? 'all'] as const,
};
