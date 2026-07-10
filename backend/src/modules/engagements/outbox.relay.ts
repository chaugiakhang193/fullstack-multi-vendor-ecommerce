// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

// TypeORM
import { DataSource, Repository } from 'typeorm';

// Entities
import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';

// Constants
import { OUTBOX_EVENT_TYPES } from '@/common/constants/outbox.constants';

// Broker
import { RabbitMqService } from '@/modules/broker/rabbitmq.service';

// Topic exchange chung backend↔NS (publisher declare, xem RabbitMqService.publishWithConfirm).
const RELAY_EXCHANGE = 'ecommerce.events';

// Tuning relay. Module-level const vì @Interval() cần hằng compile-time (không dùng `this`).
const RELAY_POLL_INTERVAL_MS = 8000; // 8s — cùng nhịp với OutboxWorker cũ
const RELAY_BATCH_SIZE = 10;

// Chỉ relay đúng các event_type mà pipeline notification biết xử lý — khớp
// HANDLED_EVENT_TYPES của OutboxWorker để hai trục shadow đi song song.
const HANDLED_EVENT_TYPES: string[] = [
  OUTBOX_EVENT_TYPES.ORDER_CREATED,
  OUTBOX_EVENT_TYPES.ORDER_CANCELLED,
  OUTBOX_EVENT_TYPES.ORDER_STATUS_UPDATED,
  OUTBOX_EVENT_TYPES.REVIEW_CREATED,
  OUTBOX_EVENT_TYPES.REVIEW_REPLIED,
  OUTBOX_EVENT_TYPES.PAYOUT_CREATED,
  OUTBOX_EVENT_TYPES.PAYOUT_STATUS_CHANGED,
  OUTBOX_EVENT_TYPES.SHOP_REGISTERED,
  OUTBOX_EVENT_TYPES.RETURN_REQUESTED,
  OUTBOX_EVENT_TYPES.RETURN_STATUS_CHANGED,
];

// Envelope đẩy lên broker — NS dùng `eventId` làm khoá idempotency.
interface OutboxEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
}

// Relay(shadow): publish event outbox MỚI lên topic exchange với publisher
// confirm, rồi mark `published_at`. Trục ĐỘC LẬP với OutboxWorker (cột `status`) —
// worker cũ vẫn tạo notif; relay chỉ đẩy message để NS log. Gated bởi cờ
// NOTIFICATION_RELAY_ENABLED (default off) → deploy 0 tác động cho tới khi bật.
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);

  // Guard chống concurrent invocation trong cùng process (như OutboxWorker).
  private isProcessing = false;

  // Guard chống poke chồng nhau — 1 poke có thể giữ kết nối ~60s (cold-start NS).
  private isPoking = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
    private readonly rabbitMq: RabbitMqService,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(): boolean {
    return (
      this.configService.get<string>('NOTIFICATION_RELAY_ENABLED') === 'true'
    );
  }

  @Interval(RELAY_POLL_INTERVAL_MS)
  async relayOutbox(): Promise<void> {
    // Tắt cờ = relay im lặng hoàn toàn (không query, không publish).
    if (!this.isEnabled() || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      const events = await this.claimBatch();
      if (events.length === 0) {
        return;
      }

      let publishedCount = 0;
      for (const event of events) {
        const published = await this.publishOne(event);
        if (published) {
          publishedCount++;
        }
      }

      // Poke NS đúng 1 lần/batch có publish — NGOÀI đường mark, fire-and-forget.
      if (publishedCount > 0) {
        this.pokeNotificationService();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Claim batch event chưa relay bằng FOR UPDATE SKIP LOCKED (tránh 2 vòng/instance
  // giành cùng row). Lock chỉ giữ trong tx đọc này; publish + mark làm NGOÀI tx.
  private async claimBatch(): Promise<OutboxEvent[]> {
    try {
      return await this.dataSource.transaction((manager) =>
        manager
          .createQueryBuilder(OutboxEvent, 'e')
          .where('e.published_at IS NULL')
          .andWhere('e.event_type IN (:...types)', {
            types: HANDLED_EVENT_TYPES,
          })
          .orderBy('e.created_at', 'ASC')
          .limit(RELAY_BATCH_SIZE)
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany(),
      );
    } catch (err) {
      this.logger.error(`[OutboxRelay] Claim lỗi: ${(err as Error).message}`);
      return [];
    }
  }

  // Publish 1 event → chờ confirm → mark published_at. Trả true nếu đã publish
  // (kể cả khi mark lỗi — event đã lên broker). Publish thất bại → giữ NULL để
  // vòng poll sau thử lại (at-least-once).
  private async publishOne(event: OutboxEvent): Promise<boolean> {
    const envelope: OutboxEnvelope = {
      eventId: event.id,
      eventType: event.event_type,
      occurredAt: event.created_at,
      payload: event.payload,
    };

    const confirmed = await this.rabbitMq.publishWithConfirm(
      RELAY_EXCHANGE,
      event.event_type,
      envelope,
    );
    if (!confirmed) {
      return false;
    }

    try {
      // Mark CHỈ sau confirm. Guard `published_at IS NULL` → mark idempotent nếu
      // event vô tình bị nhặt trùng.
      await this.outboxRepo
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({
          published_at: () => 'now()',
          publish_attempts: () => 'publish_attempts + 1',
        })
        .where('id = :id', { id: event.id })
        .andWhere('published_at IS NULL')
        .execute();
      this.logger.log(
        `[OutboxRelay] Event ${event.id} (${event.event_type}) → published`,
      );
    } catch (err) {
      // Đã publish nhưng mark lỗi (crash/DB) → poll sau republish, NS dedupe theo
      // eventId (Phase 4). Vẫn tính đã publish để poke NS.
      this.logger.warn(
        `[OutboxRelay] Event ${event.id} publish OK nhưng mark lỗi: ${(err as Error).message}`,
      );
    }
    return true;
  }

  // Đánh thức NS (Render scale-to-zero) sau khi có message durable trong RabbitMQ.
  // Fire-and-forget: message đã an toàn ở broker, poke chỉ giảm latency — mọi lỗi nuốt.
  private pokeNotificationService(): void {
    const url = this.configService.get<string>('NOTIFICATION_SERVICE_URL');
    // Bỏ qua nếu chưa khai URL hoặc đang có 1 poke chạy (NS thức 1 lần là đủ).
    if (!url || this.isPoking) {
      return;
    }

    // NS scale-to-zero: Render cold-start tới ~50s. PHẢI giữ kết nối đủ lâu để
    // Render dựng xong NS — abort sớm (3s) khiến Render huỷ spin-up giữa chừng
    // → NS không bao giờ thức → message nằm chờ mãi trong queue. Timeout 60s.
    this.isPoking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    fetch(`${url}/health`, { signal: controller.signal })
      .then(() => {
        this.logger.debug('[OutboxRelay] Poke NS /health OK');
      })
      .catch((err: Error) => {
        this.logger.debug(`[OutboxRelay] Poke NS bỏ qua: ${err.message}`);
      })
      .finally(() => {
        clearTimeout(timeout);
        this.isPoking = false;
      });
  }
}
