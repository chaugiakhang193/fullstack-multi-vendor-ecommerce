// Hợp đồng WebSocket giữa OutboxWorker (phát) và frontend (nhận qua socket).
// Map event name → payload shape: phát payload sai shape so với event là FAIL COMPILE.
// Thêm event mới chỉ cần khai báo tại đây, gateway và worker tự được canh kiểu theo map này.

export const WS_EVENTS = {
  ORDER_NEW: 'order.new',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  REVIEW_NEW: 'review.new',          // báo seller có đánh giá mới
  REVIEW_REPLIED: 'review.replied',  // báo customer seller đã phản hồi
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

// Payload review.new — báo seller có đánh giá mới
export interface ReviewNewWsPayload {
  reviewId: string;
  productId: string;
  productName: string;
  rating: number;
  message: string;
}

// Payload review.replied — báo customer seller đã phản hồi
export interface ReviewRepliedWsPayload {
  reviewId: string;
  productId: string;
  productName: string;
  message: string;
}

// Map tên event → kiểu payload. Nguồn sự thật duy nhất cho mọi event WebSocket.
export type WsPayloadMap = {
  [WS_EVENTS.ORDER_NEW]: OrderNewWsPayload;
  [WS_EVENTS.ORDER_STATUS_CHANGED]: OrderStatusChangedWsPayload;
  [WS_EVENTS.REVIEW_NEW]: ReviewNewWsPayload;
  [WS_EVENTS.REVIEW_REPLIED]: ReviewRepliedWsPayload;
};

export type WsEventName = keyof WsPayloadMap;
