import z from 'zod';
import type { components } from '@/lib/api/api-schema';

type PaginationMetaDto = components['schemas']['PaginationMetaDto'];

// Canonical meta phân trang, satisfies generated PaginationMetaDto từ backend
export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
}) satisfies z.ZodType<PaginationMetaDto, any, any>;

export type PaginationMetaType = z.TypeOf<typeof PaginationMetaSchema>;

// Helper bọc list phân trang: { items: T[], meta }
export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), meta: PaginationMetaSchema });
