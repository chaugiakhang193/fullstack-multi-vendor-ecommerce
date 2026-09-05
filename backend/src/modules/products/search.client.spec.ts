import { SearchClient } from './search.client';

// ConfigService giả: fetchCandidates chỉ đọc SEARCH_SERVICE_URL.
function makeConfig() {
  return { get: jest.fn(() => 'https://search.test') } as any;
}

// MetricsService giả, giữ lại nhãn đã đếm để khẳng định ĐÚNG lý do fallback chứ không chỉ
// khẳng định "có fallback".
function makeMetrics() {
  const reasons: string[] = [];
  const outcomes: string[] = [];
  const service = {
    searchRequests: {
      inc: (labels: { outcome: string }) => outcomes.push(labels.outcome),
    },
    searchFallback: {
      inc: (labels: { reason: string }) => reasons.push(labels.reason),
    },
  } as any;
  return { service, reasons, outcomes };
}

function makeClient() {
  const metrics = makeMetrics();
  return { client: new SearchClient(makeConfig(), metrics.service), metrics };
}

// Circuit khởi tạo ở 'open', nên phần lớn test phải đưa nó về 'closed' trước rồi mới đo thứ
// mình quan tâm. markReachable là đường duy nhất làm việc đó từ bên ngoài.
function makeClosedClient() {
  const built = makeClient();
  built.client.markReachable();
  return built;
}

function response(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body ?? {},
  };
}

const coHang = { items: [{ productId: 'p1', rank: 1 }] };
const params = { q: 'laptop' };

describe('SearchClient — circuit breaker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('khởi tạo ở open: lượt search đầu sau khi boot KHÔNG chạm mạng', async () => {
    const { client, metrics } = makeClient();
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const ketQua = await client.fetchCandidates(params);

    // Tiến trình vừa dựng thì chưa có bằng chứng nào về search-service. Đoán lạc quan ở đây nghĩa
    // là bắn một cú abort 700ms vào một instance có thể đang ngủ — đúng thứ gây ra sự cố.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ketQua).toBeNull();
    expect(metrics.reasons).toEqual(['circuit_open']);
  });

  it('429 mở circuit, lượt sau không chạm mạng', async () => {
    const { client, metrics } = makeClosedClient();
    const fetchMock = jest.fn().mockResolvedValue(response(429));
    global.fetch = fetchMock;

    await client.fetchCandidates(params);
    await client.fetchCandidates(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // http_429 chứ không phải http_4xx: nhãn phải phân biệt được "bị từ chối đánh thức" với một cú
    // 404 sai cấu hình, vì hai thứ đó dẫn tới hai hướng điều tra khác nhau.
    expect(metrics.reasons).toEqual(['http_429', 'circuit_open']);
  });

  it('timeout cũng mở circuit', async () => {
    const { client, metrics } = makeClosedClient();
    const abortError = new Error('This operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    await client.fetchCandidates(params);
    await client.fetchCandidates(params);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(metrics.reasons).toEqual(['timeout', 'circuit_open']);
  });

  it.each([400, 401, 403, 404])(
    'HTTP %i KHÔNG mở circuit — service đã trả lời được',
    async (status) => {
      const { client, metrics } = makeClosedClient();
      const fetchMock = jest.fn().mockResolvedValue(response(status));
      global.fetch = fetchMock;

      await client.fetchCandidates(params);
      await client.fetchCandidates(params);

      // Lỗi hợp đồng hoặc cấu hình. Mở circuit chỉ giấu nó đi chứ không sửa được gì.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(metrics.reasons).toEqual(['http_4xx', 'http_4xx']);
    },
  );

  it('response thiếu items KHÔNG mở circuit', async () => {
    const { client, metrics } = makeClosedClient();
    const fetchMock = jest.fn().mockResolvedValue(response(200, {}));
    global.fetch = fetchMock;

    await client.fetchCandidates(params);
    await client.fetchCandidates(params);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(metrics.reasons).toEqual(['bad_shape', 'bad_shape']);
  });

  it('bằng chứng cũ hơn 14 phút thì mở circuit, dù lần gần nhất đã thành công', async () => {
    const { client, metrics } = makeClosedClient();
    const fetchMock = jest.fn().mockResolvedValue(response(200, coHang));
    global.fetch = fetchMock;

    await client.fetchCandidates(params);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Đây là kịch bản đã sinh ra sự cố thật: sàn vắng khách một lúc, Render cho instance ngủ, rồi
    // cụm search đầu tiên ập tới. "Lần gần nhất từng thành công" không còn là bằng chứng.
    const sau15Phut = Date.now() + 15 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(sau15Phut);

    const ketQua = await client.fetchCandidates(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ketQua).toBeNull();
    expect(metrics.reasons).toEqual(['circuit_open']);
  });

  it('cụm request đồng thời sau mốc stale chỉ tạo ĐÚNG MỘT lời gọi ra mạng', async () => {
    const { client } = makeClosedClient();
    const fetchMock = jest.fn().mockResolvedValue(response(200, coHang));
    global.fetch = fetchMock;

    await client.fetchCandidates(params);
    fetchMock.mockClear();

    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 15 * 60 * 1000);

    // Tám lượt cùng lúc, mô phỏng nhiều khách gõ search cùng một nhịp. admit() chạy đồng bộ nên
    // lượt đầu đã kịp mở circuit trước khi lượt thứ hai đọc trạng thái.
    await Promise.all(
      Array.from({ length: 8 }, () => client.fetchCandidates(params)),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([404, 200])(
    'response %i không-khả-dụng-lỗi vẫn LÀM MỚI bằng chứng reachability',
    async (status) => {
      const { client } = makeClosedClient();
      // 404 và 200-thiếu-items đều chứng minh service sống. Nếu không làm mới lastReachableAt thì
      // mốc stale sẽ mở circuit oan ngay sau đó, dù chưa có gì hỏng về khả dụng.
      const fetchMock = jest.fn().mockResolvedValue(response(status, {}));
      global.fetch = fetchMock;

      const batDau = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(batDau + 13 * 60 * 1000);
      await client.fetchCandidates(params);

      // Mốc reachability giờ phải là phút 13, nên phút 20 vẫn còn trong hạn 14 phút.
      jest.spyOn(Date, 'now').mockReturnValue(batDau + 20 * 60 * 1000);
      await client.fetchCandidates(params);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it('markReachable đóng circuit lại', async () => {
    const { client } = makeClosedClient();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(200, coHang));
    global.fetch = fetchMock;

    await client.fetchCandidates(params);
    client.markReachable();
    const ketQua = await client.fetchCandidates(params);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(ketQua).toEqual(coHang.items);
  });
});
