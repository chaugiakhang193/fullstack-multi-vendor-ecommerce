// Hợp đồng NS → monolith (Phase 6). NS phát `notification.created` qua exchange
// `notifications.events`; monolith consume + upsert projection
// `notification_read`. HAND-WRITTEN (KHÔNG generated) —  PHẢI mirror y hệt
// ở monolith, hoặc dựng generate chiều ngược. eventId của envelope = outbox row id.
export const NOTIFICATION_CREATED_EVENT = "notification.created";

// Snapshot 1 notification, đủ để monolith dựng row notification_read.
export interface NotificationCreatedPayload {
  id: string;
  userId: string;
  type: string;
  title: string | null;
  content: string | null;
  data: unknown | null;
  isRead: boolean;
  createdAt: Date;
}
