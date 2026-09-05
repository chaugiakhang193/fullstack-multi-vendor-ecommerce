import { SearchWarmupService } from './search-warmup.service';

function makeService(searchClient: any = { markReachable: jest.fn() }) {
  const config = { get: jest.fn(() => 'https://search.test') } as any;
  return { svc: new SearchWarmupService(config, searchClient), searchClient };
}

// warm() là fire-and-forget nên phải nhường một nhịp cho chuỗi poke chạy.
function nhuongNhip() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('SearchWarmupService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('poke trả 2xx thì gọi markReachable đúng một lần', async () => {
    const { svc, searchClient } = makeService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });

    svc.warm();
    await nhuongNhip();

    expect(searchClient.markReachable).toHaveBeenCalledTimes(1);
  });

  it('tám lần warm() đồng thời chỉ tạo ĐÚNG MỘT lời gọi /health', async () => {
    const { svc } = makeService();
    // fetch treo mãi: mô phỏng đúng lúc nguy hiểm nhất — cú poke đầu đang chờ cold start hàng chục
    // giây, và cả cụm request khác ập tới trong lúc đó.
    const fetchMock = jest.fn().mockReturnValue(new Promise(() => {}));
    global.fetch = fetchMock;

    for (let i = 0; i < 8; i++) {
      svc.warm();
    }
    await nhuongNhip();

    // Test bên SearchClient chỉ chứng minh không có /search nào đi ra. Đây là nửa còn lại: tầng
    // warmup cũng không được biến một cụm khách thành một cụm wake attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://search.test/health');
  });
});
