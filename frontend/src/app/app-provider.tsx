"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { tabId } from "@/lib/utils";
import { QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/query-client";
import { SocketProvider } from "@/components/providers/socket-provider";
import { GUEST_ONLY_PATHS, REQUIRED_AUTH_PATH_PREFIXES } from "@/constants/routes";
import { BROADCAST_CHANNELS, BROADCAST_EVENTS } from "@/constants/broadcast";
import { UserRole } from "@/constants/enum";

export default function AppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { silentRefresh, logout, user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  // Cập nhật pathname hiện tại vào ref để tránh re-subscribe BroadcastChannel mỗi khi chuyển route
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Dùng useRef để ngăn chặn React 18 Strict Mode gọi API 2 lần lúc dev
  const isMounted = useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;

      // Kiểm tra cảnh báo bảo mật từ session trước
      if (typeof window !== "undefined") {
        const hasSecurityWarning = sessionStorage.getItem(
          "auth_security_warning",
        );
        if (hasSecurityWarning === "true") {
          toast.error(
            "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại để bảo mật tài khoản.",
            { duration: 5000 },
          );
          sessionStorage.removeItem("auth_security_warning");
        }
      }

      // Ngay khi ứng dụng vừa load (F5), âm thầm gọi API xin lại Access Token
      silentRefresh(router);
    }
  }, [silentRefresh]);

  // Đồng bộ hóa trạng thái đăng nhập/đăng xuất giữa các tab
  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNELS.AUTH);

    channel.onmessage = async (event) => {
      const currentPath = pathnameRef.current;
      const data = event.data;

      // Bỏ qua nếu tin nhắn gửi từ chính tab này hoặc dữ liệu không hợp lệ
      if (!data || data.senderTabId === tabId) return;

      if (data.type === BROADCAST_EVENTS.AUTH_LOGIN_SUCCESS) {
        // Gọi silentRefresh để lấy accessToken mới cập nhật vào Zustand
        const isSuccess = await silentRefresh(router);
        if (isSuccess) {
          toast.info("Đã đăng nhập thành công từ tab khác!");
          const isGuestPath = GUEST_ONLY_PATHS.includes(currentPath as any);
          if (isGuestPath) {
            const redirectUrl =
              user?.role === UserRole.SELLER
                ? "/seller"
                : user?.role === UserRole.ADMIN
                  ? "/admin"
                  : "/";
            router.push(redirectUrl);
          }
        }
      } else if (data.type === BROADCAST_EVENTS.AUTH_LOGOUT_SUCCESS) {
        logout();
        toast.info("Đã đăng xuất tài khoản từ tab khác!");
        
        // Thêm /profile và /orders vào danh sách các trang yêu cầu đăng nhập
        const isAuthRequired = REQUIRED_AUTH_PATH_PREFIXES.some((prefix) =>
          currentPath.startsWith(prefix)
        );
        if (isAuthRequired) {
          const loginUrl = "/login";
          router.push(loginUrl);
        }
      }
    };

    return () => {
      channel.close();
    };
  }, [silentRefresh, logout, router]);

  // Trả về giao diện bọc trong QueryClientProvider và Devtools
  return (
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        <SocketProvider>{children}</SocketProvider>
      </QueryErrorResetBoundary>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
