import { Controller, Get, Header } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

// NS KHONG co JWT guard / Throttler / TransformInterceptor global (khac monolith)
// nen endpoint nay don gian: tra text thuan, khong can @Public/@SkipThrottle/@Res.
// @Header dat content-type Prometheus (text/plain 0.0.4) — khop registry.contentType.
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  getMetrics(): Promise<string> {
    return this.metricsService.registry.metrics();
  }
}
