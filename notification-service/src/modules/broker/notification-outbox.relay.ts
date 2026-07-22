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

  // Publish 1 event → chờ confirm → mark published_at. Lỗi tạm thời → giữ NULL để
  // poll sau thử lại (at-least-once). Unroutable → vẫn mark để rời hàng đợi, đổi
  // lại bằng log error to. Mark lỗi sau publish OK → poll sau republish, monolith
  // dedupe theo eventId (part_03).
  private async publishOne(event: NotificationOutbox): Promise<boolean> {
    const envelope: OutboxEnvelope = {
      eventId: event.id,
      eventType: event.event_type,
      occurredAt: event.created_at,
      payload: event.payload,
    };

    const result = await this.rabbitMq.publishWithConfirm(
      NOTIFICATIONS_EXCHANGE,
      event.event_type,
      envelope,
    );

    // Lỗi TẠM THỜI → giữ published_at NULL, vòng poll sau thử lại.
    if (result === "failed") {
      return false;
    }

    // Lỗi VĨNH VIỄN: thử lại vô nghĩa, mà giữ row lại thì đủ RELAY_BATCH_SIZE row
    // như vậy là chiếm trọn mọi batch → chặn đứng chiều NS→monolith. Cho rời hàng
    // đợi + log to. Vá thật = thêm pattern binding ở monolith (projection consumer
    // bind chuỗi CHÍNH XÁC 'notification.created', không phải wildcard).
    if (result === "unroutable") {
      this.logger.error(
        `[NotificationOutboxRelay] Event ${event.id} (${event.event_type}) KHÔNG ĐỊNH TUYẾN ĐƯỢC — bỏ qua để không chặn hàng đợi. Kiểm tra binding phía monolith.`,
      );
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
      if (result === "ok") {
        this.logger.log(
          `[NotificationOutboxRelay] Event ${event.id} (${event.event_type}) → published`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[NotificationOutboxRelay] Event ${event.id} publish OK nhưng mark lỗi: ${(err as Error).message}`,
      );
    }
    return result === "ok";
  }
}
