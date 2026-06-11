import z from "zod";
import type { components } from "@/lib/api/api-schema";

// ===== Checkout (ĐÃ CÓ backend — POST /orders/checkout) =====
// `satisfies` đảm bảo Zod schema luôn khớp generated type từ api-schema.d.ts.
// Nếu backend thay đổi enum/field, `npm run gen-api` + TypeScript sẽ báo lỗi ngay tại đây.
export const ShopCouponBody = z.object({
  shop_id: z.string().uuid(),
  coupon_code: z.string(),
}) satisfies z.ZodType<components["schemas"]["ShopCouponDto"]>;

export const CheckoutBody = z.object({
  address_id: z.string().uuid("Địa chỉ không hợp lệ"),
  payment_method: z.literal("cod"),
  global_coupon_code: z.string().optional(),
  shop_coupons: z.array(ShopCouponBody).max(50).optional(),
}) satisfies z.ZodType<components["schemas"]["CreateOrderDto"]>;

// ===== Checkout Preview (@TODO W2 — POST /orders/checkout/preview — thêm satisfies khi gen-api xong) =====
export const CheckoutPreviewBody = z.object({
  address_id: z.string().uuid(),
  global_coupon_code: z.string().optional(),
  shop_coupons: z.array(ShopCouponBody).max(50).optional(),
});

// ===== Query lịch sử đơn (@TODO W2) =====
export const OrderListQuery = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  status: z.string().optional(),
});

// ===== Seller cập nhật trạng thái (@TODO W2) =====
export const UpdateOrderStatusBody = z.object({
  status: z.string(), // @TODO W2: thay bằng enum OrderStatus khi backend land
});

// ===== Types =====
export type ShopCouponBodyType = z.TypeOf<typeof ShopCouponBody>;
export type CheckoutBodyType = z.TypeOf<typeof CheckoutBody>;
export type CheckoutPreviewBodyType = z.TypeOf<typeof CheckoutPreviewBody>;
export type OrderListQueryType = z.TypeOf<typeof OrderListQuery>;
export type UpdateOrderStatusBodyType = z.TypeOf<typeof UpdateOrderStatusBody>;

// Generic envelope dùng tạm cho các response chưa có type cụ thể (@TODO W2)
export type OrderEnvelope<T = unknown> = { message?: string; data: T };
