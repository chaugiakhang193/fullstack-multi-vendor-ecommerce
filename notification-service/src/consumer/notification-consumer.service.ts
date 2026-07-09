// NestJS
import { Injectable, Logger } from "@nestjs/common";

// TypeORM
import { EntityManager } from "typeorm";

// Contracts (generated)
import {
  NotificationType,
  PayoutStatus,
  ReturnStatus,
} from "@/contracts/enums.generated";
import {
  OUTBOX_EVENT_TYPES,
  OrderCreatedPayload,
  OrderCancelledPayload,
  OrderStatusUpdatedPayload,
  ReviewCreatedPayload,
  ReviewRepliedPayload,
  PayoutCreatedOutboxPayload,
  PayoutStatusChangedOutboxPayload,
  ShopRegisteredOutboxPayload,
  ReturnRequestedOutboxPayload,
  ReturnStatusChangedOutboxPayload,
} from "@/contracts/outbox.constants.generated";

// Internal
import {
  NotificationService,
  CreateNotificationDto,
} from "@/notifications/notification.service";
import { MailService } from "@/mail/mail.service";
import { PoisonPayloadError } from "./poison-payload.error";

// Business handlers move từ backend/src/modules/engagements/outbox.worker.ts
// (Phase 4, P4-6). Khác biệt so với bản backend:
//   - KHÔNG gọi WS gateway (Phase 5 mới có gateway ở NS).
//   - Shop→seller / admin ids tra bằng raw SQL qua EntityManager thay vì
//     ShopsService/UsersService — NS chỉ sở hữu bảng notifications, không có
//     Shop/User entity (tương tự lý do flatten Notification.user_id ở P4-2:
//     NS không cần toàn bộ entity graph, chỉ cần đọc đúng 1-2 cột FK).
@Injectable()
export class NotificationConsumerService {
  private readonly logger = new Logger(NotificationConsumerService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  /** Dispatch theo eventType. Ném PoisonPayloadError nếu payload hỏng (không retry được). */
  async dispatch(
    eventType: string,
    payload: unknown,
    manager: EntityManager,
  ): Promise<void> {
    switch (eventType) {
      case OUTBOX_EVENT_TYPES.ORDER_CREATED:
        return this.handleOrderCreated(payload as OrderCreatedPayload, manager);
      case OUTBOX_EVENT_TYPES.ORDER_CANCELLED:
        return this.handleOrderCancelled(
          payload as OrderCancelledPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.ORDER_STATUS_UPDATED:
        return this.handleOrderStatusUpdated(
          payload as OrderStatusUpdatedPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.REVIEW_CREATED:
        return this.handleReviewCreated(
          payload as ReviewCreatedPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.REVIEW_REPLIED:
        return this.handleReviewReplied(
          payload as ReviewRepliedPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.PAYOUT_CREATED:
        return this.handlePayoutCreated(
          payload as PayoutCreatedOutboxPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.PAYOUT_STATUS_CHANGED:
        return this.handlePayoutStatusChanged(
          payload as PayoutStatusChangedOutboxPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.SHOP_REGISTERED:
        return this.handleShopRegistered(
          payload as ShopRegisteredOutboxPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.RETURN_REQUESTED:
        return this.handleReturnRequested(
          payload as ReturnRequestedOutboxPayload,
          manager,
        );
      case OUTBOX_EVENT_TYPES.RETURN_STATUS_CHANGED:
        return this.handleReturnStatusChanged(
          payload as ReturnStatusChangedOutboxPayload,
          manager,
        );
      default:
        throw new PoisonPayloadError(
          `Event type không được hỗ trợ: ${eventType}`,
        );
    }
  }

  /** Tra seller_id của 1 shop bằng raw SQL (NS không có Shop entity). */
  private async findShopSellerId(
    manager: EntityManager,
    shopId: string,
  ): Promise<string | null> {
    const rows = await manager.query<{ seller_id: string }[]>(
      "SELECT seller_id FROM shop WHERE id = $1",
      [shopId],
    );
    return rows[0]?.seller_id ?? null;
  }

  /** Tra id các user role=admin bằng raw SQL (NS không có User entity). */
  private async findAdminIds(manager: EntityManager): Promise<string[]> {
    const rows = await manager.query<{ id: string }[]>(
      `SELECT id FROM "user" WHERE role = 'admin'`,
    );
    return rows.map((r) => r.id);
  }

  // ==========================================
  // HANDLER: order.created
  // ==========================================
  private async handleOrderCreated(
    payload: OrderCreatedPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !Array.isArray(payload.shopIds) ||
      !payload.userId
    ) {
      throw new PoisonPayloadError(
        `Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`,
      );
    }

    const customerDto: CreateNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_CREATED,
      title: "Đặt hàng thành công",
      content: `Đơn hàng ${payload.orderNumber} đã được đặt thành công. Tổng giá trị: ${payload.totalAmount.toLocaleString("vi-VN")}đ`,
      data: {
        kind: "order_placed",
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        amount: payload.totalAmount,
      },
    };
    await this.notificationService.create(customerDto, manager);

    for (const shopId of payload.shopIds) {
      const sellerId = await this.findShopSellerId(manager, shopId);
      if (!sellerId) {
        this.logger.warn(
          `[NotificationConsumer] Shop ${shopId} không tồn tại — bỏ qua notification.`,
        );
        continue;
      }

      const sellerDto: CreateNotificationDto = {
        userId: sellerId,
        type: NotificationType.ORDER_CREATED,
        title: "Đơn hàng mới",
        content: `Bạn vừa nhận được đơn hàng mới ${payload.orderNumber}.`,
        data: {
          kind: "order_new_seller",
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      };
      await this.notificationService.create(sellerDto, manager);
    }
  }

  // ==========================================
  // HANDLER: order.cancelled
  // ==========================================
  private async handleOrderCancelled(
    payload: OrderCancelledPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !payload.subOrderId ||
      !payload.userId ||
      !payload.shopId
    ) {
      throw new PoisonPayloadError(
        `Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`,
      );
    }

    const customerDto: CreateNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: "Đã hủy đơn hàng con",
      content: `Một shop trong đơn ${payload.orderNumber} đã được hủy theo yêu cầu của bạn.`,
      data: {
        kind: "suborder_cancelled_customer",
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    };
    await this.notificationService.create(customerDto, manager);

    const sellerId = await this.findShopSellerId(manager, payload.shopId);
    if (!sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không tồn tại — bỏ qua notification hủy đơn.`,
      );
      return;
    }

    const sellerDto: CreateNotificationDto = {
      userId: sellerId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: "Đơn hàng bị hủy",
      content: `Khách đã hủy 1 đơn hàng con thuộc đơn ${payload.orderNumber}.`,
      data: {
        kind: "suborder_cancelled_seller",
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    };
    await this.notificationService.create(sellerDto, manager);
  }

  // ==========================================
  // HANDLER: order.status_updated
  // ==========================================
  private async handleOrderStatusUpdated(
    payload: OrderStatusUpdatedPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !payload.subOrderId ||
      !payload.userId ||
      !payload.newStatus
    ) {
      throw new PoisonPayloadError(
        `Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`,
      );
    }

    const dto: CreateNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: "Cập nhật đơn hàng",
      content: `Một shop trong đơn ${payload.orderNumber} đã chuyển sang trạng thái "${payload.newStatus}".`,
      data: {
        kind: "suborder_status_changed",
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        status: payload.newStatus as any,
      },
    };
    await this.notificationService.create(dto, manager);
  }

  // ==========================================
  // HANDLER: review.created
  // ==========================================
  private async handleReviewCreated(
    payload: ReviewCreatedPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.reviewId ||
      !payload.productId ||
      !payload.productName ||
      !payload.shopId
    ) {
      throw new PoisonPayloadError(
        `Payload review.created thiếu field: ${JSON.stringify(payload)}`,
      );
    }

    const sellerId = await this.findShopSellerId(manager, payload.shopId);
    if (!sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không tồn tại — bỏ review notif.`,
      );
      return;
    }

    await this.notificationService.create(
      {
        userId: sellerId,
        type: NotificationType.REVIEW_CREATED,
        title: "Đánh giá mới",
        content: `Sản phẩm "${payload.productName}" vừa nhận đánh giá ${payload.rating}★.`,
        data: {
          kind: "review_new_seller",
          productId: payload.productId,
          productName: payload.productName,
        },
      },
      manager,
    );
  }

  // ==========================================
  // HANDLER: review.replied
  // ==========================================
  private async handleReviewReplied(
    payload: ReviewRepliedPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.reviewId ||
      !payload.productId ||
      !payload.productName ||
      !payload.customerId
    ) {
      throw new PoisonPayloadError(
        `Payload review.replied thiếu field: ${JSON.stringify(payload)}`,
      );
    }

    await this.notificationService.create(
      {
        userId: payload.customerId,
        type: NotificationType.REVIEW_REPLIED,
        title: "Shop đã phản hồi đánh giá",
        content: `Shop đã phản hồi đánh giá của bạn cho "${payload.productName}".`,
        data: {
          kind: "review_replied",
          productId: payload.productId,
          productName: payload.productName,
        },
      },
      manager,
    );
  }

  // ==========================================
  // HANDLER: payout.created (báo admin)
  // ==========================================
  private async handlePayoutCreated(
    payload: PayoutCreatedOutboxPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.payoutId ||
      !payload.shopId ||
      !payload.shopName ||
      typeof payload.amount !== "number"
    ) {
      throw new PoisonPayloadError(
        `payout.created payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }
    const adminIds = await this.findAdminIds(manager);
    const content = `Cửa hàng ${payload.shopName} vừa gửi yêu cầu rút ${payload.amount.toLocaleString("vi-VN")}đ.`;
    await this.notificationService.createForUsers(
      adminIds,
      {
        type: NotificationType.PAYOUT_CREATED,
        title: "Yêu cầu rút tiền mới",
        content,
        data: {
          kind: "payout_created",
          payoutId: payload.payoutId,
          amount: payload.amount,
          shopName: payload.shopName,
        },
      },
      manager,
    );
  }

  // ==========================================
  // HANDLER: shop.registered (báo admin)
  // ==========================================
  private async handleShopRegistered(
    payload: ShopRegisteredOutboxPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (!payload.shopId || !payload.shopName) {
      throw new PoisonPayloadError(
        `shop.registered payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }
    const adminIds = await this.findAdminIds(manager);
    const content = payload.isReapply
      ? `Cửa hàng "${payload.shopName}" vừa nộp lại hồ sơ, đang chờ duyệt.`
      : `Cửa hàng "${payload.shopName}" vừa đăng ký, đang chờ duyệt.`;
    await this.notificationService.createForUsers(
      adminIds,
      {
        type: NotificationType.SHOP_REGISTERED,
        title: payload.isReapply ? "Shop nộp lại hồ sơ" : "Shop mới chờ duyệt",
        content,
        data: {
          kind: "shop_registered",
          shopId: payload.shopId,
          shopName: payload.shopName,
        },
      },
      manager,
    );
  }

  // ==========================================
  // HANDLER: payout.status_changed (báo seller + mail)
  // ==========================================
  private async handlePayoutStatusChanged(
    payload: PayoutStatusChangedOutboxPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (!payload.payoutId || !payload.sellerId || !payload.status) {
      throw new PoisonPayloadError(
        `payout.status_changed payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }
    const isApproved = payload.status === PayoutStatus.COMPLETED;
    const content = isApproved
      ? `Yêu cầu rút tiền trị giá ${payload.amount.toLocaleString("vi-VN")}đ đã được phê duyệt thành công.`
      : `Yêu cầu rút tiền trị giá ${payload.amount.toLocaleString("vi-VN")}đ đã bị từ chối. Lý do: ${payload.reason}`;

    // Mail best-effort (sendPayoutStatusEmail tự nuốt lỗi bên trong → không chặn commit).
    await this.mailService.sendPayoutStatusEmail(
      { email: payload.sellerEmail, username: payload.sellerName },
      payload.shopName,
      payload.amount,
      payload.status,
      payload.reason,
    );

    await this.notificationService.create(
      {
        userId: payload.sellerId,
        type: NotificationType.PAYOUT_STATUS_CHANGED,
        title: isApproved
          ? "Yêu cầu rút tiền thành công"
          : "Yêu cầu rút tiền bị từ chối",
        content,
        data: {
          kind: "payout_status_changed",
          payoutId: payload.payoutId,
          amount: payload.amount,
          status: payload.status,
          rejectReason: payload.reason,
        },
      },
      manager,
    );
  }

  // ==========================================
  // HANDLER: return.requested (báo seller)
  // ==========================================
  private async handleReturnRequested(
    payload: ReturnRequestedOutboxPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.returnId ||
      !payload.subOrderId ||
      !payload.orderNumber ||
      !payload.shopId
    ) {
      throw new PoisonPayloadError(
        `return.requested payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }

    const sellerId = await this.findShopSellerId(manager, payload.shopId);
    if (!sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không tồn tại — bỏ return.requested.`,
      );
      return;
    }

    await this.notificationService.create(
      {
        userId: sellerId,
        type: NotificationType.RETURN_REQUESTED,
        title: "Yêu cầu trả hàng mới",
        content: `Khách vừa gửi yêu cầu trả hàng cho đơn ${payload.orderNumber}.`,
        data: {
          kind: "return_requested_seller",
          returnId: payload.returnId,
          subOrderId: payload.subOrderId,
          orderNumber: payload.orderNumber,
        },
      },
      manager,
    );
  }

  // ==========================================
  // HANDLER: return.status_changed (báo customer)
  // ==========================================
  private async handleReturnStatusChanged(
    payload: ReturnStatusChangedOutboxPayload,
    manager: EntityManager,
  ): Promise<void> {
    if (
      !payload.returnId ||
      !payload.subOrderId ||
      !payload.orderNumber ||
      !payload.customerId ||
      !payload.status
    ) {
      throw new PoisonPayloadError(
        `return.status_changed payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }

    const titleMap: Partial<Record<ReturnStatus, string>> = {
      [ReturnStatus.APPROVED]: "Yêu cầu trả hàng được duyệt",
      [ReturnStatus.REJECTED]: "Yêu cầu trả hàng bị từ chối",
      [ReturnStatus.RECEIVED]: "Đã nhận hàng trả",
    };
    const contentMap: Partial<Record<ReturnStatus, string>> = {
      [ReturnStatus.APPROVED]: `Shop đã duyệt yêu cầu trả hàng đơn ${payload.orderNumber}. Vui lòng gửi hàng về.`,
      [ReturnStatus.REJECTED]: `Shop đã từ chối yêu cầu trả hàng đơn ${payload.orderNumber}.${payload.sellerNote ? ` Lý do: ${payload.sellerNote}` : ""}`,
      [ReturnStatus.RECEIVED]: `Shop đã nhận hàng trả của đơn ${payload.orderNumber}. Yêu cầu hoàn tất.`,
    };

    const title = titleMap[payload.status];
    const content = contentMap[payload.status];
    if (!title || !content) {
      throw new PoisonPayloadError(
        `return.status_changed payload có status không hợp lệ: ${payload.status}`,
      );
    }

    await this.notificationService.create(
      {
        userId: payload.customerId,
        type: NotificationType.RETURN_STATUS_CHANGED,
        title,
        content,
        data: {
          kind: "return_status_customer",
          returnId: payload.returnId,
          subOrderId: payload.subOrderId,
          orderNumber: payload.orderNumber,
          status: payload.status,
          sellerNote: payload.sellerNote,
        },
      },
      manager,
    );
  }
}
