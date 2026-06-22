import z from "zod";
import { UserRole, AccountStatus } from "@/constants/enum";
import { AUTH_LIMITS } from "@/constants/limits";
import type { components } from "@/lib/api/api-schema";
import type { ApiEnvelope } from "@/lib/http";

type LoginDto = components["schemas"]["LoginDto"];
type ForgotPasswordDto = components["schemas"]["ForgotPasswordDto"];
type VerifyEmailDto = components["schemas"]["VerifyEmailDto"];

// Định nghĩa User
export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  status: z.nativeEnum(AccountStatus),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  avatar_url: z.string().nullable(),
  password_changed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Đăng nhập (login)
export const LoginBody = z
  .object({
    username: z
      .string()
      .min(AUTH_LIMITS.USERNAME_MIN_LENGTH, "Vui lòng nhập ít nhất 3 ký tự.")
      .max(AUTH_LIMITS.USERNAME_MAX_LENGTH, "Tên đăng nhập tối đa 32 ký tự.")
      .refine(
        (val) => !val.includes(" "),
        "Email hoặc Tên đăng nhập không được chứa khoảng trắng.",
      ),
    password: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu.")
      .refine(
        (val) => !val.includes(" "),
        "Mật khẩu không được chứa khoảng trắng.",
      ),
  })
  .strict() satisfies z.ZodType<LoginDto, any, any>;

// Đăng ký tài khoản mới (register)
// Không satisfies RegisterDto: body có confirmPassword (FE-only, strip trước khi gửi).
export const RegisterBody = z
  .object({
    username: z
      .string()
      .min(AUTH_LIMITS.USERNAME_MIN_LENGTH, "Tên đăng nhập phải có ít nhất 3 ký tự.")
      .max(AUTH_LIMITS.USERNAME_MAX_LENGTH, "Tên đăng nhập tối đa 32 ký tự.")
      .regex(
        /.*[a-zA-Z].*/,
        "Tên đăng nhập không hợp lệ. Phải chứa ít nhất một chữ cái, không được để toàn số.",
      )
      .refine(
        (val) => !val.includes(" "),
        "Tên đăng nhập không được chứa khoảng trắng.",
      ),
    email: z
      .string()
      .min(1, "Vui lòng nhập email.")
      .email("Email không đúng định dạng.")
      .refine(
        (val) => !val.includes(" "),
        "Email không được chứa khoảng trắng.",
      ),
    password: z
      .string()
      .min(AUTH_LIMITS.PASSWORD_MIN_LENGTH, "Mật khẩu phải có ít nhất 8 ký tự.")
      .regex(/[A-Z]/, "Mật khẩu phải chứa ít nhất 1 chữ hoa.")
      .regex(/[a-z]/, "Mật khẩu phải chứa ít nhất 1 chữ thường.")
      .regex(/[0-9]/, "Mật khẩu phải chứa ít nhất 1 chữ số.")
      .refine(
        (val) => !val.includes(" "),
        "Mật khẩu không được chứa khoảng trắng.",
      ),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  });

// Quên mật khẩu (forgot-password)
export const ForgotPasswordBody = z.object({
  email: z
    .string()
    .min(1, "Vui lòng nhập email.")
    .email("Email không đúng định dạng.")
    .refine((val) => !val.includes(" "), "Email không được chứa khoảng trắng."),
}) satisfies z.ZodType<ForgotPasswordDto, any, any>;

// Đặt lại mật khẩu (reset-password)
// Không satisfies ResetPasswordDto: body có confirmPassword (FE-only, strip trước khi gửi).
export const ResetPasswordBody = z
  .object({
    token: z.string().min(1, "Token không hợp lệ"),
    new_password: z
      .string()
      .min(AUTH_LIMITS.PASSWORD_MIN_LENGTH, "Mật khẩu phải có ít nhất 8 ký tự.")
      .regex(/[A-Z]/, "Mật khẩu phải chứa ít nhất 1 chữ hoa.")
      .regex(/[a-z]/, "Mật khẩu phải chứa ít nhất 1 chữ thường.")
      .regex(/[0-9]/, "Mật khẩu phải chứa ít nhất 1 chữ số.")
      .refine(
        (val) => !val.includes(" "),
        "Mật khẩu không được chứa khoảng trắng.",
      ),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu."),
  })
  .refine((data) => data.new_password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  });

// Đổi mật khẩu (change-password)
// Không satisfies ChangePasswordDto: body có confirmPassword (FE-only, strip trước khi gửi).
export const ChangePasswordBody = z
  .object({
    old_password: z
      .string()
      .min(1, "Vui lòng nhập mật khẩu cũ")
      .refine(
        (val) => !val.includes(" "),
        "Mật khẩu không được chứa khoảng trắng.",
      ),
    new_password: z
      .string()
      .min(AUTH_LIMITS.PASSWORD_MIN_LENGTH, "Mật khẩu phải có ít nhất 8 ký tự.")
      .regex(/[A-Z]/, "Mật khẩu phải chứa ít nhất 1 chữ hoa.")
      .regex(/[a-z]/, "Mật khẩu phải chứa ít nhất 1 chữ thường.")
      .regex(/[0-9]/, "Mật khẩu phải chứa ít nhất 1 chữ số.")
      .refine(
        (val) => !val.includes(" "),
        "Mật khẩu không được chứa khoảng trắng.",
      ),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới."),
  })
  .refine((data) => data.new_password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp.",
    path: ["confirmPassword"],
  });

// Gửi lại Email xác thực (resend-verification)
export const ResendVerificationBody = z.object({
  email: z
    .string()
    .min(1, "Vui lòng nhập email.")
    .email("Email không đúng định dạng.")
    .refine((val) => !val.includes(" "), "Email không được chứa khoảng trắng."),
});

// Xác thực Email (verify-email)
export const VerifyEmailBody = z.object({
  verification_token: z.string().min(1, "Mã xác thực không hợp lệ"),
}) satisfies z.ZodType<VerifyEmailDto, any, any>;

export const AuthRes = z.object({
  access_token: z.string(),
  user: UserSchema,
});

export const AccountRes = UserSchema;

// ==========================================
// Types
// ==========================================
export type AccountType = z.TypeOf<typeof UserSchema>;

export type RegisterBodyType = z.TypeOf<typeof RegisterBody>;
export type RegisterResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type LoginBodyType = z.TypeOf<typeof LoginBody>;
export type LoginResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type ForgotPasswordBodyType = z.TypeOf<typeof ForgotPasswordBody>;
export type ForgotPasswordResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type ResetPasswordBodyType = z.TypeOf<typeof ResetPasswordBody>;
export type ResetPasswordResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type ChangePasswordBodyType = z.TypeOf<typeof ChangePasswordBody>;
export type ChangePasswordResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type ResendVerificationBodyType = z.TypeOf<
  typeof ResendVerificationBody
>;
export type ResendVerificationResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type VerifyEmailBodyType = z.TypeOf<typeof VerifyEmailBody>;
export type VerifyEmailResType = ApiEnvelope<z.TypeOf<typeof AuthRes>>;

export type AccountResType = ApiEnvelope<z.TypeOf<typeof AccountRes>>;

