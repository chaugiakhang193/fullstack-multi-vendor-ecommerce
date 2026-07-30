import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    // KHÔNG đo chính endpoint scrape. Prometheus cào 5s/lần, nên nếu đếm thì có
    // một dòng traffic "tự quan sát" ~0.2 req/s chạy vĩnh viễn: trên dashboard
    // RED nó át hết route thật lúc traffic thấp, làm hệ thống trông như đang bận
    // trong khi không có người dùng nào. Đo bản thân dụng cụ đo là đo nhiễu.
    //
    // So theo CLASS của handler, KHÔNG so chuỗi đường dẫn: đổi
    // @Controller('metrics') hoặc đổi global prefix thì cách này vẫn đúng, còn
    // so chuỗi thì âm thầm hết tác dụng và nhiễu quay lại mà không ai biết.
    // Đặt trước startTimer() để không tạo closure đo rồi bỏ đi.
    if (ctx.getClass() === MetricsController) {
      return next.handle();
    }

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { route?: { path?: string } }>();
    const res = http.getResponse<Response>();
    const stop = this.metricsService.httpDuration.startTimer();

    return next.handle().pipe(
      tap({
        next: () => {
          // Dùng route pattern (/products/:id), KHÔNG dùng url thật (/products/abc-123):
          // url thật làm nổ cardinality — mỗi id thành một chuỗi metric riêng.
          stop({
            method: req.method,
            route: req.route?.path ?? 'unknown',
            status: String(res.statusCode),
          });
        },
        // Lấy status TỪ EXCEPTION, không đọc res.statusCode: lúc lỗi đi qua đây
        // exception filter CHƯA set status nên res.statusCode vẫn là 200 mặc
        // định → mọi lỗi bị ghi thành 200 và panel error rate vĩnh viễn bằng 0.
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          stop({
            method: req.method,
            route: req.route?.path ?? 'unknown',
            status: String(status),
          });
        },
      }),
    );
  }
}
