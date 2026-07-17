// Hợp đồng WebSocket giữa OutboxWorker (phát) và frontend (nhận qua socket).
// Map event name → payload shape: phát payload sai shape so với event là FAIL COMPILE.
// Thêm event mới chỉ cần khai báo tại đây, gateway và worker tự được canh kiểu theo map này.

import { ProductModerationAction } from '@/common/enums';

export const WS_EVENTS = {
  ORDER_NEW: 'order.new',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  REVIEW_NEW: 'review.new', // báo seller có đánh giá mới
  REVIEW_REPLIED: 'review.replied', // báo customer seller đã phản hồi
  PAYOUT_STATUS_CHANGED: 'payout.status_changed',
  PAYOUT_CREATED: 'payout.created',
  SHOP_REGISTERED: 'shop.registered',
  RETURN_REQUESTED: 'return.requested',
  RETURN_STATUS_CHANGED: 'return.status_changed',
  PRODUCT_MODERATED: 'product.moderated', // báo seller admin gỡ/khôi phục sản phẩm
  NOTIFICATION_NEW: 'notification.new', // báo CHÍNH CHỦ (toUser) có notif mới — mang đủ dòng notif
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

// Payload payout.status_changed — báo đổi trạng thái yêu cầu rút tiền
export interface PayoutStatusChangedWsPayload {
  payoutId: string;
  amount: number;
  status: string;
  message: string;
}

export interface PayoutCreatedWsPayload {
  payoutId: string;
  amount: number;
  shopId: string;
  shopName: string;
  message: string;
}

export interface ShopRegisteredWsPayload {
  shopId: string;
  shopName: string;
  message: string;
}

// Payload event 'return.requested' — báo seller có yêu cầu trả mới
export interface ReturnRequestedWsPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  message: string;
}

// Payload event 'return.status_changed' — báo customer seller đã xử lý yêu cầu trả
export interface ReturnStatusChangedWsPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  status: string;
  message: string;
}

// Payload product.moderated — báo seller admin gỡ/khôi phục sản phẩm
export interface ProductModeratedWsPayload {
  productId: string;
  productName: string;
  action: ProductModerationAction;
  message: string;
}

// Payload notification.new — mang NGUYÊN dòng notification vừa tạo để FE prepend
// vào cache list + tăng badge, KHÔNG cần refetch (né race projection notification_read).
export interface NotificationNewWsPayload {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  data: unknown | null;
  isRead: boolean;
  createdAt: string;
}

// Map tên event → kiểu payload. Nguồn sự thật duy nhất cho mọi event WebSocket.
export type WsPayloadMap = {
  [WS_EVENTS.ORDER_NEW]: OrderNewWsPayload;
  [WS_EVENTS.ORDER_STATUS_CHANGED]: OrderStatusChangedWsPayload;
  [WS_EVENTS.REVIEW_NEW]: ReviewNewWsPayload;
  [WS_EVENTS.REVIEW_REPLIED]: ReviewRepliedWsPayload;
  [WS_EVENTS.PAYOUT_STATUS_CHANGED]: PayoutStatusChangedWsPayload;
  [WS_EVENTS.PAYOUT_CREATED]: PayoutCreatedWsPayload;
  [WS_EVENTS.SHOP_REGISTERED]: ShopRegisteredWsPayload;
  [WS_EVENTS.RETURN_REQUESTED]: ReturnRequestedWsPayload;
  [WS_EVENTS.RETURN_STATUS_CHANGED]: ReturnStatusChangedWsPayload;
  [WS_EVENTS.PRODUCT_MODERATED]: ProductModeratedWsPayload;
  [WS_EVENTS.NOTIFICATION_NEW]: NotificationNewWsPayload;
};

export type WsEventName = keyof WsPayloadMap;

// Room builder — nguồn sự thật duy nhất cho tên room (gateway + NS emitter đều
// dùng qua đây, tránh bẫy lệch room:${id} vs user:${id}).
export const userRoom = (userId: string) => `room:${userId}`;
export const shopRoom = (shopId: string) => `room:${shopId}`;
export const ADMINS_ROOM = 'room:admins';

// Descriptor mang qua boundary process (NS trả về, broker flush qua Redis
// emitter). Union đã widened theo kind — tương quan event↔payload chỉ được
// đảm bảo tại factory bên dưới, KHÔNG còn ở đây (xem TS gotcha trong plan §1d).
export type WsEmit = {
  [E in WsEventName]:
    | { kind: 'user'; userId: string; event: E; payload: WsPayloadMap[E] }
    | { kind: 'shop'; shopId: string; event: E; payload: WsPayloadMap[E] }
    | { kind: 'admins'; event: E; payload: WsPayloadMap[E] };
}[WsEventName];

// Cast `as WsEmit` cần thiết ở đây: TS không tự distribute object literal
// generic {event: E, payload: WsPayloadMap[E]} vào union đã widened — type-safety
// thật sự nằm ở chữ ký hàm (payload PHẢI khớp WsPayloadMap[E]), cast chỉ gom lại
// kết quả đã đúng thành 1 type mang qua boundary (xem TS gotcha, plan §1d).
export const toUser = <E extends WsEventName>(
  userId: string,
  event: E,
  payload: WsPayloadMap[E],
): WsEmit => ({ kind: 'user', userId, event, payload }) as WsEmit;

export const toShop = <E extends WsEventName>(
  shopId: string,
  event: E,
  payload: WsPayloadMap[E],
): WsEmit => ({ kind: 'shop', shopId, event, payload }) as WsEmit;

export const toAdmins = <E extends WsEventName>(
  event: E,
  payload: WsPayloadMap[E],
): WsEmit => ({ kind: 'admins', event, payload }) as WsEmit;
