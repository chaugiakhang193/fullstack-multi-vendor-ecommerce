import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@/modules/metrics/metrics.service';

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

  // Timeout ngắn: search-service ngủ (Render scale-to-zero) hoặc chậm quá ngưỡng thì bỏ,
  // fallback ILIKE. 300ms đủ cho service đã ấm trả lời; cold-start sẽ vượt → fallback đúng ý đồ.
  private static readonly TIMEOUT_MS = 300;

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
        const reason = res.status >= 500 ? 'http_5xx' : 'http_4xx';
        this.recordFallback(reason);
        this.logger.warn(
          `[SearchClient] search-service trả HTTP ${res.status} → fallback ILIKE`,
        );
        return null;
      }
      const body = (await res.json()) as { items?: SearchCandidate[] };
      // items thiếu/không phải mảng = shape sai → coi như lỗi, fallback.
      if (!Array.isArray(body.items)) {
        this.recordFallback('bad_shape');
        this.logger.warn(
          '[SearchClient] response thiếu items → fallback ILIKE',
        );
        return null;
      }
      // Thành công: phân biệt có hàng vs rỗng hợp lệ (cả hai KHÔNG fallback).
      this.metricsService.searchRequests.inc({
        outcome: body.items.length > 0 ? 'served' : 'empty',
      });
      return body.items;
    } catch (err) {
      // AbortError = quá TIMEOUT_MS (thường cold-start); còn lại là lỗi mạng.
      const reason =
        (err as Error).name === 'AbortError' ? 'timeout' : 'network';
      this.recordFallback(reason);
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
