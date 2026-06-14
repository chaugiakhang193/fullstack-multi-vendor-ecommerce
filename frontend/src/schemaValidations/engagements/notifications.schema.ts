import z from "zod";
import { ApiEnvelope } from "@/lib/http";

// Backend notifications KHÔNG khai báo @ApiResponse({ type }) → swagger để trống schema,
// nên không có generated type để `satisfies`. Schema dưới đây viết tay theo entity
// Notification (engagements/entities/notification.entity.ts) + enum NotificationType
// (common/enums.ts). Response list là PaginatedResponseDto<Notification> = { items, meta }.

// Khớp NotificationType enum backend (common/enums.ts).
export const NotificationItem = z.object({
  id: z.string(),
  type: z.enum(["order.created", "order.status_changed"]),
  title: z.string().nullable(),
  content: z.string().nullable(),
  is_read: z.boolean(),
  created_at: z.string(),
});

export const NotificationListQuery = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  is_read: z.boolean().optional(),
});

// Phân trang chung (khớp PaginatedResponseDto<T> backend).
export const NotificationPaginationMeta = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

export const NotificationList = z.object({
  items: z.array(NotificationItem),
  meta: NotificationPaginationMeta,
});

// Kết quả PATCH /notifications/read-all.
export const MarkAllReadResult = z.object({
  updated: z.number(),
});

export type NotificationItemType = z.TypeOf<typeof NotificationItem>;
export type NotificationListQueryType = z.TypeOf<typeof NotificationListQuery>;
export type NotificationListType = z.TypeOf<typeof NotificationList>;
export type MarkAllReadResultType = z.TypeOf<typeof MarkAllReadResult>;

export type NotificationEnvelope<T = unknown> = ApiEnvelope<T>;
export type NotificationListEnvelope = NotificationEnvelope<NotificationListType>;
export type NotificationItemEnvelope = NotificationEnvelope<NotificationItemType>;
export type MarkAllReadEnvelope = NotificationEnvelope<MarkAllReadResultType>;

