// NestJS
import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

// Socket.io
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

// Redis client v4 (alias "redis4") — RIÊNG cho socket.io adapter, KHÔNG
// dùng chung client v6 của RedisConnectionService. Lý do: @socket.io/redis-adapter
// chỉ hỗ trợ chính thức tới node-redis v4 (xem plan §1d P5-8).
import { createClient } from 'redis4';

// Gắn ở CẢ 2 mode (inprocess lẫn distributed) — guard REDIS_URL: thiếu hoặc
// connect lỗi thì fallback IoAdapter mặc định (in-memory), WS cũ (inprocess)
// không bao giờ gãy vì thiếu Redis.
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn(
        '[RedisIoAdapter] REDIS_URL chưa khai — dùng in-memory adapter (single-instance).',
      );
      return;
    }

    try {
      const pubClient = createClient({ url });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (err: Error) =>
        this.logger.error(`[RedisIoAdapter] pubClient lỗi: ${err.message}`),
      );
      subClient.on('error', (err: Error) =>
        this.logger.error(`[RedisIoAdapter] subClient lỗi: ${err.message}`),
      );

      await Promise.all([pubClient.connect(), subClient.connect()]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log(
        '[RedisIoAdapter] Kết nối Redis thành công — WS fan-out cross-process bật.',
      );
    } catch (error) {
      this.logger.error(
        `[RedisIoAdapter] Kết nối Redis thất bại, fallback in-memory: ${(error as Error).message}`,
      );
      this.adapterConstructor = null;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    // @nestjs/platform-socket.io khai createIOServer trả `any` — ép kiểu về
    // Server (socket.io) để tránh lan `any` ra ngoài (no-unsafe-* eslint).
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
