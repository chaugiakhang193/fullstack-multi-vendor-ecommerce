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
import { NotificationEmitterService } from "@/modules/broker/notification-emitter.service";
import { WsEmit } from "@/contracts/ws-events.generated";

// Backoff giữa các lần thử kết nối lại — lần thứ n dùng phần tử thứ n, quá dài
// thì giữ mốc cuối (30s).
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

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
  "product.*",
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

// Kết nối RabbitMQ + consumer notifications.q. Nhận event → dedup
// (processed_events) + dispatch handler (NotificationConsumerService) trong 1
// transaction rồi ack, WS emit best-effort sau commit. Connect + setup
// non-fatal: broker chưa sẵn sàng thì service vẫn boot, /health vẫn 200.
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.ChannelModel | null = null;
  private consumerChannel: amqplib.Channel | null = null;
  // Confirm channel RIÊNG cho publish (relay). Lazy tạo, cache; null-hoá khi
  // error/close để publish sau tạo mới.
  private confirmChannel: amqplib.ConfirmChannel | null = null;
  // Exchange đã assert trên confirm channel hiện tại (idempotent 1 lần/đời channel).
  private assertedExchanges = new Set<string>();

  // Trạng thái reconnect.
  private url: string | null = null;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly notificationConsumer: NotificationConsumerService,
    private readonly notificationEmitter: NotificationEmitterService,
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>("RABBITMQ_URL");
    if (!url) {
      this.logger.warn(
        "[RabbitMqService] RABBITMQ_URL chưa khai — bỏ qua kết nối.",
      );
      return;
    }
    this.url = url;
    await this.connect();
  }

  // Kết nối + gắn handler vòng đời + dựng lại consumer. Thất bại → hẹn thử lại
  // (KHÔNG ném ra ngoài để service vẫn boot khi broker chưa sẵn sàng).
  private async connect(): Promise<void> {
    if (!this.url || this.isShuttingDown) {
      return;
    }

    try {
      const connection = await amqplib.connect(this.url);
      connection.on("error", (err: Error) => {
        this.logger.error(`[RabbitMqService] Connection lỗi: ${err.message}`);
      });
      // 'close' luôn bắn (kể cả sau 'error') → chỉ hẹn reconnect ở đây.
      connection.on("close", () => {
        // Handler của connection CŨ tới trễ trong khi đã nối lại được → bỏ qua.
        // So theo chính object của closure này, không theo `this`: nếu không,
        // 'close' đến muộn sẽ xoá nhầm connection mới đang sống.
        if (this.connection !== connection) {
          return;
        }
        this.logger.warn("[RabbitMqService] Connection đóng.");
        this.connection = null;
        this.consumerChannel = null;
        this.confirmChannel = null;
        this.assertedExchanges.clear();
        this.scheduleReconnect();
      });

      this.connection = connection;
      this.reconnectAttempts = 0;
      this.logger.log("[RabbitMqService] Kết nối RabbitMQ thành công.");

      // Consumer sống theo connection → connection mới phải dựng lại, không thì
      // NS im lặng ngừng xử lý event tới khi restart.
      await this.setupConsumer();
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Kết nối RabbitMQ thất bại: ${(error as Error).message}`,
      );
      this.connection = null;
      this.scheduleReconnect();
    }
  }

  // Hẹn 1 lần thử lại. Guard `reconnectTimer` để close + connect-fail không tạo
  // 2 vòng song song.
  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer || !this.url) {
      return;
    }
    const delay =
      RECONNECT_DELAYS_MS[
        Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)
      ];
    this.reconnectAttempts++;
    this.logger.warn(
      `[RabbitMqService] Thử kết nối lại sau ${delay}ms (lần ${this.reconnectAttempts}).`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
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

      let emits: WsEmit[] = [];
      await this.dataSource.transaction(async (manager) => {
        await manager.insert(ProcessedEvent, { event_id: eventId });
        emits = await this.notificationConsumer.dispatch(
          eventType,
          payload,
          manager,
        );
      });
      this.logger.log(
        `[RabbitMqService] Event ${eventId} (${eventType}) → processed (distributed).`,
      );

      // WS emit best-effort SAU commit, TRƯỚC ack (P5-5). Lỗi redis không được
      // chặn ack — DB đã là source of truth, at-least-once do DB đảm bảo, KHÔNG
      // retry message chỉ vì realtime lỗi (xem "Flush an toàn", plan §1d).
      try {
        this.notificationEmitter.flush(emits);
      } catch (wsError) {
        this.logger.error(
          `[RabbitMqService] Event ${eventId} → WS flush lỗi (bỏ qua, không ảnh hưởng ack): ${(wsError as Error).message}`,
        );
      }

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

  // Lazy confirm channel cho publish (relay). Cache; null-hoá khi error/close.
  private async getConfirmChannel(): Promise<amqplib.ConfirmChannel | null> {
    if (!this.connection) {
      return null;
    }
    if (this.confirmChannel) {
      return this.confirmChannel;
    }
    try {
      const channel = await this.connection.createConfirmChannel();
      channel.on("error", (err: Error) => {
        this.logger.error(
          `[RabbitMqService] Confirm channel lỗi: ${err.message}`,
        );
        this.confirmChannel = null;
        this.assertedExchanges.clear();
      });
      channel.on("close", () => {
        this.confirmChannel = null;
        this.assertedExchanges.clear();
      });
      this.confirmChannel = channel;
      return channel;
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Tạo confirm channel thất bại: ${(error as Error).message}`,
      );
      this.confirmChannel = null;
      return null;
    }
  }

  // Publish 1 message lên topic exchange và CHỜ publisher confirm (at-least-once).
  // Trả true khi broker ACK; false nếu chưa connect / nack / bất kỳ lỗi nào.
  // Non-fatal toàn bộ (bài học 258). Publisher tự declare exchange idempotent.
  async publishWithConfirm(
    exchange: string,
    routingKey: string,
    message: unknown,
  ): Promise<boolean> {
    try {
      const channel = await this.getConfirmChannel();
      if (!channel) {
        return false;
      }

      if (!this.assertedExchanges.has(exchange)) {
        await channel.assertExchange(exchange, "topic", { durable: true });
        this.assertedExchanges.add(exchange);
      }

      const body = Buffer.from(JSON.stringify(message));
      return await new Promise<boolean>((resolve) => {
        channel.publish(
          exchange,
          routingKey,
          body,
          { persistent: true, contentType: "application/json" },
          (err) => {
            if (err) {
              const reason = err instanceof Error ? err.message : String(err);
              this.logger.error(
                `[RabbitMqService] Publish nack (rk=${routingKey}): ${reason}`,
              );
              resolve(false);
            } else {
              resolve(true);
            }
          },
        );
      });
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] publishWithConfirm lỗi (rk=${routingKey}): ${(error as Error).message}`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.consumerChannel) {
      await this.consumerChannel.close().catch(() => undefined);
    }
    if (this.confirmChannel) {
      await this.confirmChannel.close().catch(() => undefined);
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
