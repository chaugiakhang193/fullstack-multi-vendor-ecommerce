// Danh sách các API Endpoints công khai của Auth (Không tự động refresh token khi lỗi 401)
export const AUTH_API_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/seller/register", // API đăng ký tài khoản seller
  "/auth/verify-email",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
] as const;

// Danh sách các trang chỉ dành cho khách (Guest-only pages)
export const GUEST_ONLY_PATHS = ["/login", "/register"] as const;

// Danh sách các tiền tố đường dẫn yêu cầu đăng nhập (Required Auth page prefixes)
export const REQUIRED_AUTH_PATH_PREFIXES = [
  "/admin",
  "/seller",
  "/profile",
] as const;
