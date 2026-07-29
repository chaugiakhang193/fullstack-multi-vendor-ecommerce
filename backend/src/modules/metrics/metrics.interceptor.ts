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

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
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
