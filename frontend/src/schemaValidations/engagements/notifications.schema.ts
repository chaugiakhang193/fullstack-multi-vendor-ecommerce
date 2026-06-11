import z from "zod";

// @TODO W2: backend notifications (GET /notifications ...) chưa có trong swagger.
// Khi backend land, regenerate api-schema và thay bằng `satisfies z.ZodType<...>`.

// Khớp NotificationType enum backend (notification-type.enum.ts)
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

export type NotificationItemType = z.TypeOf<typeof NotificationItem>;
export type NotificationListQueryType = z.TypeOf<typeof NotificationListQuery>;
export type NotificationEnvelope<T = unknown> = { message?: string; data: T };
