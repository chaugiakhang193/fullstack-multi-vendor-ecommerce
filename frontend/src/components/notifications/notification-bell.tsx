"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

import { useAuthStore } from "@/store/useAuthStore";
import { useNotificationStore } from "@/store/useNotificationStore";
import { useSocket } from "@/components/providers/socket-provider";
import { useNotificationsList, useUnreadCount } from "@/hooks/useNotifications";
import notificationApiRequest from "@/apiRequests/engagements/notifications";
import { QUERY_KEYS } from "@/constants/query-keys";
import { UserRole } from "@/constants/enum";
import { getErrorMessage } from "@/lib/http";
import { formatDateTime } from "@/lib/format";
import { renderNotificationData } from "@/components/notifications/notification-content";
import type { NotificationItemType } from "@/schemaValidations/engagements/notifications.schema";

// Tên event WS — khớp backend notification.events.ts WS_EVENTS.
const WS_ORDER_NEW = "order.new";
const WS_ORDER_STATUS_CHANGED = "order.status_changed";

interface OrderNewPayload {
  orderId: string;
  orderNumber: string;
  message: string;
}
interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  subOrderId: string;
  status: string;
  message: string;
}

export function NotificationBell({ size = "sm" }: { size?: "sm" | "lg" }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const socket = useSocket();

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = user?.role;

  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const increment = useNotificationStore((s) => s.increment);
  const reset = useNotificationStore((s) => s.reset);
  const setCount = useNotificationStore((s) => s.setCount);

  const [open, setOpen] = useState(false);

  // Bell hiển thị cho mọi user trừ Admin (notifications API chỉ cho CUSTOMER/SELLER).
  const canUseNotif = isAuthenticated && role !== UserRole.ADMIN;

  const listQuery = useNotificationsList(canUseNotif && open);
  const unreadQuery = useUnreadCount(canUseNotif);

  // Sync badge từ server count (nguồn sự thật, tự sửa lệch sau increment lạc quan).
  useEffect(() => {
    const total = unreadQuery.data?.data.meta.totalItems;
    if (typeof total === "number") setCount(total);
  }, [unreadQuery.data, setCount]);

  // Đăng ký listener WS — toast + increment + invalidate. Navigate theo role.
  useEffect(() => {
    if (!socket) return;

    const onOrderNew = (payload: OrderNewPayload) => {
      increment();
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      // order.new thiếu subOrderId → chỉ tới được danh sách seller.
      toast.success(payload.message, {
        description: `Đơn ${payload.orderNumber}`,
        action: { label: "Xem", onClick: () => router.push("/seller/orders") },
      });
    };

    const onStatusChanged = (payload: OrderStatusChangedPayload) => {
      increment();
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CUSTOMER_ORDER_DETAIL] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SELLER_ORDER_DETAIL] });
      const href =
        role === UserRole.SELLER
          ? `/seller/orders/${payload.subOrderId}`
          : `/profile/orders/${payload.orderId}`;
      toast.info(payload.message, {
        description: `Đơn ${payload.orderNumber}`,
        action: { label: "Xem", onClick: () => router.push(href) },
      });
    };

    socket.on(WS_ORDER_NEW, onOrderNew);
    socket.on(WS_ORDER_STATUS_CHANGED, onStatusChanged);

    return () => {
      socket.off(WS_ORDER_NEW, onOrderNew);
      socket.off(WS_ORDER_STATUS_CHANGED, onStatusChanged);
    };
  }, [socket, role, router, queryClient, increment]);

  if (!canUseNotif) return null;

  const items = listQuery.data?.data.items ?? [];

  // NotificationItem không có order id → chỉ tới danh sách theo role.
  const handleItemClick = async (item: NotificationItemType) => {
    setOpen(false);
    try {
      if (!item.is_read) {
        await notificationApiRequest.markAsRead(item.id);
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
      }
    } catch {
      // đánh dấu đọc lỗi không chặn điều hướng
    }
    router.push(role === UserRole.SELLER ? "/seller/orders" : "/profile/orders");
  };

  const handleMarkAll = async () => {
    try {
      await notificationApiRequest.markAllAsRead();
      reset();
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTIFICATIONS] });
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          size === "lg"
            ? "h-16 w-16 rounded-2xl border-2 flex items-center justify-center relative hover:bg-zinc-100 dark:hover:bg-zinc-900 transition shadow-sm cursor-pointer"
            : "p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 border relative transition"
        }
        aria-label="Thông báo"
      >
        <Bell className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold ring-2 ring-white dark:ring-zinc-950">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-zinc-950 border rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-base font-bold">Thông báo</span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-sm font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1"
                >
                  <CheckCheck className="h-4 w-4" />
                  Đọc tất cả
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
              {listQuery.isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-base text-muted-foreground">
                  Chưa có thông báo nào
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left px-4 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition ${
                      item.is_read ? "" : "bg-violet-50/50 dark:bg-violet-950/10"
                    }`}
                  >
                    <p className="text-base font-bold truncate">{item.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                      {renderNotificationData(item.data) ?? item.content}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {formatDateTime(item.created_at)}
                    </p>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => {
                setOpen(false);
                router.push(role === UserRole.SELLER ? "/seller/orders" : "/profile/orders");
              }}
              className="w-full px-4 py-3 text-sm font-bold text-center text-muted-foreground hover:text-foreground border-t hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
            >
              Xem tất cả đơn hàng
            </button>
          </div>
        </>
      )}
    </div>
  );
}
