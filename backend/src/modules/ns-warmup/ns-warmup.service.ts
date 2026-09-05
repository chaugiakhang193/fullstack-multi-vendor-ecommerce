// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Helpers
import { formatEdgeHeaders } from '@/common/helpers/edge-headers.helper';

/**
 * Đánh thức Notification Service (NS) — Render free-tier scale-to-zero sau 15' idle,
 * cold-start ~32s. Gọi `warm()` ở các chặng phễu mua hàng (add-to-cart → xem giỏ →
 * checkout preview) để NS ấm SẴN trước khi buyer đặt đơn → notif realtime không trễ.
 *
 * Fire-and-forget hoàn toàn: message nghiệp vụ luôn an toàn ở RabbitMQ (nhờ outbox),
 * poke chỉ giảm latency. Mọi lỗi nuốt, không bao giờ chạm request/user.
 *
 *   1 cú poke đơn lẻ KHÔNG đáng tin —
 * - Edge-proxy Render có thể trả 502/503 tức thì khi NS ngủ (khe "cổng mở nhưng app
 *   chưa sẵn sàng", image pull chậm, hiccup nền tảng). fetch resolve cả với 5xx →
 *   nếu coi đó là thành công sẽ khoá throttle 10' trong khi NS chưa hề dậy.
 * - Kết nối đứt giữa chừng có thể khiến Render HUỶ spin-up → NS ngủ tiếp, không để
 *   lại dấu vết; cách duy nhất cứu là một cú poke MỚI (chuỗi retry bên dưới).
 */
@Injectable()
export class NsWarmupService {
  private readonly logger = new Logger(NsWarmupService.name);

  // Chống 2 chuỗi poke chạy đè nhau: giữ true suốt CẢ chuỗi retry (đang chủ động
  // đánh thức NS thì các warm() khác khỏi bắn thêm).
  private isPoking = false;

  // Epoch ms của lần poke THÀNH CÔNG (HTTP 2xx) gần nhất; 0 = chưa poke lần nào.
  private lastPokedAt = 0;

  // Throttle global: NS ngủ sau 15' idle → poke tối đa 1 lần/10' là đủ giữ ấm,
  // chừa buffer 5', và < 15' để poke sau kịp bắn lại trong 1 phễu dài.
  private static readonly THROTTLE_MS = 10 * 60 * 1000;

  // Render cold-start có thể tới ~50s và ĐÔI KHI VƯỢT 60s — PHẢI giữ kết nối đủ
  // lâu để Render dựng xong NS. Abort sớm khiến Render huỷ spin-up giữa chừng →
  // NS không thức (đã dính thật: đơn đầu tiên sau khi boot monolith, poke bắn 1
  // lần không retry, abort 60s cắt ngang spin-up chậm → phải đánh thức tay).
  // 120s đủ phủ cold-start chậm; chỉ bật khi NS thật sự không dậy nổi.
  private static readonly COLD_START_TIMEOUT_MS = 120 * 1000;

  // Khoảng chờ giữa các lần thử lại (tổng 4 phát: 1 chính + 3 retry). Giãn tăng dần:
  // 5xx tức thì thường là NS đang được Render dựng — chờ lâu hơn mỗi lần cho kịp.
  private static readonly RETRY_DELAYS_MS = [15_000, 30_000, 45_000];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Poke NS `/health` fire-and-forget. An toàn gọi bao nhiêu lần cũng được:
   * throttle global gộp về tối đa 1 lần/10'. Không throw, không await, không log ra user.
   */
  warm(): void {
    const url = this.configService.get<string>('NOTIFICATION_SERVICE_URL');

    // Chưa khai URL, hoặc đang có 1 chuỗi poke chạy → bỏ qua (NS thức 1 lần là đủ cho cả hệ thống).
    if (!url || this.isPoking) {
      return;
    }

    // NS vừa được đánh thức gần đây → chắc chắn còn ấm (10' < 15' ngủ) → khỏi poke lại.
    if (Date.now() - this.lastPokedAt < NsWarmupService.THROTTLE_MS) {
      this.logger.debug('[NsWarmup] Bỏ qua poke (còn trong cửa sổ throttle)');
      return;
    }

    this.isPoking = true;
    // Fire-and-forget CẢ CHUỖI; runPokeChain tự nuốt mọi lỗi nên finally là đủ.
    void this.runPokeChain(url).finally(() => {
      this.isPoking = false;
    });
  }

  // Chuỗi poke: thử tối đa 1 + RETRY_DELAYS_MS.length lần, dừng ngay khi có 2xx.
  // Retry là BẮT BUỘC chứ không phải phòng hờ: cú poke chết (5xx/đứt kết nối) có thể
  // kéo spin-up chết theo — chỉ một request MỚI mới khởi động lại được việc đánh thức.
  private async runPokeChain(url: string): Promise<void> {
    const maxAttempts = 1 + NsWarmupService.RETRY_DELAYS_MS.length;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const succeeded = await this.pokeOnce(url, attempt, maxAttempts);
      if (succeeded) {
        return;
      }

      const delayMs = NsWarmupService.RETRY_DELAYS_MS[attempt - 1];
      if (delayMs === undefined) {
        break; // vừa xong lần cuối
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Không set lastPokedAt → KHÔNG khoá throttle: lần warm() kế tiếp còn cơ hội cứu.
    this.logger.error(
      `[NsWarmup] Cả ${maxAttempts} lần poke đều thất bại — NS có thể vẫn ngủ; message an toàn ở RabbitMQ, sẽ được tiêu thụ khi NS dậy.`,
    );
  }

  // 1 lần poke. Trả true CHỈ khi HTTP 2xx — 5xx từ edge-proxy Render (NS ngủ/deploy)
  // resolve được fetch nhưng KHÔNG phải thành công; tính là thành công sẽ khoá
  // throttle 10' oan trong khi NS chưa dậy (bug prod 23/07: 1 cú 502 ở đầu phễu
  // làm mọi warm() sau đó câm lặng, phải poke tay).
  private async pokeOnce(
    url: string,
    attempt: number,
    maxAttempts: number,
  ): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      NsWarmupService.COLD_START_TIMEOUT_MS,
    );
    const startedAt = Date.now();

    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      const elapsedMs = Date.now() - startedAt;

      if (res.ok) {
        // Chỉ ghi mốc khi THÀNH CÔNG THẬT → poke fail không khoá 10' kế tiếp.
        this.lastPokedAt = Date.now();
        // elapsedMs phân biệt "NS vốn thức" (~200ms) vs "cold-start thật" (~30-50s).
        this.logger.log(
          `[NsWarmup] Poke NS OK sau ${elapsedMs}ms (lần ${attempt}/${maxAttempts})`,
        );
        return true;
      }

      this.logger.warn(
        `[NsWarmup] Poke NS lần ${attempt}/${maxAttempts} nhận HTTP ${res.status} sau ${elapsedMs}ms${formatEdgeHeaders(res.headers)}`,
      );
      return false;
    } catch (err) {
      // Lỗi mạng/abort-120s. Nuốt: message vẫn an toàn ở broker, poke chỉ là tối ưu latency.
      const elapsedMs = Date.now() - startedAt;
      this.logger.warn(
        `[NsWarmup] Poke NS lần ${attempt}/${maxAttempts} lỗi sau ${elapsedMs}ms: ${(err as Error).message}`,
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
