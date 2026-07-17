// NestJS
import { Injectable, Logger } from "@nestjs/common";

// TypeORM
import { EntityManager } from "typeorm";

// Contracts (generated)
import {
  NotificationType,
  PayoutStatus,
  ReturnStatus,
  ProductModerationAction,
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
  ProductModeratedOutboxPayload,
} from "@/contracts/outbox.constants.generated";

// Internal
import {
  NotificationService,
  CreateNotificationDto,
} from "@/notifications/notification.service";
import { MailService } from "@/mail/mail.service";
import { PoisonPayloadError } from "./poison-payload.error";
import {
  WS_EVENTS,
  WsEmit,
  toUser,
  toShop,
  toAdmins,
} from "@/contracts/ws-events.generated";

// Business handlers move từ backend/src/modules/engagements/outbox.worker.ts
// (Phase 4, P4-6). Khác biệt so với bản backend:
//   - KHÔNG gọi WS gateway trực tiếp — trả WsEmit[] để broker flush sau commit (P5-5).
//   - sellerId/adminIds đọc THẲNG từ payload (đã enrich ở producer backend).
//     NS sống trên DB#2 (own DB) không có bảng shop/user nên tuyệt đối không tra
//     ngoài payload (tương tự lý do flatten Notification.user_id ở P4-2).
@Injectable()
export class NotificationConsumerService {
  private readonly logger = new Logger(NotificationConsumerService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Dispatch theo eventType, trả về WsEmit[] để broker flush WS sau commit
   * (P5-5 — return-value per-invocation, KHÔNG buffer nội bộ vì prefetch=10
   * chạy song song trên singleton). Ném PoisonPayloadError nếu payload hỏng.
   */
  async dispatch(
    eventType: string,
    payload: unknown,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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
      case OUTBOX_EVENT_TYPES.PRODUCT_MODERATED:
        return this.handleProductModerated(
          payload as ProductModeratedOutboxPayload,
          manager,
        );
      default:
        throw new PoisonPayloadError(
          `Event type không được hỗ trợ: ${eventType}`,
        );
    }
  }

  // ==========================================
  // HANDLER: order.created
  // ==========================================
  private async handleOrderCreated(
    payload: OrderCreatedPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !Array.isArray(payload.shops) ||
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

    const emits: WsEmit[] = [];
    for (const { shopId, sellerId, subOrderId } of payload.shops) {
      if (!sellerId) {
        this.logger.warn(
          `[NotificationConsumer] Shop ${shopId} không có seller trong payload — bỏ qua notification.`,
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
          subOrderId,
        },
      };
      await this.notificationService.create(sellerDto, manager);

      emits.push(
        toShop(shopId, WS_EVENTS.ORDER_NEW, {
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          message: `Đơn hàng mới ${payload.orderNumber}`,
        }),
      );
    }
    return emits;
  }

  // ==========================================
  // HANDLER: order.cancelled
  // ==========================================
  private async handleOrderCancelled(
    payload: OrderCancelledPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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

    if (!payload.sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không có seller trong payload — bỏ qua notification hủy đơn.`,
      );
      return [];
    }

    const sellerDto: CreateNotificationDto = {
      userId: payload.sellerId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: "Đơn hàng bị hủy",
      content: `Khách đã hủy 1 đơn hàng con thuộc đơn ${payload.orderNumber}.`,
      data: {
        kind: "suborder_cancelled_seller",
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        subOrderId: payload.subOrderId,
      },
    };
    await this.notificationService.create(sellerDto, manager);

    return [
      toShop(payload.shopId, WS_EVENTS.ORDER_STATUS_CHANGED, {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        subOrderId: payload.subOrderId,
        status: "cancelled",
        message: `Đơn ${payload.orderNumber} có 1 shop bị hủy`,
      }),
    ];
  }

  // ==========================================
  // HANDLER: order.status_updated
  // ==========================================
  private async handleOrderStatusUpdated(
    payload: OrderStatusUpdatedPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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

    return [
      toUser(payload.userId, WS_EVENTS.ORDER_STATUS_CHANGED, {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        subOrderId: payload.subOrderId,
        status: payload.newStatus,
        message: `Đơn ${payload.orderNumber} cập nhật: ${payload.newStatus}`,
      }),
    ];
  }

  // ==========================================
  // HANDLER: review.created
  // ==========================================
  private async handleReviewCreated(
    payload: ReviewCreatedPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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

    if (!payload.sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không có seller trong payload — bỏ review notif.`,
      );
      return [];
    }

