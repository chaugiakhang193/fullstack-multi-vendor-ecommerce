// Hợp đồng WebSocket giữa OutboxWorker (phát) và frontend (nhận qua socket).
// Map event name → payload shape: phát payload sai shape so với event là FAIL COMPILE.
// Thêm event mới (vd order.status_changed ở Tuần 2) chỉ cần khai báo tại đây,
// gateway và worker tự được canh kiểu theo map này.

export const WS_EVENTS = {
  ORDER_NEW: 'order.new',
} as const;

// Payload event 'order.new' — báo Seller có đơn hàng mới.
export interface OrderNewWsPayload {
  orderId: string;
  orderNumber: string;
  message: string;
}

// Map tên event → kiểu payload. Nguồn sự thật duy nhất cho mọi event WebSocket.
export type WsPayloadMap = {
  [WS_EVENTS.ORDER_NEW]: OrderNewWsPayload;
};

export type WsEventName = keyof WsPayloadMap;
