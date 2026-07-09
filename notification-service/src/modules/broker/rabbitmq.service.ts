// NestJS
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// RabbitMQ client
import * as amqplib from "amqplib";

// Topology — consumer declare queue + binding (publisher declare exchange).
const EVENTS_EXCHANGE = "ecommerce.events";
const NOTIFICATIONS_QUEUE = "notifications.q";
// Nhận mọi event notification-relevant. Retry/DLQ = Phase 4 (app-driven), nên
// KHÔNG khai x-dead-letter-exchange ở đây → queue arg-free, tránh 406 về sau.
const BINDING_PATTERNS = [
  "order.*",
  "review.*",
  "payout.*",
  "return.*",
  "shop.*",
];

// Kết nối RabbitMQ + consumer log-only (Phase 3). Consumer chỉ log rồi ack —
// CHƯA parse payload, CHƯA tạo notif (Phase 4). Connect + setup non-fatal: broker
// chưa sẵn sàng thì service vẫn boot, /health vẫn 200.
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.ChannelModel | null = null;
  private consumerChannel: amqplib.Channel | null = null;

  constructor(private readonly configService: ConfigService) {}

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

      // Dựng queue + binding + consumer log-only ngay sau khi connect.
      await this.setupConsumer();
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Kết nối RabbitMQ thất bại: ${(error as Error).message}`,
      );
      this.connection = null;
    }
  }

  // Declare notifications.q (arg-free, durable) + binding trên ecommerce.events,
  // rồi consume log-only (nhận → log → ack). Toàn bộ trong try → non-fatal.
  private async setupConsumer(): Promise<void> {
    if (!this.connection) {
      return;
    }
    try {
      const channel = await this.connection.createChannel();
      // Publisher (backend relay) mới là bên declare exchange; assert idempotent ở
      // đây để consumer khởi động trước relay vẫn không lỗi.
      await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
      // Queue arg-free: KHÔNG x-dead-letter-exchange (Phase 4 lo retry/DLQ ở tầng app).
      await channel.assertQueue(NOTIFICATIONS_QUEUE, { durable: true });
      for (const pattern of BINDING_PATTERNS) {
        await channel.bindQueue(NOTIFICATIONS_QUEUE, EVENTS_EXCHANGE, pattern);
      }

      await channel.consume(NOTIFICATIONS_QUEUE, (msg) => {
        if (!msg) {
          return;
        }
        // Log-only: chỉ ghi nhận đã nhận message. CHƯA parse payload, CHƯA tạo notif.
        const routingKey = msg.fields.routingKey;
        let eventId = "?";
        let eventType = routingKey;
        try {
          const envelope = JSON.parse(msg.content.toString()) as {
            eventId?: string;
            eventType?: string;
          };
          eventId = envelope.eventId ?? "?";
          eventType = envelope.eventType ?? routingKey;
        } catch {
          // Body không phải JSON envelope — vẫn log & ack (log-only Phase 3).
        }
        this.logger.log(
          `[RabbitMqService] Nhận event rk=${routingKey} eventId=${eventId} eventType=${eventType}`,
        );
        channel.ack(msg);
      });

      this.consumerChannel = channel;
      this.logger.log(
        `[RabbitMqService] Consumer online — queue=${NOTIFICATIONS_QUEUE} (log-only).`,
      );
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Setup consumer thất bại: ${(error as Error).message}`,
      );
      this.consumerChannel = null;
    }
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
