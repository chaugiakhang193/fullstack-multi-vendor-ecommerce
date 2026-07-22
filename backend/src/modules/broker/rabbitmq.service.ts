// NestJS
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Node
import { randomUUID } from 'crypto';

// RabbitMQ client
import * as amqplib from 'amqplib';

// Backoff giữa các lần thử kết nối lại — lần thứ n dùng phần tử thứ n, quá dài
// thì giữ ở mốc cuối (30s). Đủ nhanh để tự lành sau blip, đủ chậm để không
// quay CPU/log khi broker chết lâu.
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

// Kết quả publish — PHẢI tách 3 trạng thái, không gộp về boolean:
//   ok         → broker confirm và đã route vào ít nhất 1 queue.
//   failed     → lỗi TẠM THỜI (nack, mất kết nối, channel chết) → thử lại có ích.
//   unroutable → lỗi VĨNH VIỄN: routing key không khớp binding nào (basic.return).
//                Thử lại vô nghĩa — chỉ hết khi có người sửa binding/routing key.
// Gộp `unroutable` vào `failed` sẽ khiến relay giữ row ở `published_at IS NULL`
// mãi mãi; đủ 10 row như vậy là chiếm trọn mọi batch (claimBatch LIMIT 10 ORDER BY
// created_at ASC) → head-of-line blocking, TOÀN BỘ notification ngừng chảy.
export type PublishResult = 'ok' | 'failed' | 'unroutable';

// Đăng ký consumer đã yêu cầu — giữ lại để ĐĂNG KÝ LẠI sau khi reconnect
// (connection chết kéo theo mọi channel; nếu không nhớ thì consumer chết vĩnh viễn).
interface ConsumerRegistration {
  opts: {
    exchange: string;
    queue: string;
    patterns: string[];
    prefetch?: number;
  };
  handler: (
    msg: amqplib.ConsumeMessage,
    channel: amqplib.Channel,
  ) => Promise<void>;
}

