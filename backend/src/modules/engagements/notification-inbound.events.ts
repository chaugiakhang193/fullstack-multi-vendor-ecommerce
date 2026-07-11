// Hợp đồng NS → monolith (Phase 6, part_03) — MIRROR
// notification-service/src/contracts/notification-outbound.events.ts.
// NS phát notification.created qua notifications.events; monolith consume +
// upsert projection notification_read. Sửa 1 bên PHẢI sửa bên kia (hand-write).
export const NOTIFICATION_CREATED_EVENT = 'notification.created';

export interface NotificationCreatedPayload {
  id: string;
  userId: string;
  type: string;
  title: string | null;
  content: string | null;
  data: unknown | null;
  isRead: boolean;
  createdAt: string; // ISO — envelope JSON serialize Date thành string qua broker
}