    await this.notificationService.create(
      {
        userId: payload.sellerId,
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

    return [
      toShop(payload.shopId, WS_EVENTS.REVIEW_NEW, {
        reviewId: payload.reviewId,
        productId: payload.productId,
        productName: payload.productName,
        rating: payload.rating,
        message: `Đánh giá mới cho "${payload.productName}"`,
      }),
    ];
  }

  // ==========================================
  // HANDLER: review.replied
  // ==========================================
  private async handleReviewReplied(
    payload: ReviewRepliedPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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

    return [
      toUser(payload.customerId, WS_EVENTS.REVIEW_REPLIED, {
        reviewId: payload.reviewId,
        productId: payload.productId,
        productName: payload.productName,
        message: `Shop đã phản hồi đánh giá "${payload.productName}"`,
      }),
    ];
  }

  // ==========================================
  // HANDLER: payout.created (báo admin)
  // ==========================================
  private async handlePayoutCreated(
    payload: PayoutCreatedOutboxPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
    if (
      !payload.payoutId ||
      !payload.shopId ||
      !payload.shopName ||
      typeof payload.amount !== "number" ||
      !Array.isArray(payload.adminIds)
    ) {
      throw new PoisonPayloadError(
        `payout.created payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }
    const content = `Cửa hàng ${payload.shopName} vừa gửi yêu cầu rút ${payload.amount.toLocaleString("vi-VN")}đ.`;
    await this.notificationService.createForUsers(
      payload.adminIds,
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

    return [
      toAdmins(WS_EVENTS.PAYOUT_CREATED, {
        payoutId: payload.payoutId,
        amount: payload.amount,
        shopId: payload.shopId,
        shopName: payload.shopName,
        message: content,
      }),
    ];
  }

  // ==========================================
  // HANDLER: shop.registered (báo admin)
  // ==========================================
  private async handleShopRegistered(
    payload: ShopRegisteredOutboxPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
    if (
      !payload.shopId ||
      !payload.shopName ||
      !Array.isArray(payload.adminIds)
    ) {
      throw new PoisonPayloadError(
        `shop.registered payload thiếu field: ${JSON.stringify(payload)}`,
      );
    }
    const content = payload.isReapply
      ? `Cửa hàng "${payload.shopName}" vừa nộp lại hồ sơ, đang chờ duyệt.`
      : `Cửa hàng "${payload.shopName}" vừa đăng ký, đang chờ duyệt.`;
    await this.notificationService.createForUsers(
      payload.adminIds,
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

    return [
      toAdmins(WS_EVENTS.SHOP_REGISTERED, {
        shopId: payload.shopId,
        shopName: payload.shopName,
        message: content,
      }),
    ];
  }

  // ==========================================
  // HANDLER: payout.status_changed (báo seller + mail)
  // ==========================================
  private async handlePayoutStatusChanged(
    payload: PayoutStatusChangedOutboxPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
    if (!payload.payoutId || !payload.sellerId || !payload.status) {
      // Redact (sellerEmail/sellerName) khỏi log —cấm log email
      // plain-text. Giữ field cấu trúc để debug lý do poison.
      const safePayload = {
        ...payload,
        sellerEmail: payload.sellerEmail ? "[redacted]" : null,
        sellerName: payload.sellerName ? "[redacted]" : null,
      };
      throw new PoisonPayloadError(
        `payout.status_changed payload thiếu field: ${JSON.stringify(safePayload)}`,
      );
    }
    const isApproved = payload.status === PayoutStatus.COMPLETED;
    const content = isApproved
      ? `Yêu cầu rút tiền trị giá ${payload.amount.toLocaleString("vi-VN")}đ đã được phê duyệt thành công.`
      : `Yêu cầu rút tiền trị giá ${payload.amount.toLocaleString("vi-VN")}đ đã bị từ chối. Lý do: ${payload.reason}`;

    // Tạo notif TRƯỚC (nguồn sự thật) — nằm trong txn, quyết định commit + WS emit.
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

    // Mail best-effort, FIRE-AND-FORGET: không await → txn commit + WS emit chạy ngay
    // → toast payout realtime, không chờ SMTP. sendPayoutStatusEmail tự nuốt lỗi;
    // .catch phòng trường hợp timeout reject.
    void this.mailService
      .sendPayoutStatusEmail(
        { email: payload.sellerEmail, username: payload.sellerName },
        payload.shopName,
        payload.amount,
        payload.status,
        payload.reason,
      )
      .catch((error) => {
        this.logger.error(
          `[payout mail] Gửi thất bại (payout ${payload.payoutId}): ${error?.message ?? error}`,
        );
      });

    return [
      toUser(payload.sellerId, WS_EVENTS.PAYOUT_STATUS_CHANGED, {
        payoutId: payload.payoutId,
        amount: payload.amount,
        status: payload.status,
        message: content,
      }),
    ];
  }

  // ==========================================
  // HANDLER: return.requested (báo seller)
  // ==========================================
  private async handleReturnRequested(
    payload: ReturnRequestedOutboxPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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

    if (!payload.sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không có seller trong payload — bỏ return.requested.`,
      );
      return [];
    }

    await this.notificationService.create(
      {
        userId: payload.sellerId,
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

    return [
      toShop(payload.shopId, WS_EVENTS.RETURN_REQUESTED, {
        returnId: payload.returnId,
        subOrderId: payload.subOrderId,
        orderNumber: payload.orderNumber,
        message: `Yêu cầu trả hàng mới cho đơn ${payload.orderNumber}`,
      }),
    ];
  }

  // ==========================================
  // HANDLER: return.status_changed (báo customer)
  // ==========================================
  private async handleReturnStatusChanged(
    payload: ReturnStatusChangedOutboxPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
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

    return [
      toUser(payload.customerId, WS_EVENTS.RETURN_STATUS_CHANGED, {
        returnId: payload.returnId,
        subOrderId: payload.subOrderId,
        orderNumber: payload.orderNumber,
        status: payload.status,
        message: content,
      }),
    ];
  }

  // ==========================================
  // HANDLER: product.moderated (báo seller)
  // ==========================================
  private async handleProductModerated(
    payload: ProductModeratedOutboxPayload,
    manager: EntityManager,
  ): Promise<WsEmit[]> {
    if (
      !payload.productId ||
      !payload.productName ||
      !payload.shopId ||
      !payload.action
    ) {
      // Redact PII (sellerEmail/sellerName) khỏi log — AGENTS.md cấm log email
      // plain-text. Giữ field cấu trúc để debug lý do poison.
      const safePayload = {
        ...payload,
        sellerEmail: payload.sellerEmail ? "[redacted]" : null,
        sellerName: payload.sellerName ? "[redacted]" : null,
      };
      throw new PoisonPayloadError(
        `product.moderated payload thiếu field: ${JSON.stringify(safePayload)}`,
      );
    }

    if (!payload.sellerId) {
      this.logger.warn(
        `[NotificationConsumer] Shop ${payload.shopId} không có seller trong payload — bỏ product.moderated.`,
      );
      return [];
    }

    const isTakenDown = payload.action === ProductModerationAction.TAKEN_DOWN;
    const title = isTakenDown ? "Sản phẩm bị gỡ" : "Sản phẩm được khôi phục";
    const content = isTakenDown
      ? `Sản phẩm "${payload.productName}" đã bị gỡ do vi phạm.${payload.reason ? ` Lý do: ${payload.reason}` : ""}`
      : `Sản phẩm "${payload.productName}" đã được khôi phục và bán trở lại.`;

    await this.notificationService.create(
      {
        userId: payload.sellerId,
        type: NotificationType.PRODUCT_MODERATED,
        title,
        content,
        data: {
          kind: "product_moderated",
          productId: payload.productId,
          productName: payload.productName,
          action: payload.action,
          reason: payload.reason,
        },
      },
      manager,
    );

    // part_02b: email take-down best-effort, FIRE-AND-FORGET — CHỈ khi taken_down
    // và có email. Không await → notif đã commit, WS emit chạy ngay; email tự nuốt
    // lỗi (mirror handlePayoutStatusChanged).
    if (isTakenDown && payload.sellerEmail) {
      void this.mailService
        .sendProductModeratedEmail(
          { email: payload.sellerEmail, username: payload.sellerName ?? "" },
          payload.productName,
          payload.productId,
          payload.reason,
        )
        .catch((error) => {
          this.logger.error(
            `[product.moderated mail] Gửi thất bại (product ${payload.productId}): ${error?.message ?? error}`,
          );
        });
    }

    return [
      toShop(payload.shopId, WS_EVENTS.PRODUCT_MODERATED, {
        productId: payload.productId,
        productName: payload.productName,
        action: payload.action,
        message: content,
      }),
    ];
  }
}
