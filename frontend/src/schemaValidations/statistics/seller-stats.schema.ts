import z from "zod";
import type { components } from "@/lib/api/api-schema";

type SellerStatsResponseDto = components["schemas"]["SellerStatsResponseDto"];

export const BestSellerItemSchema = z.object({
  product_id: z.string(),
  product_name: z.string(),
  product_thumbnail: z.custom<Record<string, never> | null>(),
  total_sold: z.coerce.number(),
});

export const StatusCountsSchema = z.object({
  pending: z.number(),
  processing: z.number(),
  shipping: z.number(),
  delivered: z.number(),
  cancelled: z.number(),
  returned: z.number(),
});

export const SellerStatsSchema = z.object({
  total_revenue: z.coerce.number(),
  total_orders: z.number(),
  status_counts: StatusCountsSchema,
  best_sellers: z.array(BestSellerItemSchema),
}) satisfies z.ZodType<SellerStatsResponseDto, any, any>;

// Các định nghĩa type trích xuất từ Zod đặt dưới cùng của file theo rule dự án
export type SellerStatsType = z.TypeOf<typeof SellerStatsSchema>;
export type BestSellerItemType = z.TypeOf<typeof BestSellerItemSchema>;
