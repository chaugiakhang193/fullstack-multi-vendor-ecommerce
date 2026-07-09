// NestJS
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";

// TypeORM
import { DataSource, Repository } from "typeorm";

// RabbitMQ client
import * as amqplib from "amqplib";

// Internal
import { ProcessedEvent } from "@/entities/processed-event.entity";
import { NotificationConsumerService } from "@/consumer/notification-consumer.service";
import { PoisonPayloadError } from "@/consumer/poison-payload.error";

// Topology — consumer declare queue + binding (publisher declare exchange).
const EVENTS_EXCHANGE = "ecommerce.events";
const NOTIFICATIONS_QUEUE = "notifications.q";
// Nhận mọi event notification-relevant. notifications.q GIỮ arg-free (Phase 3
// quyết định P3-4) — retry/DLQ app-driven qua DLX riêng, KHÔNG dùng
// x-dead-letter-exchange trên chính queue này (né 406 nếu đổi args về sau).
const BINDING_PATTERNS = [
  "order.*",
  "review.*",
  "payout.*",
  "return.*",
  "shop.*",
];

// Retry/DLQ app-driven (P4-5). DLX là direct exchange riêng — consumer TỰ
// publish sang đây (KHÔNG dùng nack/broker-driven DLX trên notifications.q).
const RETRY_EXCHANGE = "notifications.dlx";
const RETRY_QUEUE = "notifications.retry";
const DLQ_QUEUE = "notifications.dlq";
const RETRY_TTL_MS = 30000;
const MAX_RETRY = 5;
const PREFETCH = 10;

interface OutboxEnvelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: unknown;
}

