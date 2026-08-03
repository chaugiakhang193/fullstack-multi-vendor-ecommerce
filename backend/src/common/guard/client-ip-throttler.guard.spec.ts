import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from '@/common/guard/client-ip-throttler.guard';

/**
 * `getTracker` là protected nên test đi qua lớp con mở lại phạm vi. Guard chỉ đọc header và
 * `req.ip` nên không cần Nest context thật; constructor của ThrottlerGuard chỉ gán field.
 */
class TestableGuard extends ClientIpThrottlerGuard {
  public track(req: Record<string, any>): Promise<string> {
    return this.getTracker(req);
  }
}

describe('ClientIpThrottlerGuard', () => {
  const CLIENT_IP = '14.169.17.140';
  const PROXY_IP = '10.30.81.130';

  const makeGuard = (): TestableGuard =>
    new TestableGuard(
      [],
      {} as unknown as ThrottlerStorage,
      {} as unknown as Reflector,
    );

  it('có cf-connecting-ip thì đếm theo IP đó, không theo req.ip', async () => {
    const guard = makeGuard();

    await expect(
      guard.track({ headers: { 'cf-connecting-ip': CLIENT_IP }, ip: PROXY_IP }),
    ).resolves.toBe(CLIENT_IP);
  });

  it('cắt khoảng trắng thừa quanh giá trị header', async () => {
    const guard = makeGuard();

    await expect(
      guard.track({
        headers: { 'cf-connecting-ip': `  ${CLIENT_IP} ` },
        ip: PROXY_IP,
      }),
    ).resolves.toBe(CLIENT_IP);
  });

  // Express gom header trùng tên thành mảng.
  it('header dạng mảng thì lấy phần tử đầu', async () => {
    const guard = makeGuard();

    await expect(
      guard.track({
        headers: { 'cf-connecting-ip': [CLIENT_IP, '203.0.113.9'] },
        ip: PROXY_IP,
      }),
    ).resolves.toBe(CLIENT_IP);
  });

  it('không có header thì fallback req.ip', async () => {
    const guard = makeGuard();

    await expect(guard.track({ headers: {}, ip: PROXY_IP })).resolves.toBe(
      PROXY_IP,
    );
  });

  it('header rỗng cũng fallback req.ip', async () => {
    const guard = makeGuard();

    await expect(
      guard.track({ headers: { 'cf-connecting-ip': '   ' }, ip: PROXY_IP }),
    ).resolves.toBe(PROXY_IP);
  });

  // Không xảy ra với Express, nhưng khoá đếm không được phép thành `undefined`.
  it('thiếu cả header lẫn req.ip thì trả "unknown"', async () => {
    const guard = makeGuard();

    await expect(guard.track({ headers: {} })).resolves.toBe('unknown');
  });

  it('chỉ log cảnh báo thiếu header một lần cho mỗi tiến trình', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const guard = makeGuard();
    const warn = jest
      .spyOn(guard['logger'], 'warn')
      .mockImplementation(() => undefined);

    await guard.track({ headers: {}, ip: PROXY_IP });
    await guard.track({ headers: {}, ip: PROXY_IP });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    process.env.NODE_ENV = previousNodeEnv;
  });
});
