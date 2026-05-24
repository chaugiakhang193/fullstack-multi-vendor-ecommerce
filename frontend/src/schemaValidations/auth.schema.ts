import z from "zod";
import { UserRole, AccountStatus } from "@/constants/enum";

// Định nghĩa User
export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  status: z.nativeEnum(AccountStatus),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  password_changed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Đăng nhập (login)
export const LoginBody = z
  .object({
    username: z
      .string()
      .min(3, "Vui lòng nhập ít nhất 3 ký tự.")
      .max(32, "Tên đăng nhập tối đa 32 ký tự.")
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
  .strict();

// Đăng ký tài khoản mới (register)
export const RegisterBody = z
  .object({
    username: z
      .string()
      .min(3, "Tên đăng nhập phải có ít nhất 3 ký tự.")
      .max(32, "Tên đăng nhập tối đa 32 ký tự.")
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
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự.")
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
});

// Đặt lại mật khẩu (reset-password)
export const ResetPasswordBody = z
  .object({
    token: z.string().min(1, "Token không hợp lệ"),
    new_password: z
      .string()
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự.")
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
      .min(8, "Mật khẩu phải có ít nhất 8 ký tự.")
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
});

export const AuthRes = z.object({
  //statusCode: z.number().optional(),
  data: z.object({
    access_token: z.string(),
    user: UserSchema,
  }),
  message: z.string(),
});

export const AccountRes = z.object({
  data: UserSchema,
  message: z.string(),
});

export type AccountType = z.infer<typeof UserSchema>;

export type RegisterBodyType = z.TypeOf<typeof RegisterBody>;
export type RegisterResType = z.TypeOf<typeof AuthRes>;

export type LoginBodyType = z.TypeOf<typeof LoginBody>;
export type LoginResType = z.TypeOf<typeof AuthRes>;

export type ForgotPasswordBodyType = z.TypeOf<typeof ForgotPasswordBody>;
export type ForgotPasswordResType = z.TypeOf<typeof AuthRes>;

export type ResetPasswordBodyType = z.TypeOf<typeof ResetPasswordBody>;
export type ResetPasswordResType = z.TypeOf<typeof AuthRes>;

export type ChangePasswordBodyType = z.TypeOf<typeof ChangePasswordBody>;
export type ChangePasswordResType = z.TypeOf<typeof AuthRes>;

export type ResendVerificationBodyType = z.TypeOf<
  typeof ResendVerificationBody
>;
export type ResendVerificationResType = z.TypeOf<typeof AuthRes>;

export type VerifyEmailBodyType = z.TypeOf<typeof VerifyEmailBody>;
export type VerifyEmailResType = z.TypeOf<typeof AuthRes>;

export type AccountResType = z.TypeOf<typeof AccountRes>;
