// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Helpers
import { formatEdgeHeaders } from '@/common/helpers/edge-headers.helper';

/**
 * Đánh thức search-service (Go) — Render acc#2 free-tier scale-to-zero sau 15' idle. `SearchClient`
 * timeout chỉ 300ms nên cú search ĐẦU sau khi ngủ chắc chắn miss → fallback ILIKE. Gọi `warm()`:
 *   - proactive: khi khách DUYỆT sản phẩm (findAll/shop-catalog không có `q`) → đánh thức trước lúc gõ.
 *   - reactive: khi `fetchCandidates` trả null (lỗi/ngủ) → cú search sau đã ấm.
 *
 * Fire-and-forget hoàn toàn: search chỉ là tối ưu, hỏng thì ILIKE đỡ. Mọi lỗi nuốt, không chạm request.
 * Tách RIÊNG khỏi NsWarmupService (dù trùng pattern) vì 2 service ngủ độc lập và NsWarmup đang chạy
 * prod ở phễu mua hàng — không đụng để tránh regression notif realtime.
 */
@Injectable()
export class SearchWarmupService {
  private readonly logger = new Logger(SearchWarmupService.name);

  // Chống 2 chuỗi poke chạy đè nhau: giữ true suốt CẢ chuỗi retry.
  private isPoking = false;

  // Epoch ms của lần poke THÀNH CÔNG (HTTP 2xx) gần nhất; 0 = chưa poke lần nào.
  private lastPokedAt = 0;

  // Throttle global: service ngủ sau 15' idle → poke tối đa 1 lần/10' là đủ giữ ấm, chừa buffer 5'.
  private static readonly THROTTLE_MS = 10 * 60 * 1000;

  // Cold-start Render có thể tới ~50s và đôi khi vượt 60s — giữ kết nối đủ lâu để Render dựng xong,
  // abort sớm khiến Render huỷ spin-up giữa chừng. 120s đủ phủ cold-start chậm.
  private static readonly COLD_START_TIMEOUT_MS = 120 * 1000;

  // Giãn tăng dần giữa các lần thử lại (tổng 4 phát: 1 chính + 3 retry).
  private static readonly RETRY_DELAYS_MS = [15_000, 30_000, 45_000];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Poke search-service `/health` fire-and-forget. An toàn gọi bao nhiêu lần cũng được:
   * throttle global gộp về tối đa 1 lần/10'. Không throw, không await, không log ra user.
   */
  warm(): void {
    const url = this.configService.get<string>('SEARCH_SERVICE_URL');

    // Chưa khai URL, hoặc đang có 1 chuỗi poke chạy → bỏ qua (thức 1 lần là đủ).
    if (!url || this.isPoking) {
      return;
    }

    // Vừa đánh thức gần đây → chắc chắn còn ấm (10' < 15' ngủ) → khỏi poke lại.
    if (Date.now() - this.lastPokedAt < SearchWarmupService.THROTTLE_MS) {
      this.logger.debug(
        '[SearchWarmup] Bỏ qua poke (còn trong cửa sổ throttle)',
      );
      return;
    }

    this.isPoking = true;
    void this.runPokeChain(url).finally(() => {
      this.isPoking = false;
    });
  }

  // Chuỗi poke: thử tối đa 1 + RETRY_DELAYS_MS.length lần, dừng ngay khi có 2xx. Cú poke chết
  // (5xx/đứt kết nối) có thể kéo spin-up chết theo — chỉ một request MỚI mới khởi động lại được.
  private async runPokeChain(url: string): Promise<void> {
    const maxAttempts = 1 + SearchWarmupService.RETRY_DELAYS_MS.length;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const succeeded = await this.pokeOnce(url, attempt, maxAttempts);
      if (succeeded) {
        return;
      }

      const delayMs = SearchWarmupService.RETRY_DELAYS_MS[attempt - 1];
      if (delayMs === undefined) {
        break; // vừa xong lần cuối
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Không set lastPokedAt → KHÔNG khoá throttle: lần warm() kế tiếp còn cơ hội cứu.
    this.logger.error(
      `[SearchWarmup] Cả ${maxAttempts} lần poke đều thất bại — search-service có thể vẫn ngủ; search sẽ fallback ILIKE tới khi service dậy.`,
    );
  }

  // 1 lần poke. Trả true CHỈ khi HTTP 2xx — 5xx từ edge-proxy (service ngủ/deploy) resolve được fetch
  // nhưng KHÔNG phải thành công; tính là thành công sẽ khoá throttle 10' oan trong khi service chưa dậy.
  private async pokeOnce(
    url: string,
    attempt: number,
    maxAttempts: number,
  ): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      SearchWarmupService.COLD_START_TIMEOUT_MS,
    );
    const startedAt = Date.now();

    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      const elapsedMs = Date.now() - startedAt;

      if (res.ok) {
        // Chỉ ghi mốc khi THÀNH CÔNG THẬT → poke fail không khoá 10' kế tiếp.
        this.lastPokedAt = Date.now();
        // elapsedMs phân biệt "vốn thức" (~200ms) vs "cold-start thật" (~30-50s).
        this.logger.log(
          `[SearchWarmup] Poke search-service OK sau ${elapsedMs}ms (lần ${attempt}/${maxAttempts})`,
        );
        return true;
      }

      this.logger.warn(
        `[SearchWarmup] Poke lần ${attempt}/${maxAttempts} nhận HTTP ${res.status} sau ${elapsedMs}ms${formatEdgeHeaders(res.headers)}`,
      );
      return false;
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      this.logger.warn(
        `[SearchWarmup] Poke lần ${attempt}/${maxAttempts} lỗi sau ${elapsedMs}ms: ${(err as Error).message}`,
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