// Kết nối RabbitMQ ở tầng infra (Phase 1) — CHƯA publish/consume gì.
// Connect non-fatal: nếu broker chưa sẵn sàng (CloudAMQP free tier cold, hoặc
// chưa khai env), app vẫn boot bình thường thay vì crash toàn bộ monolith vì
// một dependency mới chưa proven ở production.
// Mất kết nối → tự nối lại có backoff + đăng ký lại consumer (trước đây chỉ
// null-hoá connection nên cả relay lẫn projection consumer chết tới khi restart).
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.ChannelModel | null = null;

  // Confirm channel dùng lại cho relay publish. Lazy tạo, cache lại;
  // channel chết (error/close) → null hoá để lần publish sau tạo mới.
  private confirmChannel: amqplib.ConfirmChannel | null = null;
  // Exchange đã assert trên channel hiện tại — assert idempotent 1 lần/đời channel.
  private assertedExchanges = new Set<string>();
  // messageId của các publish vừa bị broker trả về (basic.return, routing key
  // không khớp binding nào) — confirm callback tra Set này để phát hiện publish
  // "ack giả" (broker confirm dù message đã bị vứt).
  private returnedMessageIds = new Set<string>();

  // Trạng thái reconnect.
  private url: string | null = null;
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private consumerRegistrations: ConsumerRegistration[] = [];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        '[RabbitMqService] RABBITMQ_URL chưa khai — bỏ qua kết nối.',
      );
      return;
    }
    this.url = url;
    await this.connect();
  }

  // Kết nối + gắn handler vòng đời. Thất bại → hẹn thử lại (KHÔNG ném ra ngoài
  // để boot không phụ thuộc broker).
  private async connect(): Promise<void> {
    if (!this.url || this.isShuttingDown) {
      return;
    }

    try {
      const connection = await amqplib.connect(this.url);
      connection.on('error', (err: Error) => {
        this.logger.error(`[RabbitMqService] Connection lỗi: ${err.message}`);
      });
      // 'close' luôn bắn (kể cả sau 'error') → chỉ hẹn reconnect ở đây, tránh
      // hẹn 2 lần cho cùng một lần rớt.
      connection.on('close', () => {
        // Handler của connection CŨ tới trễ trong khi đã nối lại được → bỏ qua.
        // So theo chính object của closure này, không theo `this`: nếu không,
        // 'close' đến muộn sẽ xoá nhầm connection mới đang sống.
        if (this.connection !== connection) {
          return;
        }
        this.logger.warn('[RabbitMqService] Connection đóng.');
        this.connection = null;
        this.confirmChannel = null;
        this.assertedExchanges.clear();
        this.scheduleReconnect();
      });

      this.connection = connection;
      this.reconnectAttempts = 0;
      this.logger.log('[RabbitMqService] Kết nối RabbitMQ thành công.');

      // Consumer đã đăng ký trước đó (hoặc đăng ký lúc chưa có connection) —
      // gắn lại lên connection mới.
      await this.restoreConsumers();
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Kết nối RabbitMQ thất bại: ${(error as Error).message}`,
      );
      this.connection = null;
      this.scheduleReconnect();
    }
  }

  // Hẹn 1 lần thử lại. Guard `reconnectTimer` để nhiều nguồn cùng gọi (close +
  // connect fail) không tạo nhiều vòng song song.
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

  private async restoreConsumers(): Promise<void> {
    if (this.consumerRegistrations.length === 0) {
      return;
    }
    for (const registration of this.consumerRegistrations) {
      await this.registerConsumer(registration);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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

  // Lấy confirm channel dùng lại (lazy). Trả null nếu chưa có connection hoặc
  // tạo channel lỗi — mọi lỗi nuốt gọn để non-fatal (không làm sập vòng relay).
  private async getConfirmChannel(): Promise<amqplib.ConfirmChannel | null> {
    if (!this.connection) {
      return null;
    }
    if (this.confirmChannel) {
      return this.confirmChannel;
    }
    try {
      const channel = await this.connection.createConfirmChannel();
      // basic.return: broker gửi TRƯỚC basic.ack khi mandatory=true và routing
      // key không khớp binding nào — publish vẫn được confirm (ack) nhưng
      // message đã bị vứt. Log lỗi nghiêm trọng (sai cấu hình routing/binding).
      channel.on('return', (msg: amqplib.Message) => {
        const messageId = msg.properties.messageId as string | undefined;
        if (messageId) {
          this.returnedMessageIds.add(messageId);
        }
        let eventId = 'unknown';
        try {
          eventId =
            (JSON.parse(msg.content.toString()) as { eventId?: string })
              .eventId ?? 'unknown';
        } catch {
          // body không parse được — giữ 'unknown'
        }
        this.logger.error(
          `[RabbitMqService] Message KHÔNG ĐỊNH TUYẾN ĐƯỢC (mất) — eventId=${eventId} rk=${msg.fields.routingKey} exchange=${msg.fields.exchange}.`,
        );
      });
      channel.on('error', (err: Error) => {
        this.logger.error(
          `[RabbitMqService] Confirm channel lỗi: ${err.message}`,
        );
        this.confirmChannel = null;
        this.assertedExchanges.clear();
        this.returnedMessageIds.clear();
      });
      channel.on('close', () => {
        this.confirmChannel = null;
        this.assertedExchanges.clear();
        this.returnedMessageIds.clear();
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
  // Trả 'ok' | 'failed' | 'unroutable' — xem chú thích PublishResult, KHÔNG gộp
  // 'unroutable' vào 'failed'. Non-fatal toàn bộ: mọi thứ có thể ném đồng bộ đều
  // nằm trong try (bài học #258).
  async publishWithConfirm(
    exchange: string,
    routingKey: string,
    message: unknown,
  ): Promise<PublishResult> {
    try {
      const channel = await this.getConfirmChannel();
      if (!channel) {
        return 'failed';
      }

      // Publisher tự declare exchange (idempotent) — consumer declare queue+binding.
      if (!this.assertedExchanges.has(exchange)) {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        this.assertedExchanges.add(exchange);
      }

      const body = Buffer.from(JSON.stringify(message));
      const messageId = randomUUID();
      return await new Promise<PublishResult>((resolve) => {
        channel.publish(
          exchange,
          routingKey,
          body,
          {
            persistent: true,
            contentType: 'application/json',
            mandatory: true,
            messageId,
          },
          (err) => {
            if (err) {
              const reason = err instanceof Error ? err.message : String(err);
              this.logger.error(
                `[RabbitMqService] Publish nack (rk=${routingKey}): ${reason}`,
              );
              resolve('failed');
              return;
            }
            // RabbitMQ gửi basic.return TRƯỚC basic.ack — nhường 1 tick để
            // handler 'return' (nếu có) kịp bỏ messageId vào Set trước khi
            // ta kiểm tra.
            setImmediate(() => {
              const wasReturned = this.returnedMessageIds.delete(messageId);
              resolve(wasReturned ? 'unroutable' : 'ok');
            });
          },
        );
      });
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] publishWithConfirm lỗi (rk=${routingKey}): ${(error as Error).message}`,
      );
      return 'failed';
    }
  }

  // Đăng ký consumer generic trên topic exchange. Caller truyền handler (tự
  // ack/nack). Đăng ký được GHI NHỚ: chưa connect thì gắn khi connect được, và
  // gắn lại sau mỗi lần reconnect.
  async consume(
    opts: {
      exchange: string;
      queue: string;
      patterns: string[];
      prefetch?: number;
    },
    handler: (
      msg: amqplib.ConsumeMessage,
      channel: amqplib.Channel,
    ) => Promise<void>,
  ): Promise<void> {
    const registration: ConsumerRegistration = { opts, handler };
    this.consumerRegistrations.push(registration);
    await this.registerConsumer(registration);
  }

  // Gắn 1 registration lên connection hiện tại. Non-fatal: chưa connect → warn
  // rồi thôi (restoreConsumers sẽ gắn lại). Consumer declare queue+binding
  // (publisher declare exchange, nhưng assert idempotent ở đây để consumer chạy
  // trước publisher vẫn OK).
  private async registerConsumer(
    registration: ConsumerRegistration,
  ): Promise<void> {
    const { opts, handler } = registration;
    if (!this.connection) {
      this.logger.warn(
        `[RabbitMqService] consume(${opts.queue}) hoãn — chưa connect, sẽ gắn lại khi kết nối được.`,
      );
      return;
    }
    try {
      const channel = await this.connection.createChannel();
      await channel.prefetch(opts.prefetch ?? 10);
      await channel.assertExchange(opts.exchange, 'topic', { durable: true });
      await channel.assertQueue(opts.queue, { durable: true });
      for (const pattern of opts.patterns) {
        await channel.bindQueue(opts.queue, opts.exchange, pattern);
      }
      await channel.consume(opts.queue, (msg) => {
        if (!msg) {
          return;
        }
        handler(msg, channel).catch((err: Error) => {
          this.logger.error(
            `[RabbitMqService] consume(${opts.queue}) handler lỗi không bắt: ${err.message}`,
          );
          channel.ack(msg);
        });
      });
      this.logger.log(
        `[RabbitMqService] Consumer online — queue=${opts.queue}.`,
      );
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] consume(${opts.queue}) setup lỗi: ${(error as Error).message}`,
      );
    }
  }
}
