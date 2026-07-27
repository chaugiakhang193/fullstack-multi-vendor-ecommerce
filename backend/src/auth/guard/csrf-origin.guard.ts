import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Chốt CSRF cho các endpoint xác thực bằng COOKIE.
 *
 * Vì sao chỉ cần cho vài endpoint chứ không bọc cả API: CSRF chỉ đe doạ những route mà
 * trình duyệt tự đính kèm thông tin xác thực. Toàn bộ route nghiệp vụ ở đây đi qua
 * AccessTokenGuard (global) và đòi header `Authorization: Bearer` — header đó trình duyệt
 * KHÔNG tự thêm, còn trang lạ muốn thêm thì request thành non-simple, dính preflight và bị
 * CORS chặn trước khi rời máy nạn nhân. Nên chúng miễn nhiễm sẵn về mặt cấu trúc.
 *
 * Cửa còn lại là `POST /auth/refresh`: nó xác thực bằng cookie `refresh_token`, mà cookie ở
 * production phải để `SameSite=None` (FE Vercel ≠ BE Render = cross-site, xem cookie.helper.ts)
 * → lá chắn SameSite tắt hoàn toàn. Một form POST từ site lạ là "simple request", không cần
 * preflight, nên tới được server kèm cookie. Kẻ tấn công KHÔNG đọc được response (CORS chặn
 * đúng chỗ đó) nên không trộm được token, nhưng vẫn xoay được refresh token ngoài ý muốn —
 * kết hợp với reuse detection thì token cũ còn kẹt ở tab nạn nhân sẽ bị coi là reuse
 * và đá họ khỏi phiên. Tức là thiệt hại thật = buộc đăng xuất, không phải lộ dữ liệu.
 *
 * THIẾU `Origin` → CHO QUA, có chủ đích. Đòn CSRF từ trình duyệt không thể bỏ header này
 * (trình duyệt tự gắn cho mọi request cross-site và cho cả POST same-site), nên fail-open
 * không hở thêm gì; đổi lại client không phải trình duyệt (Postman, script, app mobile sau
 * này) vẫn refresh được. Fail-closed chỉ gãy client hợp lệ mà không chặn thêm được đòn nào.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const requestOrigin = this.resolveRequestOrigin(request);

    // Không phải trình duyệt (hoặc trình duyệt không gửi Origin) → không phải bề mặt CSRF.
    if (!requestOrigin) {
      return true;
    }

    const allowedOrigin = this.getAllowedOrigin();
    // Chưa khai FRONTEND_URL thì không có gì để so — không tự dựng rào chặn nhầm cả app.
    if (!allowedOrigin) {
      this.logger.warn(
        '[CsrfOriginGuard] FRONTEND_URL chưa khai — bỏ qua kiểm tra Origin.',
      );
      return true;
    }

    if (requestOrigin !== allowedOrigin) {
      this.logger.warn(
        `[CsrfOriginGuard] Chặn request cookie-auth từ origin lạ: "${requestOrigin}" (cho phép: "${allowedOrigin}").`,
      );
      throw new ForbiddenException(
        'Yêu cầu bị từ chối vì đến từ nguồn không hợp lệ.',
      );
    }

    return true;
  }

  /**
   * Lấy origin của bên gửi. Ưu tiên `Origin`; thiếu thì suy từ `Referer` — chỉ lấy phần
   * origin, bỏ path/query (Referer có kèm đường dẫn, so nguyên chuỗi là trượt).
   */
  private resolveRequestOrigin(request: Request): string | null {
    const origin = request.headers.origin;
    if (origin) {
      // 'null' là chuỗi trình duyệt gửi cho ngữ cảnh opaque (sandboxed iframe, file://) —
      // không phải origin hợp lệ và KHÔNG được coi là "thiếu Origin" để lọt qua fail-open.
      return origin === 'null' ? 'null' : this.toOrigin(origin);
    }

    const referer = request.headers.referer;
    return referer ? this.toOrigin(referer) : null;
  }

  private getAllowedOrigin(): string | null {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    return frontendUrl ? this.toOrigin(frontendUrl) : null;
  }

  /**
   * Chuẩn hoá về dạng origin (`scheme://host[:port]`). Bắt buộc phải qua URL parser chứ
   * không so chuỗi thô: `FRONTEND_URL` có thể có/không dấu `/` cuối, còn header `Origin`
   * thì không bao giờ có — so thẳng là hỏng ở mọi request.
   */
  private toOrigin(value: string): string {
    try {
      return new URL(value).origin;
    } catch {
      // Không parse được → trả nguyên văn để nó không khớp allowlist và bị chặn.
      return value;
    }
  }
}
