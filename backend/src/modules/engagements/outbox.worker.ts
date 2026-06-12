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
import { OutboxEventStatus, NotificationType } from '@/common/enums';
import {
  OUTBOX_EVENT_TYPES,
  OrderCreatedPayload,
  OrderCancelledPayload,
  OrderStatusUpdatedPayload,
} from '@/common/constants/outbox.constants';

// Internal
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import {
  WS_EVENTS,
  OrderNewWsPayload,
  OrderStatusChangedWsPayload,
} from './notification.events';

// Tham số tuning của OutboxWorker. Để module-level const (không class field) vì
// @Interval() là decorator — đối số phải là hằng compile-time, không dùng được `this`.
const OUTBOX_POLL_INTERVAL_MS = 8000; // 8s — cân bằng độ trễ thông báo vs tải DB do poll
const OUTBOX_BATCH_SIZE = 10; // trần số event xử lý mỗi lần quét

// Chỉ nhặt đúng các event_type mà worker này biết xử lý.
const HANDLED_EVENT_TYPES: string[] = [
  OUTBOX_EVENT_TYPES.ORDER_CREATED,
  OUTBOX_EVENT_TYPES.ORDER_CANCELLED,
  OUTBOX_EVENT_TYPES.ORDER_STATUS_UPDATED,
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
  ) {}

  @Interval(OUTBOX_POLL_INTERVAL_MS)
  async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      // pessimistic_write_or_fail → FOR UPDATE NOWAIT: row đang bị lock → throw → [].
      const pendingStatus = OutboxEventStatus.PENDING;
      const events = await this.outboxRepo
        .createQueryBuilder('e')
        .where('e.status = :status', { status: pendingStatus })
        .andWhere('e.event_type IN (:...types)', { types: HANDLED_EVENT_TYPES })
        .orderBy('e.created_at', 'ASC')
        .limit(OUTBOX_BATCH_SIZE)
        .setLock('pessimistic_write_or_fail')
        .getMany()
        .catch(() => [] as OutboxEvent[]);

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
      } else {
        throw new TypeError(`Event type không được hỗ trợ: ${event.event_type}`);
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
    const customerNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_CREATED,
      title: 'Đặt hàng thành công',
      content: `Đơn hàng ${payload.orderNumber} đã được đặt thành công. Tổng giá trị: ${payload.totalAmount.toLocaleString('vi-VN')}đ`,
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

      const sellerNotificationDto = {
        userId: shop.seller.id,
        type: NotificationType.ORDER_CREATED,
        title: 'Đơn hàng mới',
        content: `Bạn vừa nhận được đơn hàng mới ${payload.orderNumber}.`,
      };
      await this.notificationService.create(sellerNotificationDto, manager);

      // WebSocket fire-and-forget: Seller online nhận real-time,
      // Seller offline vẫn có notification trong DB để đọc sau qua Notification Bell.
      const wsPayload: OrderNewWsPayload = {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        message: `Đơn hàng mới ${payload.orderNumber}`,
      };
      this.notificationGateway.sendToShop(shopId, WS_EVENTS.ORDER_NEW, wsPayload);
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
    const customerNotificationDto = {
      userId: payload.userId,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Đã hủy đơn hàng con',
      content: `Một shop trong đơn ${payload.orderNumber} đã được hủy theo yêu cầu của bạn.`,
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

    const sellerNotificationDto = {
      userId: shop.seller.id,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Đơn hàng bị hủy',
      content: `Khách đã hủy 1 đơn hàng con thuộc đơn ${payload.orderNumber}.`,
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
      throw new TypeError(`Payload thiếu field bắt buộc: ${JSON.stringify(payload)}`);
    }

    await this.notificationService.create(
      {
        userId: payload.userId,
        type: NotificationType.ORDER_STATUS_CHANGED,
        title: 'Cập nhật đơn hàng',
        content: `Một shop trong đơn ${payload.orderNumber} đã chuyển sang trạng thái "${payload.newStatus}".`,
      },
      manager,
    );

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
}
