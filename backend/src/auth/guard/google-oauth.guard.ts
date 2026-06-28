import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';

/**
 * Guard cho luồng Google OAuth. Ở PHA KHỞI TẠO (chưa có ?code=), sinh `state`
 * ngẫu nhiên, lưu vào cookie HttpOnly `g_oauth_state` và truyền cho Google.
 * Khi Google redirect về (có ?code=&state=), controller sẽ so khớp state ↔ cookie
 * để chống CSRF — stateless, không cần express-session.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (!req.query.code) {
      const state = randomBytes(16).toString('hex');
      res.cookie('g_oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000,
        path: '/',
      });
      return { state };
    }
    return {};
  }
}
