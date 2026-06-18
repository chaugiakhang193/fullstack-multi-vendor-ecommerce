import z from "zod";
import { ApiEnvelope } from "@/lib/http";
import type { components } from "@/lib/api/api-schema";

// Trích xuất backend types để đảm bảo đồng bộ compile-time
type CreateReviewDto = components["schemas"]["CreateReviewDto"];
type ReplyReviewDto = components["schemas"]["ReplyReviewDto"];

// ==========================================
// Core Schemas
// ==========================================

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable().optional(),
  reply_from_seller: z.string().nullable().optional(),
  created_at: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
  }).nullable().optional(),
  order_item: z.object({
    variant_name: z.string().nullable().optional(),
  }).nullable().optional(),
});

export const ReviewableItemSchema = z.object({
  order_item_id: z.string().uuid(),
  product_id: z.string().uuid().nullable(),
  product_name: z.string(),
  variant_name: z.string().nullable().optional(),
  product_thumbnail: z.string().nullable().optional(),
  variant_attributes: z.record(z.string()).nullable().optional(),
  quantity: z.coerce.number().int(),
  order_number: z.string(),
  delivered_at: z.string(),
});

// ==========================================
// Request Body Schemas
// ==========================================

export const CreateReviewBody = z.object({
  order_item_id: z.string().uuid("ID sản phẩm đặt hàng không hợp lệ"),
  rating: z.number().int().min(1, "Vui lòng chọn số sao từ 1 đến 5").max(5, "Đánh giá tối đa là 5 sao"),
  comment: z.string().max(2000, "Đánh giá không được vượt quá 2000 ký tự").optional(),
}) satisfies z.ZodType<CreateReviewDto>;

export const SellerReplyBody = z.object({
  reply: z.string().min(1, "Phản hồi không được để trống").max(2000, "Phản hồi tối đa 2000 ký tự"),
}) satisfies z.ZodType<ReplyReviewDto>;

// ==========================================
// Response Schemas
// ==========================================

export const ProductReviewsResponse = z.object({
  items: z.array(ReviewSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
  distribution: z.object({
    "1": z.number(),
    "2": z.number(),
    "3": z.number(),
    "4": z.number(),
    "5": z.number(),
  }),
});

export const ReviewListResponse = z.object({
  items: z.array(ReviewSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});

export const ReviewableListResponse = z.object({
  items: z.array(ReviewableItemSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});

// ==========================================
// Types
// ==========================================

export type ReviewType = z.TypeOf<typeof ReviewSchema>;
export type ReviewableItemType = z.TypeOf<typeof ReviewableItemSchema>;
export type CreateReviewBodyType = z.TypeOf<typeof CreateReviewBody>;
export type SellerReplyBodyType = z.TypeOf<typeof SellerReplyBody>;

export type ProductReviewsEnvelope = ApiEnvelope<z.TypeOf<typeof ProductReviewsResponse>>;
export type ReviewListEnvelope = ApiEnvelope<z.TypeOf<typeof ReviewListResponse>>;
export type ReviewableListEnvelope = ApiEnvelope<z.TypeOf<typeof ReviewableListResponse>>;
export type ReviewDetailEnvelope = ApiEnvelope<ReviewType>;
