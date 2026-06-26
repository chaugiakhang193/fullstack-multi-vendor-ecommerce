import z from 'zod';
import { PaginationMetaSchema, paginated } from '../common.schema';
import { UserRole, AccountStatus } from '@/constants/enum';
import type { components } from '@/lib/api/api-schema';

type UpdateUserStatusDto = components['schemas']['UpdateUserStatusDto'];

// Body input neo vào DTO openapi qua `satisfies` (xem UpdateUserStatusBody).
// Response item hand-write zod theo entity (không bắt buộc satisfies — mirror cách
// các response schema khác như orders/notifications).

export const AdminUserItemSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  role: z.nativeEnum(UserRole),
  status: z.nativeEnum(AccountStatus),
  full_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

// data của list = { items, meta }
export const AdminUserListData = paginated(AdminUserItemSchema);

// Admin chỉ set 3 trạng thái này (khớp BE UpdateUserStatusDto @IsIn)
export const UpdateUserStatusBody = z.object({
  // string-literal (không nativeEnum): khớp StatusValue ở page.tsx và DTO openapi
  // (openapi sinh union literal, không phải TS enum).
  status: z.enum(['active', 'suspended', 'banned']),
}) satisfies z.ZodType<UpdateUserStatusDto, any, any>;

export type AdminUserItemType = z.TypeOf<typeof AdminUserItemSchema>;
export type AdminUserListDataType = z.TypeOf<typeof AdminUserListData>;
export type AdminUserPaginationMetaType = z.TypeOf<typeof PaginationMetaSchema>;
export type UpdateUserStatusBodyType = z.TypeOf<typeof UpdateUserStatusBody>;
