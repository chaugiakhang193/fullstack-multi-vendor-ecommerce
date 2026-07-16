import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { NotificationOutbox } from "@/entities/notification-outbox.entity";
import { RabbitMqService } from "@/modules/broker/rabbitmq.service";

// Exchange NS→monolith (publisher tự declare qua publishWithConfirm).
const NOTIFICATIONS_EXCHANGE = "notifications.events";

// @Interval() cần hằng compile-time (không dùng `this`).
const RELAY_POLL_INTERVAL_MS = 5000;
const RELAY_BATCH_SIZE = 20;

// Envelope — monolith dùng eventId (=outbox row id) làm khoá idempotency.
interface OutboxEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
}

// Polling publisher phía NS (mirror OutboxRelay monolith, chiều ngược). Poll row
// notification_outbox chưa publish → publishWithConfirm → mark published_at.
// KHÔNG poke (monolith luôn warm).
@Injectable()
export class NotificationOutboxRelay {
  private readonly logger = new Logger(NotificationOutboxRelay.name);
  private isProcessing = false;

  constructor(
    @InjectRepository(NotificationOutbox)
    private readonly outboxRepo: Repository<NotificationOutbox>,
    private readonly dataSource: DataSource,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  @Interval(RELAY_POLL_INTERVAL_MS)
  async relayOutbox(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const events = await this.claimBatch();
      for (const event of events) {
        await this.publishOne(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Claim batch chưa publish bằng FOR UPDATE SKIP LOCKED (an toàn nếu >1 instance).
  private async claimBatch(): Promise<NotificationOutbox[]> {
    try {
      return await this.dataSource.transaction((manager) =>
        manager
          .createQueryBuilder(NotificationOutbox, "e")
          .where("e.published_at IS NULL")
          .orderBy("e.created_at", "ASC")
          .limit(RELAY_BATCH_SIZE)
          .setLock("pessimistic_write")
          .setOnLocked("skip_locked")
          .getMany(),
      );
    } catch (err) {
      this.logger.error(
        `[NotificationOutboxRelay] Claim lỗi: ${(err as Error).message}`,
      );
      return [];
    }
  }

  // Publish 1 event → chờ confirm → mark published_at. Publish fail → giữ NULL để
  // poll sau thử lại (at-least-once). Mark lỗi sau publish OK → poll sau republish,
  // monolith dedupe theo eventId (part_03).
  private async publishOne(event: NotificationOutbox): Promise<boolean> {
    const envelope: OutboxEnvelope = {
      eventId: event.id,
      eventType: event.event_type,
      occurredAt: event.created_at,
      payload: event.payload,
    };

    const confirmed = await this.rabbitMq.publishWithConfirm(
      NOTIFICATIONS_EXCHANGE,
      event.event_type,
      envelope,
    );
    if (!confirmed) {
      return false;
    }

    try {
      await this.outboxRepo
        .createQueryBuilder()
        .update(NotificationOutbox)
        .set({
          published_at: () => "now()",
          publish_attempts: () => "publish_attempts + 1",
        })
        .where("id = :id", { id: event.id })
        .andWhere("published_at IS NULL")
        .execute();
      this.logger.log(
        `[NotificationOutboxRelay] Event ${event.id} (${event.event_type}) → published`,
      );
    } catch (err) {
      this.logger.warn(
        `[NotificationOutboxRelay] Event ${event.id} publish OK nhưng mark lỗi: ${(err as Error).message}`,
      );
    }
    return true;
  }
}
