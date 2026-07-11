// NestJS
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Redis client v4 (alias "redis4") — RIÊNG cho @socket.io/redis-emitter, KHÔNG
// dùng chung client v6 của RedisConnectionService (xem plan §1d P5-8: emitter
// chỉ được hỗ trợ chính thức tới node-redis v4).
import { createClient } from "redis4";
import { Emitter } from "@socket.io/redis-emitter";

// Contracts (generated) — cùng room builder + WsEmit với monolith, tránh bẫy
// room-name lệch (P5-4).
import {
  userRoom,
  shopRoom,
  ADMINS_ROOM,
  WsEmit,
  WsEventName,
  WsPayloadMap,
} from "@/contracts/ws-events.generated";

// Mirror API `NotificationGateway` bên monolith (sendToUser/Shop/Admins) +
// `flush(emits)` dispatch theo `kind` cho broker gọi sau commit, trước ack
// (P5-5/P5-6). Thiếu REDIS_URL → no-op + warn, KHÔNG chặn message (WS chỉ là
// best-effort, DB là source of truth — xem "Flush an toàn" trong plan §1d).
@Injectable()
export class NotificationEmitterService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationEmitterService.name);
  private emitter: Emitter | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.configService.get<string>("REDIS_URL");
    if (!url) {
      this.logger.warn(
        "[NotificationEmitterService] REDIS_URL chưa khai — WS emit no-op.",
      );
      return;
    }

    try {
      const client = createClient({ url });
      client.on("error", (err: Error) =>
        this.logger.error(
          `[NotificationEmitterService] client lỗi: ${err.message}`,
        ),
      );
      // Fire-and-forget: KHÔNG await (xem RedisConnectionService). connect() treo
      // vòng reconnect khi Redis chưa tới được → chặn Nest bootstrap. Emitter tạo
      // ngay; redis-emitter queue publish tới khi nối xong. Redis down = WS emit
      // best-effort trượt (flush đã bọc try/catch), KHÔNG chặn boot.
      this.emitter = new Emitter(client);
      client
        .connect()
        .then(() =>
          this.logger.log(
            "[NotificationEmitterService] Kết nối Redis thành công — WS emit bật.",
          ),
        )
        .catch((error: Error) =>
          this.logger.error(
            `[NotificationEmitterService] Kết nối Redis thất bại, WS emit trượt: ${error.message}`,
          ),
        );
    } catch (error) {
      this.logger.error(
        `[NotificationEmitterService] createClient lỗi, WS emit no-op: ${(error as Error).message}`,
      );
      this.emitter = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Emitter không sở hữu lifecycle riêng của client redis4 — quit qua client
    // gốc không cần thiết ở đây vì process NS thoát cùng lúc; giữ no-op an toàn.
  }

  sendToUser<E extends WsEventName>(
    userId: string,
    event: E,
    payload: WsPayloadMap[E],
  ): void {
    this.emitter?.to(userRoom(userId)).emit(event, payload);
  }

  sendToShop<E extends WsEventName>(
    shopId: string,
    event: E,
    payload: WsPayloadMap[E],
  ): void {
    this.emitter?.to(shopRoom(shopId)).emit(event, payload);
  }

  sendToAdmins<E extends WsEventName>(
    event: E,
    payload: WsPayloadMap[E],
  ): void {
    this.emitter?.to(ADMINS_ROOM).emit(event, payload);
  }

  /**
   * Flush toàn bộ WsEmit thu được từ 1 lần dispatch. Gọi sau commit, trước
   * ack (P5-5) — KHÔNG throw, bọc try/catch ở call site (rabbitmq.service.ts).
   */
  flush(emits: WsEmit[]): void {
    if (!this.emitter || emits.length === 0) {
      return;
    }
    for (const emit of emits) {
      switch (emit.kind) {
        case "user":
          this.sendToUser(emit.userId, emit.event, emit.payload);
          break;
        case "shop":
          this.sendToShop(emit.shopId, emit.event, emit.payload);
          break;
        case "admins":
          this.sendToAdmins(emit.event, emit.payload);
          break;
      }
    }
  }
}
