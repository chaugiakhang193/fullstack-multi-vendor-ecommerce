// Event types cho Transactional Outbox pattern
// Dùng chung giữa Orders module (writer) và Engagements Outbox Worker (reader)
export const OUTBOX_EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
} as const;
