import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Registry,
  collectDefaultMetrics,
  Histogram,
  Gauge,
  Counter,
} from 'prom-client';

import { OutboxEvent } from '@/common/entities/outbox-event.entity';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // Histogram thay vì trung bình: p95 mới nói lên trải nghiệm người dùng,
  // trung bình che mất đuôi chậm.
  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Thời gian xử lý request theo route và status',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

  // Tuổi của event cũ nhất chưa publish — chỉ số sức khoẻ số 1 của outbox.
  readonly outboxLag = new Gauge({
    name: 'outbox_oldest_unpublished_age_seconds',
    help: 'Tuổi (giây) của outbox event cũ nhất chưa được publish',
  });

  // Tổng lượt tìm kiếm đi qua search-service, phân theo kết quả cuối cùng. Mẫu số để tính
  // tỉ lệ fallback: served (index trả có hàng) + empty (index trả rỗng hợp lệ) + fallback
  // (index không dùng được, đã rơi ILIKE). PromQL:
  //   rate(search_requests_total{outcome="fallback"}[5m]) / rate(search_requests_total[5m])
  readonly searchRequests = new Counter({
    name: 'search_requests_total',
    help: 'Số lượt tìm kiếm qua search-service theo kết quả (served|empty|fallback)',
    labelNames: ['outcome'],
  });

  // Chỉ đếm các lượt PHẢI rơi về ILIKE, kèm lý do để chẩn đoán: timeout (cold-start/chậm),
  // http_5xx (edge-proxy khi service ngủ/deploy), http_4xx (sai request hoặc bị chặn),
  // bad_shape (JSON thiếu items), network (connection refused / đứt mạng), circuit_open (chủ động
  // không gọi vì circuit đang mở). Tách khỏi outcome=fallback để soi được vì sao rơi mà không phải
  // bung nhãn chéo.
  //
  // http_429 đứng riêng khỏi http_4xx vì hai nhóm này dẫn tới hai hướng điều tra ngược nhau: 429 là
  // bị từ chối đánh thức, còn 400/401/403/404 là service ĐÃ trả lời và lỗi nằm ở hợp đồng hoặc cấu
  // hình. Gộp lại thì phải mở log ra mới phân biệt được.
  //
  // circuit_open cao mà http_429 thấp KHÔNG tự nó là tin tốt: nó chỉ nói circuit đang chặn, mà
  // chặn thì có thể vì đang cứu (không spam wake attempt) hoặc vì đang kẹt (search nằm ILIKE mãi).
  // Phải đọc kèm outcome=served ngay sau đó: có served là đang cứu, không có là đang kẹt.
  readonly searchFallback = new Counter({
    name: 'search_fallback_total',
    help: 'Số lượt search rơi về ILIKE theo lý do (timeout|http_5xx|http_429|http_4xx|bad_shape|network|circuit_open)',
    labelNames: ['reason'],
  });

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
  ) {
    this.registry.registerMetric(this.httpDuration);
    this.registry.registerMetric(this.outboxLag);
    this.registry.registerMetric(this.searchRequests);
    this.registry.registerMetric(this.searchFallback);
    // CPU, RAM, event loop lag, GC của chính Node.
    collectDefaultMetrics({ register: this.registry });
  }

  onModuleInit(): void {
    // Cập nhật gauge mỗi 10s. Query rất nhẹ (index trên published_at NULL).
    setInterval(() => {
      void this.refreshOutboxLag();
    }, 10_000);
  }

  private async refreshOutboxLag(): Promise<void> {
    try {
      const row = await this.outboxRepo
        .createQueryBuilder('e')
        .select('MIN(e.created_at)', 'oldest')
        .where('e.published_at IS NULL')
        .getRawOne<{ oldest: Date | null }>();

      const oldest = row?.oldest ?? null;
      this.outboxLag.set(
        oldest ? (Date.now() - new Date(oldest).getTime()) / 1000 : 0,
      );
    } catch {
      // Đo đạc hỏng thì thôi, không được làm ồn log hay ảnh hưởng app.
    }
  }
}
