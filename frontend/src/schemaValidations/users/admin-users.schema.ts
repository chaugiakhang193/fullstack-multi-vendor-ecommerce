import z from "zod";
import { UserRole, AccountStatus } from "@/constants/enum";

// @TODO sprint4: BE đã có /admin/users nhưng api-schema.ts (openapi) chưa regenerate.
// Tạm hand-write zod; sau khi regenerate đổi sang components["schemas"][...] + satisfies.

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

export const AdminUserPaginationMeta = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

// data của list = { items, meta }
export const AdminUserListData = z.object({
  items: z.array(AdminUserItemSchema),
  meta: AdminUserPaginationMeta,
});

// Admin chỉ set 3 trạng thái này (khớp BE UpdateUserStatusDto @IsIn)
export const UpdateUserStatusBody = z.object({
  // fallback: z.enum([EnumMember]) infers enum-member type, not plain string — causes
  // type mismatch with StatusValue in page.tsx; keep string literals until gen-api regenerates
  status: z.enum(["active", "suspended", "banned"]),
});

export type AdminUserItemType = z.TypeOf<typeof AdminUserItemSchema>;
export type AdminUserListDataType = z.TypeOf<typeof AdminUserListData>;
export type AdminUserPaginationMetaType = z.TypeOf<typeof AdminUserPaginationMeta>;
export type UpdateUserStatusBodyType = z.TypeOf<typeof UpdateUserStatusBody>;
