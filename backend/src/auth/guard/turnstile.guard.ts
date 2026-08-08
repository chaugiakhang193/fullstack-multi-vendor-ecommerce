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
 * Xác thực Cloudflare Turnstile cho các endpoint auth public. Đọc token ở header
 * `x-captcha-token` (không phải body vì ValidationPipe forbidNonWhitelisted sẽ chặn field lạ),
 * gọi siteverify của Cloudflare, chặn nếu token thiếu/sai.
 *
 * Triết lý fail-open theo CsrfOriginGuard: chưa khai secret → CAPTCHA tắt (dev/test không kẹt);
 * siteverify lỗi hạ tầng → tạm cho qua (không khoá người dùng vì sự cố bên thứ ba, auth-throttle
 * vẫn chặn). Chỉ chặn khi secret ĐÃ khai mà token thiếu hoặc Cloudflare trả không hợp lệ.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);
  private hasWarnedMissingSecret = false;

  private static readonly VERIFY_URL =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private static readonly TIMEOUT_MS = 5000;

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.configService.get<string>('TURNSTILE_SECRET');
    if (!secret) {
      this.warnMissingSecretOnce();
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-captcha-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new ForbiddenException('Thiếu xác thực CAPTCHA. Vui lòng thử lại.');
    }

    const ok = await this.verify(secret, token, this.resolveIp(request));
    if (!ok) {
      throw new ForbiddenException(
        'Xác thực CAPTCHA thất bại. Vui lòng thử lại.',
      );
    }
    return true;
  }

  private async verify(
    secret: string,
    token: string,
    remoteip: string | undefined,
  ): Promise<boolean> {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (remoteip) {
      form.set('remoteip', remoteip);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TurnstileGuard.TIMEOUT_MS,
    );
    try {
      const res = await fetch(TurnstileGuard.VERIFY_URL, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(
          `[TurnstileGuard] siteverify trả HTTP ${res.status} → tạm cho qua (fail-open hạ tầng)`,
        );
        return true;
      }
      const data = (await res.json()) as {
        success: boolean;
        'error-codes'?: string[];
      };
      if (!data.success) {
        this.logger.warn(
          `[TurnstileGuard] token không hợp lệ: ${(data['error-codes'] || []).join(',')}`,
        );
      }
      return data.success === true;
    } catch (err) {
      this.logger.warn(
        `[TurnstileGuard] gọi siteverify lỗi (${(err as Error).message}) → tạm cho qua`,
      );
      return true;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Ưu tiên IP thật khi sau proxy (Render trust proxy). remoteip là tuỳ chọn của siteverify.
  private resolveIp(request: Request): string | undefined {
    const xff = request.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (raw) {
      return raw.split(',')[0].trim();
    }
    return request.ip;
  }

  private warnMissingSecretOnce(): void {
    if (this.hasWarnedMissingSecret) {
      return;
    }
    this.hasWarnedMissingSecret = true;
    this.logger.error(
      '[TurnstileGuard] TURNSTILE_SECRET CHƯA KHAI — CAPTCHA đang TẮT trên các endpoint auth. ' +
        'Set biến này ở prod để bật.',
    );
  }
}
