import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AccountType } from "@/schemaValidations/auth.schema";
import authApiRequest from "@/apiRequests/auth";
import Cookies from "js-cookie";

// Cấu hình cookie đồng bộ, an toàn cho cả Client và Middleware Server
const setAuthCookies = (role: string, status: string) => {
  const cookieOptions: Cookies.CookieAttributes = {
    path: "/",
    expires: 30, // Đồng bộ với REFRESH_TOKEN_EXPIRATION=30d trong backend
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // Chỉ bật secure trên production
  };
  Cookies.set("user_role", role, cookieOptions);
  Cookies.set("user_status", status, cookieOptions);
};

const clearAuthCookies = () => {
  Cookies.remove("user_role", { path: "/" });
  Cookies.remove("user_status", { path: "/" });
};

interface AuthState {
  user: AccountType | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isRefreshing: boolean; // 🆕 Cờ kiểm soát chống gửi trùng lặp request refresh

  setAuth: (user: AccountType, token: string) => void;
  setAccessToken: (token: string) => void;
  silentRefresh: (router?: any) => Promise<boolean>;
  logout: () => void;
}

// 🆕 Biến global nằm ngoài store để giữ trạng thái Promise của request refresh đang chạy ngầm
let refreshPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isRefreshing: false, // Mặc định ban đầu không refresh

      // Gọi khi Login thành công
      setAuth: (user, token) => {
        set({ user, accessToken: token, isAuthenticated: true });
        setAuthCookies(user.role, user.status);
      },

      // Gọi ngầm khi các Interceptor tự update token
      setAccessToken: (token) => set({ accessToken: token }),

      // Cơ chế Đăng nhập âm thầm - Đạt chuẩn Chống Đạn (Bulletproof)
      silentRefresh: async (router?: any) => {
        // Nếu đang có một tiến trình refresh đang chạy, trả về luôn cái Promise đó để dùng chung kết quả
        if (refreshPromise) return refreshPromise;

        set({ isRefreshing: true });

        refreshPromise = (async () => {
          try {
            const res = await authApiRequest.refreshToken();
            const newAccessToken = res.data.access_token;
            const user = res.data.user;

            get().setAuth(user, newAccessToken);

            // Phòng thủ: Nếu status thay đổi + đang kẹt sai trang → soft redirect
            if (router && typeof window !== "undefined") {
              const currentPath = window.location.pathname;

              // Đã được duyệt nhưng kẹt ở /seller/pending
              if (user.status === "active" && currentPath === "/seller/pending") {
                router.push("/seller");
              }
              // Bị reject nhưng kẹt ở /seller/pending
              else if (
                user.status === "rejected" &&
                currentPath === "/seller/pending"
              ) {
                router.push("/seller/rejected");
              }
              // Đang chờ duyệt nhưng kẹt ở /seller/rejected
              else if (
                user.status === "pending_approval" &&
                currentPath === "/seller/rejected"
              ) {
                router.push("/seller/pending");
              }
            }

            return true;
          } catch (error: any) {
            // Phân biệt loại lỗi
            const status = error?.status;

            // Khi refresh thất bại (Cookie hết hạn / Session bị xóa ở DB), dọn dẹp sạch sẽ
            get().logout();

            // Lưu flag cảnh báo bảo mật nếu là 401 (Token không hợp lệ)
            if (status === 401 && typeof window !== "undefined") {
              sessionStorage.setItem("auth_security_warning", "true");
            }

            return false;
          } finally {
            // Giải phóng Promise global và hạ cờ hiệu
            refreshPromise = null;
            set({ isRefreshing: false });
          }
        })();

        return refreshPromise;
      },

      // Gọi khi Đăng xuất
      logout: () => {
        set({ user: null, accessToken: null, isAuthenticated: false });
        clearAuthCookies();
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
