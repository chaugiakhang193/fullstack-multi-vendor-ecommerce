import { useQuery } from '@tanstack/react-query';

import notificationApiRequest from '@/apiRequests/engagements/notifications';
import { QUERY_KEYS } from '@/constants/query-keys';

const DROPDOWN_LIMIT = 5;

// 5 thông báo mới nhất cho dropdown.
export function useNotificationsList(enabled: boolean) {
  return useQuery({
    queryKey: [QUERY_KEYS.NOTIFICATIONS, 'list'],
    queryFn: () =>
      notificationApiRequest.getNotifications({
        page: 1,
        limit: DROPDOWN_LIMIT,
      }),
    enabled,
    staleTime: 1000 * 30,
  });
}

// Số chưa đọc = totalItems của query is_read=false (limit=1 cho nhẹ).
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: [QUERY_KEYS.NOTIFICATIONS, 'unread-count'],
    queryFn: () =>
      notificationApiRequest.getNotifications({
        is_read: false,
        page: 1,
        limit: 1,
      }),
    enabled,
    staleTime: 1000 * 30,
  });
}
