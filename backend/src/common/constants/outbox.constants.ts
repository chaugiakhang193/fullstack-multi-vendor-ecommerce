import {
  PayoutStatus,
  ReturnStatus,
  ProductModerationAction,
  ProductStatus,
} from '@/common/enums';
// Event types cho Transactional Outbox pattern
// Dùng chung giữa Orders module (writer) và Engagements Outbox Worker (reader)
export const OUTBOX_EVENT_TYPES = {
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_STATUS_UPDATED: 'order.status_updated',
  REVIEW_CREATED: 'review.created',
  REVIEW_REPLIED: 'review.replied',
  PAYOUT_CREATED: 'payout.created',
  PAYOUT_STATUS_CHANGED: 'payout.status_changed',
  SHOP_REGISTERED: 'shop.registered',
  RETURN_REQUESTED: 'return.requested',
  RETURN_STATUS_CHANGED: 'return.status_changed',
  PRODUCT_MODERATED: 'product.moderated',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
} as const;

// Payload của event 'order.created' — ghi bởi Orders (writer), đọc bởi Outbox Worker (reader).
// Cột outbox_event.payload là jsonb nên TS không tự canh được giữa 2 module;
// cả writer lẫn reader phải dùng chung interface này để đổi/thiếu field là FAIL COMPILE,
// thay vì fail im lặng lúc runtime (worker đọc undefined → TypeError → event FAILED).
export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  // enrich sellerId + subOrderId theo từng shop để consumer (DB#2, không có bảng shop/sub_order)
  // đọc thẳng từ payload. sellerId null nếu shop mất seller (edge) → consumer skip notif seller.
  // subOrderId để deep-link seller trỏ đúng sub-order của shop đó (route /seller/orders/[id]
  // fetch bằng sub-order id, KHÔNG phải master orderId).
  shops: { shopId: string; sellerId: string | null; subOrderId: string }[];
  userId: string;
  totalAmount: number;
}

// Payload của event 'order.cancelled' — ghi khi khách hủy 1 sub-order.
// shopId là của đúng sub-order bị hủy để worker chỉ thông báo đúng seller đó.
export interface OrderCancelledPayload {
  orderId: string;
  orderNumber: string;
  subOrderId: string;
  userId: string;
  shopId: string;
  sellerId: string | null; // enrich để consumer không tra shop
}

// Payload 'order.status_updated' — seller đổi trạng thái 1 sub-order.
// userId là CUSTOMER của đơn (người cần báo), không phải seller.
export interface OrderStatusUpdatedPayload {
  orderId: string;
  orderNumber: string;
  subOrderId: string;
  userId: string;
  shopId: string;
  newStatus: string;
}

// review.created — notify SELLER chủ shop của product
export interface ReviewCreatedPayload {
  reviewId: string;
  productId: string;
  productName: string;
  shopId: string; // shop sở hữu product (giữ để route WS toShop)
  sellerId: string | null; // enrich để consumer không tra shop
  rating: number;
}

// review.replied — notify CUSTOMER đã viết review
export interface ReviewRepliedPayload {
  reviewId: string;
  productId: string;
  productName: string;
  customerId: string; // người nhận thông báo
}

export interface PayoutCreatedOutboxPayload {
  payoutId: string;
  amount: number;
  shopId: string;
  shopName: string;
  adminIds: string[]; // snapshot admin lúc emit (consumer không có bảng user)
}

export interface PayoutStatusChangedOutboxPayload {
  payoutId: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string;
  shopName: string;
  amount: number;
  status: PayoutStatus; // COMPLETED | REJECTED
  reason: string | null;
}

export interface ShopRegisteredOutboxPayload {
  shopId: string;
  shopName: string;
  isReapply: boolean;
  adminIds: string[]; // snapshot admin lúc emit (consumer không có bảng user)
}