// Kết nối RabbitMQ + consumer notifications.q. Mode-gating (P4-6):
// NOTIFICATION_MODE=distributed → dedupe (processed_events) + dispatch handler
// (NotificationConsumerService) trong 1 transaction rồi ack; ngoài ra (kể cả
// 'inprocess') → log-only ack (Phase 3 behavior, worker cũ ở backend vẫn tạo
// notif). Connect + setup non-fatal: broker chưa sẵn sàng thì service vẫn
// boot, /health vẫn 200.
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.ChannelModel | null = null;
  private consumerChannel: amqplib.Channel | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly notificationConsumer: NotificationConsumerService,
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
  ) {}

  private isDistributed(): boolean {
    return (
      this.configService.get<string>("NOTIFICATION_MODE") === "distributed"
    );
  }

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>("RABBITMQ_URL");
    if (!url) {
      this.logger.warn(
        "[RabbitMqService] RABBITMQ_URL chưa khai — bỏ qua kết nối.",
      );
      return;
    }

    try {
      this.connection = await amqplib.connect(url);
      this.connection.on("error", (err: Error) => {
        this.logger.error(`[RabbitMqService] Connection lỗi: ${err.message}`);
        this.connection = null;
      });
      this.connection.on("close", () => {
        this.logger.warn("[RabbitMqService] Connection đóng.");
        this.connection = null;
        this.consumerChannel = null;
      });
      this.logger.log("[RabbitMqService] Kết nối RabbitMQ thành công.");

      await this.setupConsumer();
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Kết nối RabbitMQ thất bại: ${(error as Error).message}`,
      );
      this.connection = null;
    }
  }

  // Declare notifications.q (arg-free, durable) + binding trên ecommerce.events
  // + topology retry/DLQ (dlx/.retry/.dlq), rồi consume. Toàn bộ trong try →
  // non-fatal.
  private async setupConsumer(): Promise<void> {
    if (!this.connection) {
      return;
    }
    try {
      const channel = await this.connection.createChannel();
      await channel.prefetch(PREFETCH);

      // Publisher (backend relay) mới là bên declare exchange; assert idempotent
      // ở đây để consumer khởi động trước relay vẫn không lỗi.
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
      // Queue arg-free — bất biến, xem ghi chú trên const NOTIFICATIONS_QUEUE.
      await channel.assertQueue(NOTIFICATIONS_QUEUE, { durable: true });
      for (const pattern of BINDING_PATTERNS) {
        await channel.bindQueue(NOTIFICATIONS_QUEUE, EVENTS_EXCHANGE, pattern);
      }

      // Retry/DLQ topology — declare 1 lần, idempotent (assert).
      await channel.assertExchange(RETRY_EXCHANGE, "direct", { durable: true });
      await channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        arguments: {
          "x-message-ttl": RETRY_TTL_MS,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": NOTIFICATIONS_QUEUE,
        },
      });
      await channel.bindQueue(RETRY_QUEUE, RETRY_EXCHANGE, "retry");
      // Parking-lot: durable, KHÔNG consumer — chỉ để inspect/replay thủ công.
      await channel.assertQueue(DLQ_QUEUE, { durable: true });
      await channel.bindQueue(DLQ_QUEUE, RETRY_EXCHANGE, "dlq");

      await channel.consume(NOTIFICATIONS_QUEUE, (msg) => {
        if (!msg) {
          return;
        }
        this.handleMessage(channel, msg).catch((err: Error) => {
          this.logger.error(
            `[RabbitMqService] handleMessage lỗi không bắt được: ${err.message}`,
          );
          channel.ack(msg);
        });
      });

      this.consumerChannel = channel;
      this.logger.log(
        `[RabbitMqService] Consumer online — queue=${NOTIFICATIONS_QUEUE}.`,
      );
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Setup consumer thất bại: ${(error as Error).message}`,
      );
      this.consumerChannel = null;
    }
  }

  private async handleMessage(
    channel: amqplib.Channel,
    msg: amqplib.ConsumeMessage,
  ): Promise<void> {
    const routingKey = msg.fields.routingKey;

    let envelope: OutboxEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as OutboxEnvelope;
      if (!envelope.eventId || !envelope.eventType) {
        throw new Error("Envelope thiếu eventId/eventType");
      }
    } catch (err) {
      // Body không phải JSON envelope hợp lệ — không dedupe được, poison thẳng.
      this.logger.error(
        `[RabbitMqService] Envelope không hợp lệ rk=${routingKey}: ${(err as Error).message}`,
      );
      channel.publish(RETRY_EXCHANGE, "dlq", msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
      channel.ack(msg);
      return;
    }

    const { eventId, eventType, payload } = envelope;

    if (!this.isDistributed()) {
      // inprocess (default) — worker cũ ở backend tạo notif, NS chỉ log (Phase 3).
      this.logger.log(
        `[RabbitMqService] Nhận event rk=${routingKey} eventId=${eventId} eventType=${eventType} (inprocess — log-only)`,
      );
      channel.ack(msg);
      return;
    }

    try {
      // Dedupe check NẰM TRONG try: nếu DB chớp lỗi lúc đọc processed_events,
      // lỗi rơi vào handleProcessingError → transient retry, KHÔNG bị ack-drop
      // (mất message) như khi findOne nằm ngoài try.
      const alreadyProcessed = await this.processedEventRepo.findOne({
        where: { event_id: eventId },
      });
      if (alreadyProcessed) {
        this.logger.log(
          `[RabbitMqService] Event ${eventId} đã xử lý trước đó — skip (dedupe).`,
        );
        channel.ack(msg);
        return;
      }

      await this.dataSource.transaction(async (manager) => {
        await manager.insert(ProcessedEvent, { event_id: eventId });
        await this.notificationConsumer.dispatch(eventType, payload, manager);
      });
      this.logger.log(
        `[RabbitMqService] Event ${eventId} (${eventType}) → processed (distributed).`,
      );
      channel.ack(msg);
    } catch (error) {
      await this.handleProcessingError(channel, msg, eventId, error as Error);
    }
  }

  private async handleProcessingError(
    channel: amqplib.Channel,
    msg: amqplib.ConsumeMessage,
    eventId: string,
    error: Error,
  ): Promise<void> {
    // Unique violation trên processed_events (Postgres 23505) = race dedupe:
    // 1 lần redelivery khác đã insert trước — coi như đã xử lý, ack thẳng.
    // TypeORM để pg code ở driverError.code; vài bản copy lên error.code → check cả hai.
    const errCode = error as { code?: string; driverError?: { code?: string } };
    if (errCode.code === "23505" || errCode.driverError?.code === "23505") {
      this.logger.log(
        `[RabbitMqService] Event ${eventId} dedupe race — coi như đã xử lý.`,
      );
      channel.ack(msg);
      return;
    }

    if (error instanceof PoisonPayloadError) {
      this.logger.error(
        `[RabbitMqService] Event ${eventId} → poison, route dlq: ${error.message}`,
      );
      channel.publish(RETRY_EXCHANGE, "dlq", msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
      channel.ack(msg);
      return;
    }

    // Lỗi tạm thời (DB/network...) — retry qua TTL queue, trừ khi đã vượt N lần.
    const retryCount = this.getRetryCount(msg);
    if (retryCount >= MAX_RETRY) {
      this.logger.error(
        `[RabbitMqService] Event ${eventId} → vượt ${MAX_RETRY} lần retry, route dlq: ${error.message}`,
      );
      channel.publish(RETRY_EXCHANGE, "dlq", msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
    } else {
      this.logger.warn(
        `[RabbitMqService] Event ${eventId} → lỗi tạm thời (lần ${retryCount + 1}/${MAX_RETRY}), route retry: ${error.message}`,
      );
      channel.publish(RETRY_EXCHANGE, "retry", msg.content, {
        persistent: true,
        headers: msg.properties.headers,
      });
    }
    channel.ack(msg);
  }

  // Đếm số lần message đã qua vòng retry (TTL expire → RabbitMQ tự thêm entry
  // x-death khi dead-letter từ notifications.retry về notifications.q).
  private getRetryCount(msg: amqplib.ConsumeMessage): number {
    const xDeath = msg.properties.headers?.["x-death"] as
      | { count?: number }[]
      | undefined;
    if (!Array.isArray(xDeath)) {
      return 0;
    }
    return xDeath.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumerChannel) {
      await this.consumerChannel.close().catch(() => undefined);
    }
    if (this.connection) {
      await this.connection.close().catch(() => undefined);
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  // Ping nhẹ cho health check: tạo + đóng 1 channel tạm để xác nhận connection còn sống.
  async ping(): Promise<boolean> {
    if (!this.connection) {
      return false;
    }
    try {
      const channel = await this.connection.createChannel();
      await channel.close();
      return true;
    } catch {
      return false;
    }
  }
}
