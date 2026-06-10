// Event types cho Transactional Outbox pattern
// Dùng chung giữa Orders module (writer) và Engagements Outbox Worker (reader)
export const OUTBOX_EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
} as const;

// Payload của event 'order.created' — ghi bởi Orders (writer), đọc bởi Outbox Worker (reader).
// Cột outbox_event.payload là jsonb nên TS không tự canh được giữa 2 module;
// cả writer lẫn reader phải dùng chung interface này để đổi/thiếu field là FAIL COMPILE,
// thay vì fail im lặng lúc runtime (worker đọc undefined → TypeError → event FAILED).
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  shopIds: string[];
  userId: string;
  totalAmount: number;
}
