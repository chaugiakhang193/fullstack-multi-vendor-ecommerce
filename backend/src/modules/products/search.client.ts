// NestJS
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Services
import { MetricsService } from '@/modules/metrics/metrics.service';

// Helpers
import { formatEdgeHeaders } from '@/common/helpers/edge-headers.helper';

// Kết quả thô từ search-service: id + điểm relevance, đã xếp hạng sẵn (Pattern B).
export interface SearchCandidate {
  productId: string;
  rank: number;
}

// Tham số truy hồi candidate. Các trường lọc là tuỳ chọn (bỏ trống = không lọc).
export interface SearchQueryParams {
  q: string;
  minPrice?: number;
  maxPrice?: number;
  shopId?: string;
  categoryIds?: string[];
}

/**
 * Client gọi search-service (Go) cho stage 1 của two-stage retrieval: lấy top-K product ID
 * đã xếp hạng relevance. Stage 2 (lọc volatile + sort + phân trang + hydrate) do monolith làm.
 *
 * Triết lý: search chỉ là tối ưu. Mọi lỗi/timeout → trả null để caller fallback về ILIKE cũ;
 * KHÔNG bao giờ ném ra request. Message nghiệp vụ không đi qua đây nên không có gì để mất.
 */
@Injectable()
export class SearchClient {
  private readonly logger = new Logger(SearchClient.name);

  // Cửa sổ candidate: lấy top-K id đã rank trong 1 lần gọi, monolith tự phân trang lại.
  // Khớp maxLimit=300 bên search-service.
  private static readonly CANDIDATE_LIMIT = 300;

  // Timeout cho mỗi lần gọi search-service. Khi service đã ấm, /search phản hồi khoảng
  // 170–300ms, nên ngưỡng 300ms trước đây dễ hết giờ ngay cả lúc service hoạt động bình thường.
  // Nâng lên 700ms để dung sai độ trễ khi ấm; vẫn nhỏ hơn nhiều so với cold-start (~13s) nên khi
  // service ngủ sẽ vượt ngưỡng và fallback về ILIKE đúng như thiết kế.
  private static readonly TIMEOUT_MS = 700;

  // Sau chừng này mà không có lời gọi nào thành công thì coi bằng chứng "service đang thức" là hết
  // hạn, dù circuit vẫn đang đóng.
  //
  // Render cho instance ngủ sau 15' không có traffic vào, nên một khoảng lặng đủ dài là đủ để
  // service ngủ mà không ai hay. Lấy "lần gần nhất từng thành công" làm bằng chứng vô thời hạn sẽ
  // dẫn tới đúng kịch bản đã sinh ra sự cố: cụm search đầu tiên sau giờ vắng khách cùng thấy circuit
  // đóng và cùng bắn ra mạng. 14' để hết hạn TRƯỚC lúc Render thật sự cho ngủ.
  //
  // Đây là đánh đổi có giá, không phải an toàn miễn phí: một request tới ở phút 14 vốn vẫn gặp
  // service đang thức, và chính nó sẽ reset đồng hồ idle — nhưng ta chủ động fallback. Với traffic
  // thưa, lượt search đầu của mỗi khoảng ~14' sẽ luôn chạy ILIKE. Đổi một truy vấn đầu lấy việc
  // không bao giờ bắn abort vào một instance có thể đang ngủ.
  private static readonly STALE_AFTER_MS = 14 * 60 * 1000;

  // Quy ước circuit breaker chuẩn: 'closed' là khoẻ và cho đi qua, 'open' là đang chặn.
  //
  // Khởi tạo 'open' chứ không phải 'closed': lúc tiến trình vừa dựng thì ta chưa có bằng chứng nào
  // về search-service, mà đoán sai theo hướng lạc quan nghĩa là tái tạo đúng cú abort 700ms vào một
  // instance có thể đang ngủ. Lượt search đầu sau khi boot rơi ILIKE và nhường warmup đánh thức.
  private circuit: 'closed' | 'open' = 'open';

  // Epoch ms của lần CHẠM ĐƯỢC gần nhất: /search thành công, hoặc warmup poke được 2xx.
  private lastReachableAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  // Bật khi CÓ CẢ flag=true VÀ URL. Flag OFF mặc định → luôn dùng path DB cũ.
  isEnabled(): boolean {
    const flag = this.configService.get<string>('SEARCH_SERVICE_ENABLED');
    const url = this.configService.get<string>('SEARCH_SERVICE_URL');
    return flag === 'true' && !!url;
  }

  /**
   * Gọi GET /search lấy candidate đã xếp hạng + đếm metric outcome/reason.
   * - null  = lỗi/timeout/shape sai → caller fallback ILIKE (đếm outcome=fallback + reason).
   * - []    = 200 nhưng rỗng → kết quả rỗng hợp lệ (đếm outcome=empty), KHÔNG fallback.
   * - mảng  = có hàng (đếm outcome=served).
   */
  async fetchCandidates(
    params: SearchQueryParams,
  ): Promise<SearchCandidate[] | null> {
    const baseUrl = this.configService.get<string>('SEARCH_SERVICE_URL');
    if (!baseUrl) {
      // isEnabled() đã chặn nhánh này; phòng thủ, không đếm (misconfig hiếm).
      return null;
    }

    // Quyết định TRƯỚC mọi await, và admit() đồng bộ trọn vẹn. Nếu có await xen giữa lúc đọc trạng
    // thái và lúc ghi nó, hai request đồng thời sẽ cùng đọc trạng thái cũ rồi cùng đi ra mạng —
    // đúng cái cụm wake attempt mà commit này dựng lên để tránh.
    if (!this.admit()) {
      this.recordFallback('circuit_open');
      return null;
    }

    const url = this.buildUrl(baseUrl, params);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      SearchClient.TIMEOUT_MS,
    );

