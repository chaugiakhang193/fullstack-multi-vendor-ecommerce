import z from 'zod';
import { paginated } from '../common.schema';
import { REVIEW_LIMITS } from '@/constants/limits.generated';
import type { ApiEnvelope } from '@/lib/http';
import type { components } from '@/lib/api/api-schema';

// Trích xuất backend types để đảm bảo đồng bộ compile-time
type CreateReviewDto = components['schemas']['CreateReviewDto'];
type ReplyReviewDto = components['schemas']['ReplyReviewDto'];

// ==========================================
// Core Schemas
// ==========================================

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  rating: z
    .number()
    .int()
    .min(REVIEW_LIMITS.MIN_RATING)
    .max(REVIEW_LIMITS.MAX_RATING),
  comment: z.string().nullable().optional(),
  reply_from_seller: z.string().nullable().optional(),
  created_at: z.string(),
  user: z
    .object({
      id: z.string(),
      username: z.string(),
    })
    .nullable()
    .optional(),
  order_item: z
    .object({
      variant_name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  product: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      thumbnail_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
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
  order_item_id: z.string().uuid('ID sản phẩm đặt hàng không hợp lệ'),
  rating: z
    .number()
    .int()
    .min(
      REVIEW_LIMITS.MIN_RATING,
      `Vui lòng chọn số sao từ ${REVIEW_LIMITS.MIN_RATING} đến ${REVIEW_LIMITS.MAX_RATING}`,
    )
    .max(
      REVIEW_LIMITS.MAX_RATING,
      `Đánh giá tối đa là ${REVIEW_LIMITS.MAX_RATING} sao`,
    ),
  comment: z
    .string()
    .max(
      REVIEW_LIMITS.COMMENT_MAX_LENGTH,
      `Đánh giá không được vượt quá ${REVIEW_LIMITS.COMMENT_MAX_LENGTH} ký tự`,
    )
    .optional(),
}) satisfies z.ZodType<CreateReviewDto, any, any>;

export const SellerReplyBody = z.object({
  reply: z
    .string()
    .min(1, 'Phản hồi không được để trống')
    .max(
      REVIEW_LIMITS.REPLY_MAX_LENGTH,
      `Phản hồi tối đa ${REVIEW_LIMITS.REPLY_MAX_LENGTH} ký tự`,
    ),
}) satisfies z.ZodType<ReplyReviewDto, any, any>;

// ==========================================
// Response Schemas
// ==========================================

export const ProductReviewsResponse = paginated(ReviewSchema).extend({
  distribution: z.object({
    '1': z.number(),
    '2': z.number(),
    '3': z.number(),
    '4': z.number(),
    '5': z.number(),
  }),
});

export const ReviewListResponse = paginated(ReviewSchema);

export const ReviewableListResponse = paginated(ReviewableItemSchema);

// ==========================================
// Types
// ==========================================

export type ReviewType = z.TypeOf<typeof ReviewSchema>;
export type ReviewableItemType = z.TypeOf<typeof ReviewableItemSchema>;
export type CreateReviewBodyType = z.TypeOf<typeof CreateReviewBody>;
export type SellerReplyBodyType = z.TypeOf<typeof SellerReplyBody>;

export type ProductReviewsEnvelope = ApiEnvelope<
  z.TypeOf<typeof ProductReviewsResponse>
>;
export type ReviewListEnvelope = ApiEnvelope<
  z.TypeOf<typeof ReviewListResponse>
>;
export type ReviewableListEnvelope = ApiEnvelope<
  z.TypeOf<typeof ReviewableListResponse>
>;
export type ReviewDetailEnvelope = ApiEnvelope<ReviewType>;
