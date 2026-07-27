import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CsrfOriginGuard } from '@/auth/guard/csrf-origin.guard';

/**
 * Guard chỉ đọc header + config nên test thuần mock, không cần Nest context thật.
 */
describe('CsrfOriginGuard', () => {
  const FRONTEND = 'https://fullstack-multi-vendor-ecommerce.vercel.app';

  // ExecutionContext tối giản: guard chỉ chạm switchToHttp().getRequest().headers.
  const contextWith = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  const makeGuard = (frontendUrl?: string): CsrfOriginGuard =>
    new CsrfOriginGuard({
      get: () => frontendUrl,
    } as unknown as ConfigService);

  it('Origin khớp FRONTEND_URL → cho qua', () => {
    const guard = makeGuard(FRONTEND);

    expect(guard.canActivate(contextWith({ origin: FRONTEND }))).toBe(true);
  });

  it('Origin lạ → ForbiddenException', () => {
    const guard = makeGuard(FRONTEND);

    expect(() =>
      guard.canActivate(contextWith({ origin: 'https://evil.com' })),
    ).toThrow(ForbiddenException);
  });

  // Bẫy chính: FRONTEND_URL hay bị viết kèm '/' cuối, còn header Origin thì KHÔNG BAO GIỜ có
  // → so chuỗi thô sẽ trượt ở mọi request và khoá sạch người dùng thật.
  it('FRONTEND_URL có dấu / cuối vẫn khớp Origin không có dấu /', () => {
    const guard = makeGuard(`${FRONTEND}/`);

    expect(guard.canActivate(contextWith({ origin: FRONTEND }))).toBe(true);
  });

  it('Thiếu cả Origin lẫn Referer → cho qua (client không phải trình duyệt)', () => {
    const guard = makeGuard(FRONTEND);

    expect(guard.canActivate(contextWith({}))).toBe(true);
  });

  it('Không có Origin nhưng Referer hợp lệ (kèm path) → cho qua', () => {
    const guard = makeGuard(FRONTEND);

    expect(
      guard.canActivate(
        contextWith({ referer: `${FRONTEND}/checkout?step=2` }),
      ),
    ).toBe(true);
  });

  it('Không có Origin và Referer từ site lạ → chặn', () => {
    const guard = makeGuard(FRONTEND);

    expect(() =>
      guard.canActivate(contextWith({ referer: 'https://evil.com/trap' })),
    ).toThrow(ForbiddenException);
  });

  // Ngữ cảnh opaque (iframe sandbox, file://) gửi đúng chuỗi "null" — phải bị chặn chứ
  // không được nhầm là "thiếu Origin" rồi lọt qua nhánh fail-open.
  it('Origin = "null" (sandboxed iframe) → chặn', () => {
    const guard = makeGuard(FRONTEND);

    expect(() => guard.canActivate(contextWith({ origin: 'null' }))).toThrow(
      ForbiddenException,
    );
  });

  it('Chưa khai FRONTEND_URL → cho qua thay vì tự khoá cả app', () => {
    const guard = makeGuard(undefined);

    expect(guard.canActivate(contextWith({ origin: 'https://evil.com' }))).toBe(
      true,
    );
  });
});
