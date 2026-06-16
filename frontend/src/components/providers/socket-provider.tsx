"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";

import useHydrated from "@/hooks/useHydrated";
import { useAuthStore } from "@/store/useAuthStore";
import { QUERY_KEYS } from "@/constants/query-keys";
import { connectSocket, disconnectSocket } from "@/lib/socket";

const SocketContext = createContext<Socket | null>(null);

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const isHydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [socket, setSocket] = useState<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Chỉ connect khi đã hydrate + đăng nhập + CÓ access token. Token chỉ ở RAM nên sau
    // khi reload, isAuthenticated vẫn true (persist) nhưng accessToken rỗng — connect với
    // token rỗng sẽ bị gateway từ chối → reconnect loop → mỗi lần connect lại chạy
    // health-sync invalidate /cart → bão refetch → 429. Đợi tới khi có token thật mới nối.
    if (!isHydrated || !isAuthenticated || !accessToken) {
      disconnectSocket();
      setSocket(null);
      return;
    }

    const s = connectSocket(accessToken);
    setSocket(s);

    // Health-sync: sau mỗi (re)connect, data có thể cũ do lỡ event lúc rớt mạng.
    // Invalidate rộng — query không có observer là no-op (React Query không refetch).
    const handleConnect = () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CART] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CUSTOMER_ORDERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CUSTOMER_ORDER_DETAIL] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SELLER_ORDERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SELLER_ORDER_DETAIL] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
    };

    s.on("connect", handleConnect);

    return () => {
      s.off("connect", handleConnect);
    };
  }, [isHydrated, isAuthenticated, accessToken, queryClient]);

  // Ngắt hẳn khi provider unmount.
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}
