// NestJS
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Redis client
import { createClient, RedisClientType } from 'redis';

// Kết nối Redis ở tầng infra (Phase 1) — CHƯA gắn socket.io adapter/emitter.
// Connect non-fatal: lý do giống RabbitMqService (broker/redis đều là dependency
// mới, chưa proven ở production, không được phép làm sập app boot).
@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);
  private client: RedisClientType | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn(
        '[RedisConnectionService] REDIS_URL chưa khai — bỏ qua kết nối.',
      );
      return;
    }

    try {
      const client: RedisClientType = createClient({ url });
      client.on('error', (err: Error) => {
        this.logger.error(
          `[RedisConnectionService] Client lỗi: ${err.message}`,
        );
      });
      // Fire-and-forget: KHÔNG await. connect() treo vòng reconnect khi Redis
      // unreachable → chặn Nest bootstrap (onApplicationBootstrap + @Interval +
      // consumer không chạy). Set client ngay; isConnected() kiểm client.isOpen.
      this.client = client;
      client
        .connect()
        .then(() =>
          this.logger.log('[RedisConnectionService] Kết nối Redis thành công.'),
        )
        .catch((error: Error) =>
          this.logger.error(
            `[RedisConnectionService] Kết nối Redis thất bại: ${error.message}`,
          ),
        );
    } catch (error) {
      this.logger.error(
        `[RedisConnectionService] createClient lỗi: ${(error as Error).message}`,
      );
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.isOpen;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    try {
      const reply = await this.client.ping();
      return reply === 'PONG';
    } catch {
      return false;
    }
  }
}
