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
}
