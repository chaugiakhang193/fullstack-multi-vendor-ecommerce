import http from "@/lib/http";
import {
  NotificationListQueryType,
  NotificationEnvelope,
} from "@/schemaValidations/engagements/notifications.schema";

const toQuery = (q?: NotificationListQueryType) => {
  if (!q) return "";
  const params = new URLSearchParams();
  if (q.page) params.set("page", String(q.page));
  if (q.limit) params.set("limit", String(q.limit));
  if (typeof q.is_read === "boolean") params.set("is_read", String(q.is_read));
  const s = params.toString();
  return s ? `?${s}` : "";
};

// ⚠️ TẤT CẢ @TODO W2 — backend engagements/notifications chưa tồn tại.
const notificationApiRequest = {
  // @TODO W2: GET /notifications
  getNotifications: (query?: NotificationListQueryType) =>
    http.get<NotificationEnvelope>(`/notifications${toQuery(query)}`),

  // @TODO W2: PATCH /notifications/:id/read
  markAsRead: (id: string) =>
    http.patch<NotificationEnvelope>(`/notifications/${id}/read`, {}),

  // @TODO W2: PATCH /notifications/read-all
  markAllAsRead: () =>
    http.patch<NotificationEnvelope>("/notifications/read-all", {}),
};

export default notificationApiRequest;
