// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';

// TypeORM
import { DataSource, Repository } from 'typeorm';

// Entities
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';
import { Shop } from '@/modules/shops/entities/shop.entity';

// Enums & Constants
import { OutboxEventStatus, NotificationType } from '@/common/enums';
import {
  OUTBOX_EVENT_TYPES,
  OrderCreatedPayload,
} from '@/common/constants/outbox.constants';

// Internal
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { WS_EVENTS, OrderNewWsPayload } from './notification.events';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  // Guard chống concurrent invocation trong cùng một process.
  // Nếu lần xử lý trước chưa xong khi @Interval fire tiếp, bỏ qua lần này.
  private isProcessing = false;

  private readonly BATCH_SIZE = 10;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,

    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,

    private readonly notificationGateway: NotificationGateway,
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
  ) {}

  @Interval(8000)
  async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      // Chỉ nhặt event đúng type mà worker này biết xử lý.
      // pessimistic_write_or_fail → FOR UPDATE NOWAIT: nếu row bị lock → throw → catch trả về [].
      const pendingStatus = OutboxEventStatus.PENDING;
      const pendingEventType = OUTBOX_EVENT_TYPES.ORDER_CREATED;
      const events = await this.outboxRepo
        .createQueryBuilder('e')
        .where('e.status = :status', { status: pendingStatus })
        .andWhere('e.event_type = :type', { type: pendingEventType })
        .orderBy('e.created_at', 'ASC')
        .limit(this.BATCH_SIZE)
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
    // Mỗi event có transaction riêng: event thành công → PROCESSED ngay,
    // event thất bại giữ PENDING để retry lần sau — không ảnh hưởng các event khác.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate payload — TypeError nếu hỏng → mark FAILED, không retry.
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
      // Notification Bell (Tuần 2) sẽ đọc từ DB này.
      const customerNotificationDto = {
        userId: payload.userId,
        type: NotificationType.ORDER_CREATED,
        title: 'Đặt hàng thành công',
        content: `Đơn hàng ${payload.orderNumber} đã được đặt thành công. Tổng giá trị: ${payload.totalAmount.toLocaleString('vi-VN')}đ`,
      };
      await this.notificationService.create(
        customerNotificationDto,
        queryRunner.manager,
      );

      // Lưu notification + phát WebSocket cho mỗi Seller
      for (const shopId of payload.shopIds) {
        // Query seller.id từ shopId vì seller.id không có trong outbox payload.
        const findShopOptions = {
          where: { id: shopId },
          relations: ['seller'],
          select: { id: true, seller: { id: true } },
        };
        const shop = await this.shopRepo.findOne(findShopOptions);

        if (!shop) {
          this.logger.warn(
            `[OutboxWorker] Shop ${shopId} không tồn tại — bỏ qua notification cho shop này.`,
          );
          continue;
        }

        const sellerNotificationDto = {
          userId: shop.seller.id,
          type: NotificationType.ORDER_CREATED,
          title: 'Đơn hàng mới',
          content: `Bạn vừa nhận được đơn hàng mới ${payload.orderNumber}.`,
        };
        await this.notificationService.create(
          sellerNotificationDto,
          queryRunner.manager,
        );

        // WebSocket fire-and-forget: Seller online nhận real-time,
        // Seller offline vẫn có notification trong DB để đọc sau qua Notification Bell.
        const wsPayload: OrderNewWsPayload = {
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          message: `Đơn hàng mới ${payload.orderNumber}`,
        };
        this.notificationGateway.sendToShop(shopId, WS_EVENTS.ORDER_NEW, wsPayload);
      }

      // Mark PROCESSED chỉ sau khi toàn bộ notifications đã lưu thành công trong transaction.
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
        // Lỗi vĩnh viễn: payload hỏng, retry vô nghĩa → mark FAILED.
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
}
