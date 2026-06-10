import type { Request } from 'express';
import { User } from '@/modules/users/entities/user.entity';
import { IUser } from '@/interface/user.interface';

// User trả ra ngoài sau xác thực — toàn bộ entity TRỪ password.
// validateUser/LocalStrategy thực sự return cả entity (đã bỏ password),
// nên type phải nói đúng sự thật, không narrow xuống Pick.
export type UserWithoutPassword = Omit<User, 'password'>;

// Input tối thiểu để ký token / tạo session — chỉ 4 field thực sự dùng.
// UserWithoutPassword gán được vào đây (structural, dư field OK).
export type SessionUser = Pick<User, 'id' | 'username' | 'role' | 'status'>;

// Payload refresh token đã giải mã (khớp rtPayload ký lúc login: { sub, sessionId }).
export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

// req.user của route refresh: RefreshStrategy gắn thêm refreshToken vào payload.
export interface RefreshRequestUser extends RefreshTokenPayload {
  refreshToken: string;
}

// Express Request đã qua guard — user + cookies có kiểu.
// Dùng Omit<Request,'user'> vì Request.user đã bị augment thành User entity;
// ghi đè trực tiếp 'user' sẽ xung đột type, nên gỡ ra rồi gắn lại theo TUser.
// Generic TUser vì mỗi guard cho req.user một shape khác (IUser / RefreshRequestUser / UserWithoutPassword).
// Đây là nền type-request tái dùng cho guard/interceptor về sau (vd re-check status/role).
export type AuthenticatedRequest<TUser = IUser> = Omit<Request, 'user'> & {
  user: TUser;
  cookies: Record<string, string>;
};
