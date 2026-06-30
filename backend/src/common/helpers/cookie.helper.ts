// Libraries
import { Response } from 'express';

// Production (BE Render ≠ FE Vercel = cross-site): cookie phải SameSite=None + Secure
// để trình duyệt gửi kèm trong request cross-site (vd silentRefresh /auth/refresh).
// Local (cùng site localhost): Lax + không Secure cho tiện dev (http).
const isProd = process.env.NODE_ENV === 'production';
const crossSiteCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

/**
 * Helper thiết lập Cookie chứa Refresh Token
 */
export const setRefreshTokenCookie = (
  res: Response,
  token: string,
  maxAge: number | string,
) => {
  const cookieName = 'refresh_token';
  const cookieValue = token;
  const maxAgeMs = Number(maxAge);

  const cookieOptions = {
    ...crossSiteCookie,
    maxAge: maxAgeMs,
  };

  res.cookie(cookieName, cookieValue, cookieOptions);
};

/**
 * Helper xóa Cookie chứa Refresh Token khi người dùng Đăng xuất
 */
export const clearRefreshTokenCookie = (res: Response) => {
  const cookieName = 'refresh_token';

  const cookieOptions = {
    ...crossSiteCookie,
  };

  res.clearCookie(cookieName, cookieOptions);
};
