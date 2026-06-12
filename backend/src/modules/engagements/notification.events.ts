// Hợp đồng WebSocket giữa OutboxWorker (phát) và frontend (nhận qua socket).
// Map event name → payload shape: phát payload sai shape so với event là FAIL COMPILE.
// Thêm event mới chỉ cần khai báo tại đây, gateway và worker tự được canh kiểu theo map này.

export const WS_EVENTS = {
  ORDER_NEW: 'order.new',
  ORDER_STATUS_CHANGED: 'order.status_changed',
} as const;

// Payload event 'order.new' — báo Seller có đơn hàng mới.
export interface OrderNewWsPayload {
  orderId: string;
  orderNumber: string;
  message: string;
}

// Payload event 'order.status_changed' — báo đổi trạng thái 1 sub-order
// (hủy bởi khách ở Thứ Hai, hoặc seller đổi trạng thái ở Thứ Ba).
export interface OrderStatusChangedWsPayload {
  orderId: string;
  orderNumber: string;
  subOrderId: string;
  status: string;
  message: string;
}

// Map tên event → kiểu payload. Nguồn sự thật duy nhất cho mọi event WebSocket.
export type WsPayloadMap = {
  [WS_EVENTS.ORDER_NEW]: OrderNewWsPayload;
  [WS_EVENTS.ORDER_STATUS_CHANGED]: OrderStatusChangedWsPayload;
};

export type WsEventName = keyof WsPayloadMap;
