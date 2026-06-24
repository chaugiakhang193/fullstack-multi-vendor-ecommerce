import z from 'zod';
import { ORDER_LIMITS } from '@/constants/limits.generated';
import type { components } from '@/lib/api/api-schema';
import type { ApiEnvelope } from '@/lib/http';

type ShopCouponDto = components['schemas']['ShopCouponDto'];
type CreateOrderDto = components['schemas']['CreateOrderDto'];
type CheckoutPreviewDto = components['schemas']['CheckoutPreviewDto'];
type UpdateSubOrderStatusDto = components['schemas']['UpdateSubOrderStatusDto'];

// `satisfies` đảm bảo Zod schema luôn khớp generated type từ api-schema.d.ts.
// Nếu backend thay đổi enum/field, `npm run gen-api` + TypeScript sẽ báo lỗi ngay tại đây.
//
// LƯU Ý về RESPONSE: các endpoint seller-orders / checkout-preview KHÔNG khai báo
// @ApiResponse({ type }) ở backend → swagger để trống schema (content?: never), nên
// không có generated type để `satisfies`. Các schema response dưới đây viết tay theo
// đúng shape service trả về. Cột `decimal` của TypeORM serialize thành STRING, nên mọi
// field tiền tệ dùng `z.coerce.number()` cho an toàn.

// ===== Enum + State Machine (mirror backend common/enums.ts + orders.service.ts) =====
export const OrderStatusEnum = z.enum([
  'pending',
  'processing',
  'shipping',
  'delivered',
  'cancelled',
  'returned',
]);

// Các trạng thái seller được phép chuyển tới từ trạng thái hiện tại.
export const SUB_ORDER_STATE_MACHINE: Record<
  OrderStatusType,
  OrderStatusType[]
> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipping', 'cancelled'],
  shipping: ['delivered'],
  delivered: [],
  cancelled: [],
  returned: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatusType, string> = {
  pending: 'Chờ xác nhận',
  processing: 'Đang xử lý',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
  returned: 'Đã trả hàng',
};

// ===== Checkout (POST /orders/checkout) =====
export const ShopCouponBody = z.object({
  shop_id: z.string().uuid(),
  coupon_code: z.string(),
}) satisfies z.ZodType<ShopCouponDto, any, any>;

export const CheckoutBody = z.object({
  address_id: z.string().uuid('Địa chỉ không hợp lệ'),
  payment_method: z.literal('cod'),
  global_coupon_code: z.string().optional(),
  shop_coupons: z
    .array(ShopCouponBody)
    .max(ORDER_LIMITS.MAX_SHOP_COUPONS)
    .optional(),
}) satisfies z.ZodType<CreateOrderDto, any, any>;

// ===== Checkout Preview (POST /orders/checkout/preview) =====
export const CheckoutPreviewBody = z.object({
  address_id: z.string().uuid('Địa chỉ không hợp lệ'),
  global_coupon_code: z.string().optional(),
  shop_coupons: z
    .array(ShopCouponBody)
    .max(ORDER_LIMITS.MAX_SHOP_COUPONS)
    .optional(),
}) satisfies z.ZodType<CheckoutPreviewDto, any, any>;

// ===== Query lịch sử đơn / seller orders =====
export const OrderListQuery = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  status: OrderStatusEnum.optional(),
});

// ===== Seller cập nhật trạng thái (PATCH /seller/orders/:id/status) =====
export const UpdateOrderStatusBody = z.object({
  status: OrderStatusEnum,
}) satisfies z.ZodType<UpdateSubOrderStatusDto, any, any>;

// ===== Shared: snapshot địa chỉ giao hàng (jsonb trên Order) =====
export const ShippingAddressSnapshot = z.object({
  recipient_name: z.string(),
  phone: z.string(),
  address_line: z.string(),
  lat: z.union([z.string(), z.number()]).nullable().optional(),
  lng: z.union([z.string(), z.number()]).nullable().optional(),
});

