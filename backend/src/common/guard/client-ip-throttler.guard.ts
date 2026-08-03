import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard đếm hạn mức theo IP client lấy từ header `cf-connecting-ip`.
 *
 * Bối cảnh: service chạy trên Render, và Render đặt sẵn edge Cloudflare trước mọi domain
 * `*.onrender.com` (response có `Server: cloudflare`, `CF-RAY`). Chuỗi thực tế gồm 3 chặng:
 * Cloudflare, load balancer nội bộ Render, rồi tới container. Header quan sát được ở prod:
 * `x-forwarded-for: 14.169.17.140, 172.71.219.39, 10.30.81.130` (lần lượt là IP người dùng,
 * Cloudflare, và nội bộ Render).
 *
 * `trust proxy = 1` ở main.ts khiến `req.ip` — khoá đếm của ThrottlerGuard gốc — dừng ở IP
 * nội bộ Render. IP đó thay đổi giữa các request nên hạn mức bị tách thành nhiều bộ đếm
 * độc lập; biểu hiện là `x-ratelimit-remaining` giảm không đơn điệu.
 *
 * Không sửa bằng cách tăng `trust proxy` lên 3: số chặng cố định sẽ sai khi chuỗi proxy
 * ngắn lại, và khi đó Express tin vào phần `x-forwarded-for` do client tự đặt, tạo đường
 * vượt hạn mức bằng header giả. `cf-connecting-ip` không có vấn đề này vì Cloudflare luôn
 * ghi đè nó bằng IP của kết nối TCP.
 *
 * Thiếu header thì fallback về `req.ip`, giữ nguyên hành vi trước đó. Môi trường local
 * không đi qua Cloudflare nên luôn dùng nhánh fallback.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  // `true-client-ip` là header tương đương của gói Enterprise, không có ở tier hiện tại.
  private static readonly CLIENT_IP_HEADER = 'cf-connecting-ip';

  private readonly logger = new Logger(ClientIpThrottlerGuard.name);

  private hasWarnedMissingHeader = false;

  /**
   * Khoá định danh dùng để gom bộ đếm hạn mức của một request. Trả Promise cho khớp chữ ký
   * lớp cha; bên trong không có thao tác bất đồng bộ nào.
   */
  protected getTracker(req: Record<string, any>): Promise<string> {
    const clientIp = this.readClientIpHeader(req);
    if (clientIp) {
      return Promise.resolve(clientIp);
    }

    this.warnMissingHeaderOnce();
    return Promise.resolve(this.readRequestIp(req));
  }

  private readClientIpHeader(req: Record<string, any>): string | null {
    const headers: unknown = req?.headers;
    if (typeof headers !== 'object' || headers === null) {
      return null;
    }

    const raw: unknown = (headers as Record<string, unknown>)[
      ClientIpThrottlerGuard.CLIENT_IP_HEADER
    ];
    // Express gom header trùng tên thành mảng. Cloudflare chỉ gửi một giá trị; nếu có
    // nhiều thì phần tử đầu là của chặng ngoài cùng.
    const value: unknown = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Fallback giống ThrottlerGuard gốc. Trả `'unknown'` khi `req.ip` không phải chuỗi để
   * khoá đếm không rơi vào `undefined`.
   */
  private readRequestIp(req: Record<string, any>): string {
    const ip: unknown = req?.ip;
    return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown';
  }

  /**
   * Thiếu header là trạng thái cố định của tiến trình nên chỉ log một lần, tránh lặp lại ở
   * mọi request. Chỉ áp dụng cho production vì local không đi qua Cloudflare.
   */
  private warnMissingHeaderOnce(): void {
    if (this.hasWarnedMissingHeader) {
      return;
    }
    this.hasWarnedMissingHeader = true;

    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    this.logger.warn(
      `[ClientIpThrottlerGuard] Không tìm thấy header ${ClientIpThrottlerGuard.CLIENT_IP_HEADER} ở production, ` +
        'rate limit đang đếm theo req.ip tức IP của proxy thay vì của người dùng.',
    );
  }
}
