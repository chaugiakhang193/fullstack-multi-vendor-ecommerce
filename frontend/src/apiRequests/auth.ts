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
} from "@/schemaValidations/auth.schema";
import http from "@/lib/http";
const authApiRequest = {
  login: (body: LoginBodyType) => http.post<LoginResType>("/auth/login", body),
  register: (body: Omit<RegisterBodyType, "confirmPassword">) =>
    http.post<RegisterResType>("/auth/register", body),
  registerSeller: (body: Omit<RegisterBodyType, "confirmPassword">) =>
    http.post<RegisterResType>("/auth/seller/register", body),
  refreshToken: () => {
    return http.post<any>("/auth/refresh", {});
  },
  logout: () => {
    return http.post<any>("/auth/logout", {});
  },
  forgotPassword: (body: ForgotPasswordBodyType) => {
    return http.post<ForgotPasswordResType>("/auth/forgot-password", body);
  },
  resetPassword: (body: Omit<ResetPasswordBodyType, "confirmPassword">) => {
    return http.post<ResetPasswordResType>("/auth/reset-password", body);
  },
  changePassword: (body: Omit<ChangePasswordBodyType, "confirmPassword">) => {
    return http.post<ChangePasswordResType>("/auth/change-password", body);
  },
  resendVerification: (body: ResendVerificationBodyType) => {
    return http.post<ResendVerificationResType>(
      "/auth/resend-verification",
      body,
    );
  },
  verifyEmail: (body: VerifyEmailBodyType) => {
    return http.post<VerifyEmailResType>("/auth/verify-email", body);
  },
};
export default authApiRequest;
