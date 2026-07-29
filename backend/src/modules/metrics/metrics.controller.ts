import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '@/decorator/customize';
import { MetricsService } from './metrics.service';

// Giấu khỏi Swagger: endpoint này dành cho Prometheus, KHÔNG phải cho frontend.
// Nếu để lộ, `npm run gen-api` sinh thêm type cho /metrics vào api-schema.d.ts —
// vừa là rác trong hợp đồng API của FE (FE không bao giờ gọi), vừa vô nghĩa vì
// response là text/plain định dạng Prometheus chứ không phải JSON.
// Bỏ decorator này ra là CI drift-check đỏ ngay.
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  // @Public() BẮT BUỘC: guard JWT là global, thiếu decorator này thì Prometheus
  // nhận 401 và target luôn hiện DOWN.
  //
  // @SkipThrottle() cũng BẮT BUỘC và là chỗ dễ sót: @Public() chỉ bỏ qua guard
  // JWT, KHÔNG bỏ qua ThrottlerGuard (cũng là guard toàn cục, 100 req/60s mỗi
  // IP). Prometheus scrape đều đặn từ MỘT IP, cộng thêm traffic khác cùng IP là
  // vượt ngưỡng → scrape ăn 429 → target flap DOWN đúng lúc cần metric nhất.
  //
  // @Res() (KHÔNG passthrough) để tự ghi response: TransformInterceptor là
  // global, mọi handler trả về đều bị bọc thành {statusCode, message, data}.
  // Prometheus cần TEXT THUẦN — nhận JSON envelope là parse lỗi, target DOWN.
  // Ghi thẳng vào res thì Nest bỏ qua giá trị trả về nên envelope không áp vào.
  @Public()
  @SkipThrottle()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.metricsService.registry.metrics();
    res.setHeader('Content-Type', this.metricsService.registry.contentType);
    res.send(body);
  }
}
