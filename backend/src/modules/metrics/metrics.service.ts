import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Registry, collectDefaultMetrics, Histogram, Gauge } from 'prom-client';

import { OutboxEvent } from '@/modules/orders/entities/outbox-event.entity';

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

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
  ) {
    this.registry.registerMetric(this.httpDuration);
    this.registry.registerMetric(this.outboxLag);
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
