import z from 'zod';
import type { components } from '@/lib/api/api-schema';

type AdminStatsResponseDto = components['schemas']['AdminStatsResponseDto'];

export const AdminStatsSchema = z.object({
  total_users: z.number(),
  total_customers: z.number(),
  total_sellers: z.number(),
  total_shops: z.number(),
  pending_shops: z.number(),
  total_categories: z.number(),
  total_orders: z.number(),
  total_revenue: z.number(),
}) satisfies z.ZodType<AdminStatsResponseDto, any, any>;

export type AdminStatsType = z.TypeOf<typeof AdminStatsSchema>;