    try {
      const res = await fetch(url, { signal: controller.signal });
      // 5xx từ edge-proxy khi service ngủ/deploy vẫn resolve fetch → coi là lỗi, fallback.
      if (!res.ok) {
        // 429 có nhãn riêng chứ không gộp vào http_4xx. Nhánh trip ngay dưới đã biết 429 là đặc
        // biệt; nếu nhãn không biết thì thông tin đó bị vứt đi, và một cú 404 sai cấu hình trông
        // giống hệt một lần bị từ chối đánh thức — hai chuyện dẫn tới hai hướng điều tra ngược nhau.
        let reason = 'http_4xx';
        if (res.status >= 500) {
          reason = 'http_5xx';
        } else if (res.status === 429) {
          reason = 'http_429';
        }
        this.recordFallback(reason);
        // Chỉ 5xx và 429 là tín hiệu KHẢ DỤNG. 400/401/403/404 nghĩa là service đã trả lời được,
        // cùng loại với bad_shape: lỗi hợp đồng hoặc cấu hình, mở circuit chỉ giấu nó đi.
        if (res.status >= 500 || res.status === 429) {
          this.trip();
        } else {
          // Một cú 404 vẫn chứng minh service sống. Không làm mới bằng chứng ở đây thì mốc stale
          // sẽ mở circuit oan, dù chưa có gì hỏng về khả dụng.
          this.markReachable();
        }
        this.logger.warn(
          `[SearchClient] search-service trả HTTP ${res.status} → fallback ILIKE${formatEdgeHeaders(res.headers)}`,
        );
        return null;
      }
      const body = (await res.json()) as { items?: SearchCandidate[] };
      // items thiếu/không phải mảng = shape sai → coi như lỗi, fallback.
      if (!Array.isArray(body.items)) {
        this.recordFallback('bad_shape');
        // 200 với body sai hình dạng vẫn là bằng chứng service sống — cùng lý do với nhánh 4xx.
        this.markReachable();
        this.logger.warn(
          '[SearchClient] response thiếu items → fallback ILIKE',
        );
        return null;
      }
      // Thành công: phân biệt có hàng vs rỗng hợp lệ (cả hai KHÔNG fallback).
      this.metricsService.searchRequests.inc({
        outcome: body.items.length > 0 ? 'served' : 'empty',
      });
      this.markReachable();
      return body.items;
    } catch (err) {
      // AbortError = quá TIMEOUT_MS (thường cold-start); còn lại là lỗi mạng.
      const reason =
        (err as Error).name === 'AbortError' ? 'timeout' : 'network';
      this.recordFallback(reason);
      this.trip();
      this.logger.warn(
        `[SearchClient] gọi search-service lỗi (${reason}): ${(err as Error).message} → fallback ILIKE`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Gộp 2 counter cho 1 lần rơi ILIKE: outcome=fallback (mẫu số) + reason (chẩn đoán).
  private recordFallback(reason: string): void {
    this.metricsService.searchRequests.inc({ outcome: 'fallback' });
    this.metricsService.searchFallback.inc({ reason });
  }

  // Cho phép lời gọi này ra mạng hay không. ĐỒNG BỘ trọn vẹn, không await, để hai request cùng lúc
  // không thể cùng đọc trạng thái cũ.
  private admit(): boolean {
    if (this.circuit === 'open') {
      return false;
    }
    // Circuit đóng, nhưng bằng chứng đã cũ hơn STALE_AFTER_MS thì nó không còn là bằng chứng:
    // service có thể đã ngủ trong quãng vắng khách. Mở circuit và để warmup đi xác minh, thay vì
    // để cả cụm search đầu giờ cùng lao vào một instance có thể đang ngủ.
    if (Date.now() - this.lastReachableAt >= SearchClient.STALE_AFTER_MS) {
      this.circuit = 'open';
      return false;
    }
    return true;
  }

  // Mở circuit sau một tín hiệu KHẢ DỤNG. bad_shape và 4xx-không-phải-429 không gọi hàm này:
  // service đã trả lời được, ngừng gọi không sửa được gì mà còn giấu mất một lỗi thật.
  private trip(): void {
    this.circuit = 'open';
  }

  // Đóng circuit lại. Gọi từ hai chỗ: một lời gọi /search thành công, và SearchWarmup khi poke
  // /health được 2xx — đó là bằng chứng service đã dậy, không cần bắt khách đợi thêm.
  markReachable(): void {
    this.circuit = 'closed';
    this.lastReachableAt = Date.now();
  }

  // Dựng query string. page=1 + limit=CANDIDATE_LIMIT vì monolith phân trang lại ở stage 2.
  private buildUrl(baseUrl: string, params: SearchQueryParams): string {
    const qs = new URLSearchParams();
    qs.set('q', params.q);
    qs.set('page', '1');
    qs.set('limit', String(SearchClient.CANDIDATE_LIMIT));
    if (params.minPrice !== undefined) {
      qs.set('min_price', String(params.minPrice));
    }
    if (params.maxPrice !== undefined) {
      qs.set('max_price', String(params.maxPrice));
    }
    if (params.shopId) {
      qs.set('shop_id', params.shopId);
    }
    if (params.categoryIds && params.categoryIds.length > 0) {
      qs.set('category_ids', params.categoryIds.join(','));
    }
    return `${baseUrl}/search?${qs.toString()}`;
  }
}
