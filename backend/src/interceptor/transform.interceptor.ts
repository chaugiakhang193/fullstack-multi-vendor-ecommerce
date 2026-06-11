import { RESPONSE_MESSAGE } from '@/decorator/customize';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message?: string;
  data: any;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // [Tech Debt C] Chỉ bỏ qua envelope khi handler CHỦ ĐỘNG đánh cờ `__redirect === true`
        // (rồi strip cờ đi). Trước đây kiểm tra `'url' in data` — vỡ ngầm khi entity/DTO có
        // cột `url` (vd MediaAsset) bị trả ở top-level và mất envelope chuẩn.
        if (data && typeof data === 'object' && data.__redirect === true) {
          const { __redirect, ...redirectData } = data;
          return redirectData;
        }
        return {
          statusCode: context.switchToHttp().getResponse().statusCode,
          message:
            this.reflector.get<string>(
              RESPONSE_MESSAGE,
              context.getHandler(),
            ) || '',
          data: data,
        };
      }),
    );
  }
}
