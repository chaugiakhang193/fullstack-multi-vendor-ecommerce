// Libraries
import { Response } from 'express';

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
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path: '/',
  };

  res.cookie(cookieName, cookieValue, cookieOptions);
};

/**
 * Helper xóa Cookie chứa Refresh Token khi người dùng Đăng xuất
 */
export const clearRefreshTokenCookie = (res: Response) => {
  const cookieName = 'refresh_token';

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };

  res.clearCookie(cookieName, cookieOptions);
};
