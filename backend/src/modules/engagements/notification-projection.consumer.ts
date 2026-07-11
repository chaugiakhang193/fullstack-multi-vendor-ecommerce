import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { RabbitMqService } from '@/modules/broker/rabbitmq.service';
import { NotificationService } from '@/modules/engagements/notification.service';
import { ProcessedEvent } from '@/modules/engagements/entities/processed-event.entity';
import {
  NOTIFICATION_CREATED_EVENT,
  NotificationCreatedPayload,
} from '@/modules/engagements/notification-inbound.events';
import type * as amqplib from 'amqplib';

const NOTIFICATIONS_EXCHANGE = 'notifications.events';
const PROJECTION_QUEUE = 'notification_read.q';
const PREFETCH = 10;

interface InboundEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: NotificationCreatedPayload;
}

// Đầu nhận CQRS (part_03): nghe notification.created từ NS → dedupe theo eventId
// → upsert notification_read (read model). onApplicationBootstrap để chắc chắn
// RabbitMqService.onModuleInit (connect) đã xong. Idle ở inprocess (NS không phát
// notification.created khi inprocess) nên KHÔNG cần gate mode. KHÔNG emit WS.
@Injectable()
export class NotificationProjectionConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationProjectionConsumer.name);

  constructor(
    private readonly rabbitMq: RabbitMqService,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMq.consume(
      {
        exchange: NOTIFICATIONS_EXCHANGE,
        queue: PROJECTION_QUEUE,
        patterns: [NOTIFICATION_CREATED_EVENT],
        prefetch: PREFETCH,
      },
      (msg, channel) => this.handleMessage(msg, channel),
    );
  }

  private async handleMessage(
    msg: amqplib.ConsumeMessage,
    channel: amqplib.Channel,
  ): Promise<void> {
    let envelope: InboundEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as InboundEnvelope;
      if (!envelope.eventId || !envelope.payload?.id) {
        throw new Error('Envelope thiếu eventId/payload.id');
      }
    } catch (err) {
      // Body hỏng — không dedupe/upsert được, bỏ (không có DLQ cho projection).
      this.logger.error(
        `[ProjectionConsumer] Envelope không hợp lệ: ${(err as Error).message}`,
      );
      channel.ack(msg);
      return;
    }

    const { eventId, payload } = envelope;

    try {
      const already = await this.processedEventRepo.findOne({
        where: { event_id: eventId },
      });
      if (already) {
        this.logger.log(
          `[ProjectionConsumer] Event ${eventId} đã xử lý — skip (dedupe).`,
        );
        channel.ack(msg);
        return;
      }

      await this.dataSource.transaction(async (manager) => {
        await manager.insert(ProcessedEvent, { event_id: eventId });
        await this.notificationService.upsertProjection(payload, manager);
      });
      this.logger.log(
        `[ProjectionConsumer] Event ${eventId} → projection upserted (notif ${payload.id}).`,
      );
      channel.ack(msg);
    } catch (error) {
      const code = error as { driverError?: { code?: string }; code?: string };
      // Race dedupe: redelivery khác đã insert processed_events trước → đã xử lý.
      if (code.code === '23505' || code.driverError?.code === '23505') {
        this.logger.log(
          `[ProjectionConsumer] Event ${eventId} dedupe race — coi như đã xử lý.`,
        );
        channel.ack(msg);
        return;
      }
      // Lỗi khác (FK user không tồn tại, DB tạm...): retry 1 lần rồi bỏ (né poison
      // loop — projection không có DLQ; miss 1 row có thể rebuild lại sau).
      if (msg.fields.redelivered) {
        this.logger.error(
          `[ProjectionConsumer] Event ${eventId} lỗi sau redelivery, BỎ: ${(error as Error).message}`,
        );
        channel.ack(msg);
      } else {
        this.logger.warn(
          `[ProjectionConsumer] Event ${eventId} lỗi tạm, requeue 1 lần: ${(error as Error).message}`,
        );
        channel.nack(msg, false, true);
      }
    }
  }
}
