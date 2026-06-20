import { IS_PUBLIC_KEY } from '@/decorator/customize';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, firstValueFrom } from 'rxjs';

@Injectable()
export class AccessTokenGuard extends AuthGuard('jwt-access') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // Optional auth: thử giải mã JWT nếu client gửi kèm Authorization header.
      // Thành công → req.user có giá trị (logged-in user trên route public).
      // Thất bại hoặc không có header → bỏ qua, req.user = undefined (guest).
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers?.authorization;
      if (authHeader) {
        const result = super.canActivate(context);
        if (isObservable(result)) {
          return firstValueFrom(result).catch(() => true as const);
        }
        return Promise.resolve(result).catch(() => true as const);
      }
      return true;
    }
    return super.canActivate(context);
  }
}
