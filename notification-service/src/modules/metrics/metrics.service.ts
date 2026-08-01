import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

import { NotificationOutbox } from "@/entities/notification-outbox.entity";

// Metric CONSUMER cho notification-service. KHONG do HTTP RED (NS la consumer,
// khong phai web API) — xem canh bao trong observability/prometheus.yml.
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // Dem event da xu ly theo loai + ket qua. result:
  //   success   — dispatch OK, da ack
  //   duplicate — dedup skip / race 23505
  //   poison    — payload hong / PoisonPayloadError → DLQ
  //   retry     — loi tam thoi, day sang retry queue
  //   exhausted — vuot MAX_RETRY → DLQ
  readonly eventsProcessed = new Counter({
    name: "notification_events_processed_total",
    help: "So event consumer da xu ly, theo loai va ket qua",
    labelNames: ["event_type", "result"],
  });

  // Thoi gian xu ly mot event THANH CONG (tu luc co eventType toi luc ack).
  readonly processingDuration = new Histogram({
    name: "notification_event_processing_duration_seconds",
    help: "Thoi gian xu ly mot event thanh cong, theo loai",
    labelNames: ["event_type"],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

  // So message dang nam trong dead-letter queue — cang cao cang dang bao dong.
  // RabbitMqService poll checkQueue roi set gauge nay (chieu phu thuoc 1 chieu).
  readonly dlqDepth = new Gauge({
    name: "notification_dlq_messages",
    help: "So message trong dead-letter queue (notifications.dlq)",
  });

  // Tuoi event outbox NS cu nhat chua publish — mirror outbox lag cua monolith.
  readonly outboxLag = new Gauge({
    name: "notification_outbox_oldest_unpublished_age_seconds",
    help: "Tuoi (giay) cua notification_outbox event cu nhat chua publish",
  });

  constructor(
    @InjectRepository(NotificationOutbox)
    private readonly outboxRepo: Repository<NotificationOutbox>,
  ) {
    this.registry.registerMetric(this.eventsProcessed);
    this.registry.registerMetric(this.processingDuration);
    this.registry.registerMetric(this.dlqDepth);
    this.registry.registerMetric(this.outboxLag);
    // CPU, RAM, event loop lag, GC cua chinh Node.
    collectDefaultMetrics({ register: this.registry });
  }

  onModuleInit(): void {
    // Cap nhat outbox lag moi 10s (query nhe, index tren published_at NULL).
    setInterval(() => {
      void this.refreshOutboxLag();
    }, 10_000);
  }

  private async refreshOutboxLag(): Promise<void> {
    try {
      const row = await this.outboxRepo
        .createQueryBuilder("o")
        .select("MIN(o.created_at)", "oldest")
        .where("o.published_at IS NULL")
        .getRawOne<{ oldest: Date | null }>();

      const oldest = row?.oldest ?? null;
      this.outboxLag.set(
        oldest ? (Date.now() - new Date(oldest).getTime()) / 1000 : 0,
      );
    } catch {
      // Do hong thi thoi, khong lam on log / khong anh huong app.
    }
  }
}