// ===== Checkout Preview Response (viết tay — không có generated type) =====
export const PreviewItem = z.object({
  productId: z.string(),
  variantId: z.string().nullable().optional(),
  productName: z.string(),
  variantName: z.string().nullable().optional(),
  productThumbnail: z.string().nullable().optional(),
  price: z.coerce.number(),
  quantity: z.coerce.number(),
  stock_warning: z.string().nullable().optional(),
});

export const PreviewShop = z.object({
  shopId: z.string(),
  shopName: z.string(),
  items: z.array(PreviewItem),
  shippingFee: z.coerce.number(),
  shopSubtotal: z.coerce.number(),
  freeship_upsell_needed: z.coerce.number().nullable().optional(),
});

export const CheckoutPreviewResponse = z.object({
  shops: z.array(PreviewShop),
  totalShippingFee: z.coerce.number(),
  totalDiscount: z.coerce.number(),
  totalAmount: z.coerce.number(),
});

// ===== Checkout Response (POST /orders/checkout) =====
export const CheckoutResponseItem = z.object({
  product_id: z.string(),
  product_name: z.string(),
  variant_id: z.string().nullable().optional(),
  variant_name: z.string().nullable().optional(),
  quantity: z.coerce.number(),
  price_at_purchase: z.coerce.number(),
});

export const CheckoutResponseSubOrder = z.object({
  sub_order_id: z.string(),
  shop_id: z.string(),
  shop_name: z.string(),
  sub_total: z.coerce.number(),
  shipping_fee: z.coerce.number(),
  discount_amount: z.coerce.number(),
  total_amount: z.coerce.number(),
  items: z.array(CheckoutResponseItem),
});

export const CheckoutResponse = z.object({
  order_id: z.string(),
  order_number: z.string(),
  total_amount: z.coerce.number(),
  payment_method: z.literal('cod'),
  shipping_address: ShippingAddressSnapshot,
  sub_orders: z.array(CheckoutResponseSubOrder),
  created_at: z.string(),
});

// ===== Seller Order (viết tay theo entity SubOrder + relations) =====
export const SellerOrderItem = z.object({
  id: z.string(),
  quantity: z.coerce.number().nullable(),
  price_at_purchase: z.coerce.number().nullable(),
  product_name: z.string(),
  variant_name: z.string().nullable().optional(),
  product_thumbnail: z.string().nullable().optional(),
  variant_attributes: z.record(z.string()).nullable().optional(),
});

export const SellerOrderShop = z.object({
  id: z.string(),
  name: z.string(),
  logo_url: z.string().nullable().optional(),
  // Tọa độ shop (decimal → string runtime) cho Live-Tracking Map. getOrderDetail
  // KHÔNG .parse() nên field qua được; khai optional để TS cho truy cập + an toàn nếu thiếu.
  lat: z.union([z.string(), z.number()]).nullable().optional(),
  lng: z.union([z.string(), z.number()]).nullable().optional(),
});

// Order "master" được load kèm (leftJoin) — customer KHÔNG join ở list.
export const SellerOrderMaster = z.object({
  id: z.string(),
  order_number: z.string().nullable().optional(),
  total_amount: z.coerce.number().nullable().optional(),
  status: OrderStatusEnum,
  shipping_address: ShippingAddressSnapshot.nullable().optional(),
  created_at: z.string(),
});

export const SellerOrder = z.object({
  id: z.string(),
  sub_total: z.coerce.number().nullable(),
  shipping_fee: z.coerce.number().nullable(),
  discount_amount: z.coerce.number().nullable(),
  total_amount: z.coerce.number().nullable(),
  status: OrderStatusEnum,
  created_at: z.string(),
  updated_at: z.string(),
  shop: SellerOrderShop.optional(),
  order: SellerOrderMaster.nullable().optional(),
  items: z.array(SellerOrderItem).optional(),
});

// Phân trang chung (khớp PaginatedResponseDto<T> backend).
export const PaginationMeta = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

export const SellerOrderList = z.object({
  items: z.array(SellerOrder),
  meta: PaginationMeta,
});

