// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';

// TypeORM
import { DataSource, EntityManager, Repository } from 'typeorm';

// Entities
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';

// Enums & Constants
import {
  OutboxEventStatus,
  NotificationType,
  OrderStatus,
  PayoutStatus,
} from '@/common/enums';
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
} from '@/common/constants/outbox.constants';

// Internal
import { NotificationGateway } from './notification.gateway';
import {
  NotificationService,
  CreateNotificationDto,
} from './notification.service';
import {
  WS_EVENTS,
  OrderNewWsPayload,
  OrderStatusChangedWsPayload,
  ReviewNewWsPayload,
  ReviewRepliedWsPayload,
} from './notification.events';
import { ShopsService } from '@/modules/shops/shops.service';
import { UsersService } from '@/modules/users/users.service';
import { MailService } from '@/modules/mail/mail.service';

// Tham số tuning của OutboxWorker. Để module-level const (không class field) vì
// @Interval() là decorator — đối số phải là hằng compile-time, không dùng được `this`.
const OUTBOX_POLL_INTERVAL_MS = 8000; // 8s — cân bằng độ trễ thông báo vs tải DB do poll
const OUTBOX_BATCH_SIZE = 10; // trần số event xử lý mỗi lần quét

// Chỉ nhặt đúng các event_type mà worker này biết xử lý.
const HANDLED_EVENT_TYPES: string[] = [
  OUTBOX_EVENT_TYPES.ORDER_CREATED,
  OUTBOX_EVENT_TYPES.ORDER_CANCELLED,
  OUTBOX_EVENT_TYPES.ORDER_STATUS_UPDATED,
  OUTBOX_EVENT_TYPES.REVIEW_CREATED,
  OUTBOX_EVENT_TYPES.REVIEW_REPLIED,
  OUTBOX_EVENT_TYPES.PAYOUT_CREATED,
  OUTBOX_EVENT_TYPES.PAYOUT_STATUS_CHANGED,
  OUTBOX_EVENT_TYPES.SHOP_REGISTERED,
];

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  // Guard chống concurrent invocation trong cùng một process.
  // Nếu lần xử lý trước chưa xong khi @Interval fire tiếp, bỏ qua lần này.
  private isProcessing = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,

    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,

    private readonly notificationGateway: NotificationGateway,
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
    private readonly shopsService: ShopsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  @Interval(OUTBOX_POLL_INTERVAL_MS)
  async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      const pendingStatus = OutboxEventStatus.PENDING;
      const events = await this.outboxRepo
        .createQueryBuilder('e')
        .where('e.status = :status', { status: pendingStatus })
        .andWhere('e.event_type IN (:...types)', { types: HANDLED_EVENT_TYPES })
        .orderBy('e.created_at', 'ASC')
        .limit(OUTBOX_BATCH_SIZE)
        .getMany()
        .catch((err: Error) => {
          this.logger.error(`[OutboxWorker] Query lỗi: ${err.message}`);
          return [] as OutboxEvent[];
        });

      for (const event of events) {
        await this.processOneEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processOneEvent(event: OutboxEvent): Promise<void> {
    // Mỗi event có transaction riêng: thành công → PROCESSED; payload hỏng → FAILED;
    // lỗi tạm thời (DB/network) → giữ PENDING để retry lần sau.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (event.event_type === OUTBOX_EVENT_TYPES.ORDER_CREATED) {
        await this.handleOrderCreated(event, queryRunner.manager);
      } else if (event.event_type === OUTBOX_EVENT_TYPES.ORDER_CANCELLED) {
        await this.handleOrderCancelled(event, queryRunner.manager);
      } else if (event.event_type === OUTBOX_EVENT_TYPES.ORDER_STATUS_UPDATED) {
        await this.handleOrderStatusUpdated(event, queryRunner.manager);
      } else if (event.event_type === OUTBOX_EVENT_TYPES.REVIEW_CREATED) {
        await this.handleReviewCreated(event, queryRunner.manager);
      } else if (event.event_type === OUTBOX_EVENT_TYPES.REVIEW_REPLIED) {
        await this.handleReviewReplied(event, queryRunner.manager);
      } else if (event.event_type === OUTBOX_EVENT_TYPES.PAYOUT_CREATED) {
        await this.handlePayoutCreated(event, queryRunner.manager);
      } else if (
        event.event_type === OUTBOX_EVENT_TYPES.PAYOUT_STATUS_CHANGED
      ) {
        await this.handlePayoutStatusChanged(event, queryRunner.manager);
      } else if (event.event_type === OUTBOX_EVENT_TYPES.SHOP_REGISTERED) {
        await this.handleShopRegistered(event, queryRunner.manager);
      } else {
        throw new TypeError(
          `Event type không được hỗ trợ: ${event.event_type}`,
        );
      }

      const processedUpdate = {
        status: OutboxEventStatus.PROCESSED,
        processed_at: new Date(),
      };
      await queryRunner.manager.update(OutboxEvent, event.id, processedUpdate);

      await queryRunner.commitTransaction();
      this.logger.log(
        `[OutboxWorker] Event ${event.id} (${event.event_type}) → PROCESSED`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (error instanceof TypeError) {
        // Payload hỏng → FAILED, không retry vì sẽ fail mãi.
        const failedUpdate = {
          status: OutboxEventStatus.FAILED,
          error_message: `Payload không hợp lệ: ${error.message}`,
        };
        await this.outboxRepo.update(event.id, failedUpdate);
        this.logger.error(
          `[OutboxWorker] Event ${event.id} → FAILED (payload hỏng): ${error.message}`,
        );
      } else {
        // Lỗi tạm thời: DB timeout, network... → giữ PENDING để retry.
        const tempErrorUpdate = {
          error_message: (error as Error).message,
        };
        await this.outboxRepo.update(event.id, tempErrorUpdate);
        this.logger.warn(
          `[OutboxWorker] Event ${event.id} → giữ PENDING (lỗi tạm thời): ${(error as Error).message}`,
        );
      }
    } finally {
      await queryRunner.release();
    }
  }

  // ==========================================
  // HANDLER: order.created
  // ==========================================
  private async handleOrderCreated(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const payload = event.payload as OrderCreatedPayload;

    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !Array.isArray(payload.shopIds) ||
      !payload.userId
    ) {
      throw new TypeError(
        `Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`,
      );
    }

    // Lưu notification cho Customer kể cả khi chưa online —
    // Notification Bell sẽ đọc từ DB này.
    const customerNotificationDto: CreateNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_CREATED,
      title: 'Đặt hàng thành công',
      content: `Đơn hàng ${payload.orderNumber} đã được đặt thành công. Tổng giá trị: ${payload.totalAmount.toLocaleString('vi-VN')}đ`,
      data: {
        kind: 'order_placed',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        amount: payload.totalAmount,
      },
    };
    await this.notificationService.create(customerNotificationDto, manager);

    // Lưu notification + phát WebSocket cho từng Seller.
    for (const shopId of payload.shopIds) {
      const findShopOptions = {
        where: { id: shopId },
        relations: ['seller'],
        select: { id: true, seller: { id: true } },
      };
      const shop = await this.shopRepo.findOne(findShopOptions);

      if (!shop) {
        this.logger.warn(
          `[OutboxWorker] Shop ${shopId} không tồn tại — bỏ qua notification.`,
        );
        continue;
      }

      const sellerNotificationDto: CreateNotificationDto = {
        userId: shop.seller.id,
        type: NotificationType.ORDER_CREATED,
        title: 'Đơn hàng mới',
        content: `Bạn vừa nhận được đơn hàng mới ${payload.orderNumber}.`,
        data: {
          kind: 'order_new_seller',
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
        },
      };
      await this.notificationService.create(sellerNotificationDto, manager);

      // WebSocket fire-and-forget: Seller online nhận real-time,
      // Seller offline vẫn có notification trong DB để đọc sau qua Notification Bell.
      const wsPayload: OrderNewWsPayload = {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        message: `Đơn hàng mới ${payload.orderNumber}`,
      };
      this.notificationGateway.sendToShop(
        shopId,
        WS_EVENTS.ORDER_NEW,
        wsPayload,
      );
    }
  }

  // ==========================================
  // HANDLER: order.cancelled
  // ==========================================
  private async handleOrderCancelled(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const payload = event.payload as OrderCancelledPayload;

    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !payload.subOrderId ||
      !payload.userId ||
      !payload.shopId
    ) {
      throw new TypeError(
        `Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`,
      );
    }

    // Thông báo cho Customer biết đơn con đã được hủy theo yêu cầu.
    const customerNotificationDto: CreateNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Đã hủy đơn hàng con',
      content: `Một shop trong đơn ${payload.orderNumber} đã được hủy theo yêu cầu của bạn.`,
      data: {
        kind: 'suborder_cancelled_customer',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    };
    await this.notificationService.create(customerNotificationDto, manager);

    // Thông báo + WebSocket cho Seller của shop bị hủy.
    const findShopOptions = {
      where: { id: payload.shopId },
      relations: ['seller'],
      select: { id: true, seller: { id: true } },
    };
    const shop = await this.shopRepo.findOne(findShopOptions);

    if (!shop) {
      this.logger.warn(
        `[OutboxWorker] Shop ${payload.shopId} không tồn tại — bỏ qua notification hủy đơn.`,
      );
      return;
    }

    const sellerNotificationDto: CreateNotificationDto = {
      userId: shop.seller.id,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Đơn hàng bị hủy',
      content: `Khách đã hủy 1 đơn hàng con thuộc đơn ${payload.orderNumber}.`,
      data: {
        kind: 'suborder_cancelled_seller',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
      },
    };
    await this.notificationService.create(sellerNotificationDto, manager);

    const wsPayload: OrderStatusChangedWsPayload = {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      subOrderId: payload.subOrderId,
      status: 'cancelled',
      message: `Đơn ${payload.orderNumber} có 1 shop bị hủy`,
    };
    this.notificationGateway.sendToShop(
      payload.shopId,
      WS_EVENTS.ORDER_STATUS_CHANGED,
      wsPayload,
    );
  }

  // ==========================================
  // HANDLER: order.status_updated
  // ==========================================
  private async handleOrderStatusUpdated(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const payload = event.payload as OrderStatusUpdatedPayload;

    if (
      !payload.orderId ||
      !payload.orderNumber ||
      !payload.subOrderId ||
      !payload.userId ||
      !payload.newStatus
    ) {
      throw new TypeError(
        `Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`,
      );
    }

    const statusNotificationDto: CreateNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Cập nhật đơn hàng',
      content: `Một shop trong đơn ${payload.orderNumber} đã chuyển sang trạng thái "${payload.newStatus}".`,
      data: {
        kind: 'suborder_status_changed',
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        status: payload.newStatus as OrderStatus,
      },
    };
    await this.notificationService.create(statusNotificationDto, manager);

    const wsPayload: OrderStatusChangedWsPayload = {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      subOrderId: payload.subOrderId,
      status: payload.newStatus,
      message: `Đơn ${payload.orderNumber} cập nhật: ${payload.newStatus}`,
    };
    this.notificationGateway.sendToUser(
      payload.userId,
      WS_EVENTS.ORDER_STATUS_CHANGED,
      wsPayload,
    );
  }

  // ==========================================
  // HANDLER: review.created
  // ==========================================
  private async handleReviewCreated(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const p = event.payload as ReviewCreatedPayload;
    if (!p.reviewId || !p.productId || !p.productName || !p.shopId) {
      throw new TypeError(
        `Payload review.created thiếu field: ${JSON.stringify(p)}`,
      );
    }

    // Dùng ShopsService thay vì query shopRepo trực tiếp cho review logic
    const shop = await this.shopsService.getShopWithSeller(p.shopId);
    if (!shop) {
      this.logger.warn(
        `[OutboxWorker] Shop ${p.shopId} không tồn tại — bỏ review notif.`,
      );
      return;
    }

    if (!shop.seller || !shop.seller.id) {
      this.logger.warn(
        `[OutboxWorker] Shop ${p.shopId} không có seller liên kết — bỏ review notif.`,
      );
      return;
    }

    await this.notificationService.create(
      {
        userId: shop.seller.id,
        type: NotificationType.REVIEW_CREATED,
        title: 'Đánh giá mới',
        content: `Sản phẩm "${p.productName}" vừa nhận đánh giá ${p.rating}★.`,
        data: {
          kind: 'review_new_seller',
          productId: p.productId,
          productName: p.productName,
        },
      },
      manager,
    );

    const ws: ReviewNewWsPayload = {
      reviewId: p.reviewId,
      productId: p.productId,
      productName: p.productName,
      rating: p.rating,
      message: `Đánh giá mới cho "${p.productName}"`,
    };
    this.notificationGateway.sendToShop(p.shopId, WS_EVENTS.REVIEW_NEW, ws);
  }

  // ==========================================
  // HANDLER: review.replied
  // ==========================================
  private async handleReviewReplied(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const p = event.payload as ReviewRepliedPayload;
    if (!p.reviewId || !p.productId || !p.productName || !p.customerId) {
      throw new TypeError(
        `Payload review.replied thiếu field: ${JSON.stringify(p)}`,
      );
    }

    await this.notificationService.create(
      {
        userId: p.customerId,
        type: NotificationType.REVIEW_REPLIED,
        title: 'Shop đã phản hồi đánh giá',
        content: `Shop đã phản hồi đánh giá của bạn cho "${p.productName}".`,
        data: {
          kind: 'review_replied',
          productId: p.productId,
          productName: p.productName,
        },
      },
      manager,
    );

    const ws: ReviewRepliedWsPayload = {
      reviewId: p.reviewId,
      productId: p.productId,
      productName: p.productName,
      message: `Shop đã phản hồi đánh giá "${p.productName}"`,
    };
    this.notificationGateway.sendToUser(
      p.customerId,
      WS_EVENTS.REVIEW_REPLIED,
      ws,
    );
  }

  // ========== HANDLER: payout.created (báo admin) ==========
  private async handlePayoutCreated(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const p = event.payload as PayoutCreatedOutboxPayload;
    if (
      !p.payoutId ||
      !p.shopId ||
      !p.shopName ||
      typeof p.amount !== 'number'
    ) {
      throw new TypeError(
        `payout.created payload thiếu field: ${JSON.stringify(p)}`,
      );
    }
    const adminIds = await this.usersService.findAdminIds();
    const content = `Cửa hàng ${p.shopName} vừa gửi yêu cầu rút ${p.amount.toLocaleString('vi-VN')}đ.`;
    await this.notificationService.createForUsers(
      adminIds,
      {
        type: NotificationType.PAYOUT_CREATED,
        title: 'Yêu cầu rút tiền mới',
        content,
        data: {
          kind: 'payout_created',
          payoutId: p.payoutId,
          amount: p.amount,
          shopName: p.shopName,
        },
      },
      manager,
    );
    this.notificationGateway.sendToAdmins(WS_EVENTS.PAYOUT_CREATED, {
      payoutId: p.payoutId,
      amount: p.amount,
      shopId: p.shopId,
      shopName: p.shopName,
      message: content,
    });
  }

  // ========== HANDLER: shop.registered (báo admin) ==========
  private async handleShopRegistered(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const p = event.payload as ShopRegisteredOutboxPayload;
    if (!p.shopId || !p.shopName) {
      throw new TypeError(
        `shop.registered payload thiếu field: ${JSON.stringify(p)}`,
      );
    }
    const adminIds = await this.usersService.findAdminIds();
    const content = p.isReapply
      ? `Cửa hàng "${p.shopName}" vừa nộp lại hồ sơ, đang chờ duyệt.`
      : `Cửa hàng "${p.shopName}" vừa đăng ký, đang chờ duyệt.`;
    await this.notificationService.createForUsers(
      adminIds,
      {
        type: NotificationType.SHOP_REGISTERED,
        title: p.isReapply ? 'Shop nộp lại hồ sơ' : 'Shop mới chờ duyệt',
        content,
        data: {
          kind: 'shop_registered',
          shopId: p.shopId,
          shopName: p.shopName,
        },
      },
      manager,
    );
    this.notificationGateway.sendToAdmins(WS_EVENTS.SHOP_REGISTERED, {
      shopId: p.shopId,
      shopName: p.shopName,
      message: content,
    });
  }

  // ========== HANDLER: payout.status_changed (báo seller — thay notifyPayoutResolved) ==========
  private async handlePayoutStatusChanged(
    event: OutboxEvent,
    manager: EntityManager,
  ): Promise<void> {
    const p = event.payload as PayoutStatusChangedOutboxPayload;
    if (!p.payoutId || !p.sellerId || !p.status) {
      throw new TypeError(
        `payout.status_changed payload thiếu field: ${JSON.stringify(p)}`,
      );
    }
    const isApproved = p.status === PayoutStatus.COMPLETED;
    const content = isApproved
      ? `Yêu cầu rút tiền trị giá ${p.amount.toLocaleString('vi-VN')}đ đã được phê duyệt thành công.`
      : `Yêu cầu rút tiền trị giá ${p.amount.toLocaleString('vi-VN')}đ đã bị từ chối. Lý do: ${p.reason}`;

    // Mail best-effort (sendPayoutStatusEmail tự nuốt lỗi bên trong → không chặn PROCESSED).
    await this.mailService.sendPayoutStatusEmail(
      { email: p.sellerEmail, username: p.sellerName },
      p.shopName,
      p.amount,
      p.status,
      p.reason,
    );

    await this.notificationService.create(
      {
        userId: p.sellerId,
        type: NotificationType.PAYOUT_STATUS_CHANGED,
        title: isApproved
          ? 'Yêu cầu rút tiền thành công'
          : 'Yêu cầu rút tiền bị từ chối',
        content,
        data: {
          kind: 'payout_status_changed',
          payoutId: p.payoutId,
          amount: p.amount,
          status: p.status,
          rejectReason: p.reason,
        },
      },
      manager,
    );

    this.notificationGateway.sendToUser(
      p.sellerId,
      WS_EVENTS.PAYOUT_STATUS_CHANGED,
      {
        payoutId: p.payoutId,
        amount: p.amount,
        status: p.status,
        message: content,
      },
    );
  }
}
