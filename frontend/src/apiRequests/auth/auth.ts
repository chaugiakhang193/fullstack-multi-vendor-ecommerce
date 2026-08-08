import {
  LoginBodyType,
  RegisterBodyType,
  LoginResType,
  RegisterResType,
  ForgotPasswordBodyType,
  ForgotPasswordResType,
  ResetPasswordBodyType,
  ResetPasswordResType,
  ChangePasswordBodyType,
  ChangePasswordResType,
  SetPasswordBodyType,
  SetPasswordResType,
  ResendVerificationBodyType,
  ResendVerificationResType,
  VerifyEmailBodyType,
  VerifyEmailResType,
  AccountResType,
} from '@/schemaValidations/auth/auth.schema';
import http from '@/lib/http';

// Đóng gói token CAPTCHA vào header x-captcha-token (BE đọc ở header, không phải body vì
// ValidationPipe forbidNonWhitelisted sẽ chặn field lạ trong body).
const captchaHeaders = (token?: string) =>
  token ? { headers: { 'x-captcha-token': token } } : undefined;

const authApiRequest = {
  // === 1. Đăng ký & Kích hoạt tài khoản ===
  register: (
    body: Omit<RegisterBodyType, 'confirmPassword'>,
    captchaToken?: string,
  ) =>
    http.post<RegisterResType>(
      '/auth/register',
      body,
      captchaHeaders(captchaToken),
    ),

  registerSeller: (
    body: Omit<RegisterBodyType, 'confirmPassword'>,
    captchaToken?: string,
  ) =>
    http.post<RegisterResType>(
      '/auth/seller/register',
      body,
      captchaHeaders(captchaToken),
    ),

  verifyEmail: (body: VerifyEmailBodyType) =>
    http.post<VerifyEmailResType>('/auth/verify-email', body),

  resendVerification: (
    body: ResendVerificationBodyType,
    captchaToken?: string,
  ) =>
    http.post<ResendVerificationResType>(
      '/auth/resend-verification',
      body,
      captchaHeaders(captchaToken),
    ),

  // === 2. Đăng nhập & Quản lý phiên làm việc ===
  login: (body: LoginBodyType, captchaToken?: string) =>
    http.post<LoginResType>('/auth/login', body, captchaHeaders(captchaToken)),

  me: () => http.get<AccountResType>('/auth/me'),

  refreshToken: () => http.post<any>('/auth/refresh', {}),

  // === 3. Khôi phục & Thay đổi mật khẩu ===
  forgotPassword: (body: ForgotPasswordBodyType, captchaToken?: string) =>
    http.post<ForgotPasswordResType>(
      '/auth/forgot-password',
      body,
      captchaHeaders(captchaToken),
    ),

  resetPassword: (body: Omit<ResetPasswordBodyType, 'confirmPassword'>) =>
    http.post<ResetPasswordResType>('/auth/reset-password', body),

  changePassword: (body: Omit<ChangePasswordBodyType, 'confirmPassword'>) =>
    http.post<ChangePasswordResType>('/auth/change-password', body),

  setPassword: (body: Omit<SetPasswordBodyType, 'confirmPassword'>) =>
    http.post<SetPasswordResType>('/auth/set-password', body),

  // === 4. Đăng xuất ===
  logout: () => http.post<any>('/auth/logout', {}),
};

export default authApiRequest;
