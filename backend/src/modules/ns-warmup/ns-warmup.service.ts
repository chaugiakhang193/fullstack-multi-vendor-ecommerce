// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Đánh thức Notification Service (NS) — Render free-tier scale-to-zero sau 15' idle,
 * cold-start ~32s. Gọi `warm()` ở các chặng phễu mua hàng (add-to-cart → xem giỏ →
 * checkout preview) để NS ấm SẴN trước khi buyer đặt đơn → notif realtime không trễ.
 *
 * Fire-and-forget hoàn toàn: message nghiệp vụ luôn an toàn ở RabbitMQ (nhờ outbox),
 * poke chỉ giảm latency. Mọi lỗi nuốt, không bao giờ chạm request/user.
 */
@Injectable()
export class NsWarmupService {
  private readonly logger = new Logger(NsWarmupService.name);

  // Chống 2 poke chạy đè nhau khi đang cold-start (1 poke giữ kết nối tới ~60s).
  private isPoking = false;

  // Epoch ms của lần poke THÀNH CÔNG gần nhất; 0 = chưa poke lần nào.
  private lastPokedAt = 0;

  // Throttle global: NS ngủ sau 15' idle → poke tối đa 1 lần/10' là đủ giữ ấm,
  // chừa buffer 5', và < 15' để poke sau kịp bắn lại trong 1 phễu dài.
  private static readonly THROTTLE_MS = 10 * 60 * 1000;

  // Render cold-start có thể tới ~50s — PHẢI giữ kết nối đủ lâu để Render dựng xong
  // NS. Abort sớm khiến Render huỷ spin-up giữa chừng → NS không thức. Timeout 60s.
  private static readonly COLD_START_TIMEOUT_MS = 60 * 1000;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Poke NS `/health` fire-and-forget. An toàn gọi bao nhiêu lần cũng được:
   * throttle global gộp về tối đa 1 lần/10'. Không throw, không await, không log ra user.
   */
  warm(): void {
    const url = this.configService.get<string>('NOTIFICATION_SERVICE_URL');

    // Chưa khai URL, hoặc đang có 1 poke chạy → bỏ qua (NS thức 1 lần là đủ cho cả hệ thống).
    if (!url || this.isPoking) {
      return;
    }

    // NS vừa được đánh thức gần đây → chắc chắn còn ấm (10' < 15' ngủ) → khỏi poke lại.
    if (Date.now() - this.lastPokedAt < NsWarmupService.THROTTLE_MS) {
      this.logger.debug('[NsWarmup] Bỏ qua poke (còn trong cửa sổ throttle)');
      return;
    }

    this.isPoking = true;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      NsWarmupService.COLD_START_TIMEOUT_MS,
    );

    fetch(`${url}/health`, { signal: controller.signal })
      .then(() => {
        // Chỉ ghi mốc khi THÀNH CÔNG → 1 lần poke fail không khoá 10' kế tiếp.
        this.lastPokedAt = Date.now();
        this.logger.debug('[NsWarmup] Poke NS /health OK');
      })
      .catch((err: Error) => {
        // Nuốt lỗi: message vẫn an toàn ở broker, poke chỉ là tối ưu latency.
        this.logger.debug(`[NsWarmup] Poke NS bỏ qua: ${err.message}`);
      })
      .finally(() => {
        clearTimeout(timeout);
        this.isPoking = false;
      });
  }
}