// return.requested — báo SELLER khách vừa tạo yêu cầu trả.
export interface ReturnRequestedOutboxPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  shopId: string; // để route WS toShop
  sellerId: string | null; // enrich để consumer không tra shop
  customerId: string;
}

// return.status_changed — báo CUSTOMER khi seller duyệt/từ chối/nhận hàng.
export interface ReturnStatusChangedOutboxPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  customerId: string; // người nhận thông báo
  status: ReturnStatus; // chỉ APPROVED | REJECTED | RECEIVED được emit
  sellerNote: string | null; // có giá trị khi status = REJECTED
}

// product.moderated — báo SELLER khi admin gỡ (taken_down) hoặc khôi phục (restored) sản phẩm.
// sellerId enrich để consumer đọc thẳng; reason có giá trị khi taken_down.
export interface ProductModeratedOutboxPayload {
  productId: string;
  productName: string;
  shopId: string; // route WS toShop
  sellerId: string | null; // enrich để consumer không tra shop
  sellerEmail: string | null; // enrich để gửi email take-down (chỉ dùng khi taken_down)
  sellerName: string | null; // tên hiển thị trong email (= seller.username)
  action: ProductModerationAction;
  reason: string | null;
}

// Ảnh chụp sản phẩm cho search index (search-service Go).
// created và updated dùng CHUNG một hình dạng vì consumer re-index toàn bộ document
// mỗi lần nhận, không patch từng field — nhận trùng cho ra cùng kết quả (idempotent).
//
// price là string đã chuẩn hoá 2 chữ số thập phân. Vì sao phải chuẩn hoá: cột là
// numeric(12,2) nên TypeORM trả STRING khi load từ DB ('150000.00') nhưng lúc tạo mới
// thì giá đến từ DTO là NUMBER (150000). Không chuẩn hoá thì cùng một sản phẩm, event
// created và updated mang hai định dạng khác nhau — consumer nào so sánh chuỗi để phát
// hiện thay đổi sẽ báo đổi giá trong khi giá không đổi.
//
// KHÔNG mang stock_quantity, và đây là chủ ý: stock đổi mỗi lần có đơn hàng, mà luồng
// order KHÔNG ghi outbox product.*. Mang stock vào đây thì index sẽ sai hệ thống ngay
// sau đơn đầu tiên — tệ hơn là không có. Search index KHÔNG được dùng để lọc còn/hết
// hàng; việc đó phải hỏi lại DB nguồn.
export interface ProductSearchSnapshotPayload {
  productId: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  shopId: string;
  categoryId: string | null;
  thumbnailUrl: string | null;
  status: ProductStatus;
  isHidden: boolean;
  // Mốc thời gian của chính bản ghi nguồn (ISO 8601), KHÔNG phải lúc publish.
  // RabbitMQ không bảo đảm thứ tự, và relay có retry, nên một product.updated cũ hoàn
  // toàn có thể tới SAU bản mới. Consumer phải so mốc này với mốc đang có trong index
  // và BỎ QUA event cũ hơn, nếu không sẽ ghi đè bản mới bằng dữ liệu cũ.
  updatedAt: string;
}

// created và updated hiện là CÙNG một hình dạng. Nếu về sau ai tách hai type này ra
// khác nhau thì PHẢI sửa cả `emitProductSnapshot` trong products.service.ts — hàm đó
// nhận eventType là union của cả hai nhưng chỉ gán MỘT payload type, nên khi hai hình
// dạng khác nhau nó vẫn compile mà ghi sai payload cho một nhánh.
export type ProductCreatedOutboxPayload = ProductSearchSnapshotPayload;
export type ProductUpdatedOutboxPayload = ProductSearchSnapshotPayload;

// product.deleted — chỉ cần id để consumer xoá document khỏi index.
// Lưu ý: `remove()` của monolith là XOÁ MỀM (status = DELETED), nhưng với search index
// thì xoá mềm hay cứng đều phải rời khỏi index, nên vẫn dùng event deleted.
export interface ProductDeletedOutboxPayload {
  productId: string;
}
