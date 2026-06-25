import z from 'zod';
import type { ApiEnvelope } from '@/lib/http';
import { NotificationType, PayoutStatus } from '@/constants/enum';
import { OrderStatusEnum } from '@/schemaValidations/orders/orders.schema';

// Backend notifications KHÔNG khai báo @ApiResponse({ type }) → swagger để trống schema,
// nên không có generated type để `satisfies`. Schema dưới đây viết tay theo entity
// Notification (engagements/entities/notification.entity.ts) + enum NotificationType
// (common/enums.ts). Response list là PaginatedResponseDto<Notification> = { items, meta }.

// Khớp NotificationType enum backend (common/enums.ts).
// Dữ liệu cấu trúc để FE render câu hiển thị (localized + bold). Mirror BE NotificationData.
// apiRequest KHÔNG .parse() nên union này chỉ dùng để type; render switch có default fallback
// về `content` nếu gặp kind lạ (backend thêm kind mới mà FE chưa cập nhật).
const discriminatorKey = 'kind';
const payoutCreatedKind = 'payout_created';
const shopRegisteredKind = 'shop_registered';

export const NotificationData = z.discriminatedUnion(discriminatorKey, [
  z.object({
    kind: z.literal('order_placed'),
    orderNumber: z.string(),
    amount: z.coerce.number(),
    orderId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('order_new_seller'),
    orderNumber: z.string(),
    orderId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('suborder_cancelled_customer'),
    orderNumber: z.string(),
    orderId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('suborder_cancelled_seller'),
    orderNumber: z.string(),
    orderId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('suborder_status_changed'),
    orderNumber: z.string(),
    status: OrderStatusEnum,
    orderId: z.string().uuid().optional(),
  }),
  // Các loại thông báo Đánh giá mới
  z.object({
    kind: z.literal('review_new_seller'),
    productId: z.string().uuid().optional(),
    productName: z.string(),
    reviewId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('review_replied'),
    productId: z.string().uuid().optional(),
    productName: z.string(),
    reviewId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('payout_status_changed'),
    payoutId: z.string().uuid().optional(),
    amount: z.coerce.number(),
    status: z.nativeEnum(PayoutStatus),
    rejectReason: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal(payoutCreatedKind),
    payoutId: z.string().uuid().optional(),
    amount: z.coerce.number(),
    shopName: z.string(),
  }),
  z.object({
    kind: z.literal(shopRegisteredKind),
    shopId: z.string().uuid().optional(),
    shopName: z.string(),
  }),
]);

export const NotificationItem = z.object({
  id: z.string(),
  type: z.nativeEnum(NotificationType),
  title: z.string().nullable(),
  content: z.string().nullable(),
  data: NotificationData.nullable().optional(),
  is_read: z.boolean(),
  created_at: z.string(),
});

export const NotificationListQuery = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  is_read: z.boolean().optional(),
});

// Phân trang chung (khớp PaginatedResponseDto<T> backend).
export const NotificationPaginationMeta = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

export const NotificationList = z.object({
  items: z.array(NotificationItem),
  meta: NotificationPaginationMeta,
});

// Kết quả PATCH /notifications/read-all.
export const MarkAllReadResult = z.object({
  updated: z.number(),
});

export type NotificationDataType = z.TypeOf<typeof NotificationData>;
export type NotificationItemType = z.TypeOf<typeof NotificationItem>;
export type NotificationListQueryType = z.TypeOf<typeof NotificationListQuery>;
export type NotificationListType = z.TypeOf<typeof NotificationList>;
export type MarkAllReadResultType = z.TypeOf<typeof MarkAllReadResult>;

export type NotificationEnvelope<T = unknown> = ApiEnvelope<T>;
export type NotificationListEnvelope =
  NotificationEnvelope<NotificationListType>;
export type NotificationItemEnvelope =
  NotificationEnvelope<NotificationItemType>;
export type MarkAllReadEnvelope = NotificationEnvelope<MarkAllReadResultType>;
