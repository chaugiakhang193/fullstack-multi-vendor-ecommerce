import http from '@/lib/http';
import { buildQuery } from '@/lib/utils';
import {
  NotificationListQueryType,
  NotificationListEnvelope,
  NotificationItemEnvelope,
  MarkAllReadEnvelope,
} from '@/schemaValidations/engagements/notifications.schema';

const notificationApiRequest = {
  // GET /notifications — phân trang { items, meta }, lọc is_read.
  getNotifications: (query?: NotificationListQueryType) =>
    http.get<NotificationListEnvelope>(`/notifications${buildQuery(query)}`),

  // PATCH /notifications/:id/read
  markAsRead: (id: string) =>
    http.patch<NotificationItemEnvelope>(`/notifications/${id}/read`, {}),

  // PATCH /notifications/read-all → { updated: N }
  markAllAsRead: () =>
    http.patch<MarkAllReadEnvelope>('/notifications/read-all', {}),
};

export default notificationApiRequest;
