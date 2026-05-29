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
  ResendVerificationBodyType,
  ResendVerificationResType,
  VerifyEmailBodyType,
  VerifyEmailResType,
  AccountResType,
} from "@/schemaValidations/auth.schema";
import http from "@/lib/http";

const authApiRequest = {
  // === 1. Đăng ký & Kích hoạt tài khoản ===
  register: (body: Omit<RegisterBodyType, "confirmPassword">) =>
    http.post<RegisterResType>("/auth/register", body),

  registerSeller: (body: Omit<RegisterBodyType, "confirmPassword">) =>
    http.post<RegisterResType>("/auth/seller/register", body),

  verifyEmail: (body: VerifyEmailBodyType) =>
    http.post<VerifyEmailResType>("/auth/verify-email", body),

  resendVerification: (body: ResendVerificationBodyType) =>
    http.post<ResendVerificationResType>("/auth/resend-verification", body),

  // === 2. Đăng nhập & Quản lý phiên làm việc ===
  login: (body: LoginBodyType) =>
    http.post<LoginResType>("/auth/login", body),

  me: () =>
    http.get<AccountResType>("/auth/me"),

  refreshToken: () =>
    http.post<any>("/auth/refresh", {}),

  // === 3. Khôi phục & Thay đổi mật khẩu ===
  forgotPassword: (body: ForgotPasswordBodyType) =>
    http.post<ForgotPasswordResType>("/auth/forgot-password", body),

  resetPassword: (body: Omit<ResetPasswordBodyType, "confirmPassword">) =>
    http.post<ResetPasswordResType>("/auth/reset-password", body),

  changePassword: (body: Omit<ChangePasswordBodyType, "confirmPassword">) =>
    http.post<ChangePasswordResType>("/auth/change-password", body),

  // === 4. Đăng xuất ===
  logout: () =>
    http.post<any>("/auth/logout", {}),
};

export default authApiRequest;
