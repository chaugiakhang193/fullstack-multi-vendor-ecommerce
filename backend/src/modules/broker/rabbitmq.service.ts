// NestJS
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// RabbitMQ client
import * as amqplib from 'amqplib';

// Kết nối RabbitMQ ở tầng infra (Phase 1) — CHƯA publish/consume gì.
// Connect non-fatal: nếu broker chưa sẵn sàng (CloudAMQP free tier cold, hoặc
// chưa khai env), app vẫn boot bình thường thay vì crash toàn bộ monolith vì
// một dependency mới chưa proven ở production.
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.ChannelModel | null = null;

  // Confirm channel dùng lại cho relay publish. Lazy tạo, cache lại;
  // channel chết (error/close) → null hoá để lần publish sau tạo mới.
  private confirmChannel: amqplib.ConfirmChannel | null = null;
  // Exchange đã assert trên channel hiện tại — assert idempotent 1 lần/đời channel.
  private assertedExchanges = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('RABBITMQ_URL');
    if (!url) {
      this.logger.warn(
        '[RabbitMqService] RABBITMQ_URL chưa khai — bỏ qua kết nối.',
      );
      return;
    }

    try {
      this.connection = await amqplib.connect(url);
      this.connection.on('error', (err: Error) => {
        this.logger.error(`[RabbitMqService] Connection lỗi: ${err.message}`);
        this.connection = null;
      });
      this.connection.on('close', () => {
        this.logger.warn('[RabbitMqService] Connection đóng.');
        this.connection = null;
      });
      this.logger.log('[RabbitMqService] Kết nối RabbitMQ thành công.');
    } catch (error) {
      this.logger.error(
        `[RabbitMqService] Kết nối RabbitMQ thất bại: ${(error as Error).message}`,
      );
      this.connection = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
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
      channel.on('error', (err: Error) => {
        this.logger.error(
          `[RabbitMqService] Confirm channel lỗi: ${err.message}`,
        );
        this.confirmChannel = null;
        this.assertedExchanges.clear();
      });
      channel.on('close', () => {
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
  // Non-fatal toàn bộ: mọi thứ có thể ném đồng bộ đều nằm trong try (bài học #258).
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

      // Publisher tự declare exchange (idempotent) — consumer declare queue+binding.
      if (!this.assertedExchanges.has(exchange)) {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        this.assertedExchanges.add(exchange);
      }

      const body = Buffer.from(JSON.stringify(message));
      return await new Promise<boolean>((resolve) => {
        channel.publish(
          exchange,
          routingKey,
          body,
          { persistent: true, contentType: 'application/json' },
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

  // Đăng ký consumer generic trên topic exchange. Caller truyền handler (tự
  // ack/nack). Non-fatal: chưa connect → warn + bỏ qua. Consumer declare
  // queue+binding (publisher declare exchange, nhưng assert idempotent ở đây để
  // consumer chạy trước publisher vẫn OK).
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
    if (!this.connection) {
      this.logger.warn(
        `[RabbitMqService] consume(${opts.queue}) bỏ qua — chưa connect.`,
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