// Kết quả PATCH status.
export const UpdateOrderStatusResult = z.object({
  subOrderId: z.string(),
  subOrderStatus: OrderStatusEnum,
  orderStatus: OrderStatusEnum,
  orderTotalAmount: z.coerce.number(),
});

// ===== Customer Order (viết tay theo entity Order + relations) =====
export const CustomerOrderSubOrder = z.object({
  id: z.string(),
  shop: SellerOrderShop.optional(),
  status: OrderStatusEnum,
  sub_total: z.coerce.number().nullable(),
  shipping_fee: z.coerce.number().nullable(),
  discount_amount: z.coerce.number().nullable(),
  total_amount: z.coerce.number().nullable(),
  items: z.array(SellerOrderItem).optional(),
});

export const CustomerOrder = z.object({
  id: z.string(),
  order_number: z.string().nullable().optional(),
  total_amount: z.coerce.number().nullable().optional(),
  status: OrderStatusEnum,
  payment_method: z.string().nullable().optional(),
  shipping_address: ShippingAddressSnapshot.nullable().optional(),
  sub_orders: z.array(CustomerOrderSubOrder).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CustomerOrderList = z.object({
  items: z.array(CustomerOrder),
  meta: PaginationMeta,
});

export const CancelSubOrderResult = z.object({
  subOrderId: z.string(),
  subOrderStatus: OrderStatusEnum,
  orderStatus: OrderStatusEnum,
});

// ===== Types =====
// Toàn bộ type trích từ Zod gom ở cuối file
export type OrderStatusType = z.TypeOf<typeof OrderStatusEnum>;
export type ShippingAddressSnapshotType = z.TypeOf<
  typeof ShippingAddressSnapshot
>;

// Checkout preview (body → response)
export type CheckoutPreviewBodyType = z.TypeOf<typeof CheckoutPreviewBody>;
export type PreviewItemType = z.TypeOf<typeof PreviewItem>;
export type PreviewShopType = z.TypeOf<typeof PreviewShop>;
export type CheckoutPreviewResponseType = z.TypeOf<
  typeof CheckoutPreviewResponse
>;

// Checkout (body → response)
export type ShopCouponBodyType = z.TypeOf<typeof ShopCouponBody>;
export type CheckoutBodyType = z.TypeOf<typeof CheckoutBody>;
export type CheckoutResponseType = z.TypeOf<typeof CheckoutResponse>;

// Seller orders (query/body → response)
export type OrderListQueryType = z.TypeOf<typeof OrderListQuery>;
export type UpdateOrderStatusBodyType = z.TypeOf<typeof UpdateOrderStatusBody>;
export type SellerOrderItemType = z.TypeOf<typeof SellerOrderItem>;
export type SellerOrderType = z.TypeOf<typeof SellerOrder>;
export type SellerOrderListType = z.TypeOf<typeof SellerOrderList>;
export type UpdateOrderStatusResultType = z.TypeOf<
  typeof UpdateOrderStatusResult
>;

// Customer orders
export type CustomerOrderSubOrderType = z.TypeOf<typeof CustomerOrderSubOrder>;
export type CustomerOrderType = z.TypeOf<typeof CustomerOrder>;
export type CustomerOrderListType = z.TypeOf<typeof CustomerOrderList>;
export type CancelSubOrderResultType = z.TypeOf<typeof CancelSubOrderResult>;

export type CheckoutPreviewEnvelope = ApiEnvelope<CheckoutPreviewResponseType>;
export type CheckoutEnvelope = ApiEnvelope<CheckoutResponseType>;
export type SellerOrderListEnvelope = ApiEnvelope<SellerOrderListType>;
export type SellerOrderEnvelope = ApiEnvelope<SellerOrderType>;
export type UpdateOrderStatusEnvelope =
  ApiEnvelope<UpdateOrderStatusResultType>;

export type CustomerOrderListEnvelope = ApiEnvelope<CustomerOrderListType>;
export type CustomerOrderEnvelope = ApiEnvelope<CustomerOrderType>;
export type CancelSubOrderEnvelope = ApiEnvelope<CancelSubOrderResultType>;
