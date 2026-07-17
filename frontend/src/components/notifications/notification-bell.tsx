'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';

import { useAuthStore } from '@/store/useAuthStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useSocket } from '@/components/providers/socket-provider';
import { useNotificationsList, useUnreadCount } from '@/hooks/useNotifications';
import notificationApiRequest from '@/apiRequests/engagements/notifications';
import {
  QUERY_KEYS,
  payoutKeys,
  customerOrderKeys,
  sellerOrderKeys,
  sellerReturnKeys,
  returnKeys,
  pendingShopKeys,
  notificationKeys,
} from '@/constants/query-keys';
import { UserRole } from '@/constants/enum';
import { getErrorMessage } from '@/lib/http';
import { formatDateTime, formatVnd } from '@/lib/format';
import { renderNotificationData } from '@/components/notifications/notification-content';
import type {
  NotificationItemType,
  NotificationListEnvelope,
} from '@/schemaValidations/engagements/notifications.schema';

// Tên event WS — khớp backend notification.events.ts WS_EVENTS.
const WS_ORDER_NEW = 'order.new';
const WS_ORDER_STATUS_CHANGED = 'order.status_changed';
const WS_REVIEW_NEW = 'review.new';
const WS_REVIEW_REPLIED = 'review.replied';
const WS_PAYOUT_STATUS_CHANGED = 'payout.status_changed';
const WS_PAYOUT_CREATED = 'payout.created';
const WS_SHOP_REGISTERED = 'shop.registered';
const WS_RETURN_REQUESTED = 'return.requested';
const WS_RETURN_STATUS_CHANGED = 'return.status_changed';
const WS_PRODUCT_MODERATED = 'product.moderated';
const WS_NOTIFICATION_NEW = 'notification.new';

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
interface ReviewNewPayload {
  reviewId: string;
  productId: string;
  productName: string;
  rating: number;
  message: string;
}
interface ReviewRepliedPayload {
  reviewId: string;
  productId: string;
  productName: string;
  message: string;
}
interface PayoutStatusChangedWsPayload {
  payoutId: string;
  amount: number;
  status: string;
  message: string;
}
interface PayoutCreatedWsPayload {
  payoutId: string;
  amount: number;
  shopId: string;
  shopName: string;
  message: string;
}
interface ShopRegisteredWsPayload {
  shopId: string;
  shopName: string;
  message: string;
}
interface ReturnRequestedWsPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  message: string;
}
interface ReturnStatusChangedWsPayload {
  returnId: string;
  subOrderId: string;
  orderNumber: string;
  status: string;
  message: string;
}
interface ProductModeratedWsPayload {
  productId: string;
  productName: string;
  action: string;
  message: string;
}
interface NotificationNewWsPayload {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  data: NotificationItemType['data'];
  isRead: boolean;
  createdAt: string;
}

// Thêm hàm sinh Href thông minh dựa vào kind và các IDs có sẵn
const getNotificationHref = (
  item: NotificationItemType,
  role?: string,
): string => {
  const d = item.data;
  if (!d)
    return role === UserRole.SELLER ? '/seller/orders' : '/profile/orders';

  switch (d.kind) {
    case 'order_placed':
    case 'suborder_cancelled_customer':
    case 'suborder_status_changed':
      return d.orderId ? `/profile/orders/${d.orderId}` : '/profile/orders';
    case 'order_new_seller':
    case 'suborder_cancelled_seller':
      return d.subOrderId ? `/seller/orders/${d.subOrderId}` : '/seller/orders';
    case 'review_new_seller':
      return '/seller/reviews';
    case 'review_replied':
      // Dẫn về sản phẩm để xem đánh giá và phản hồi
      return d.productId ? `/products/${d.productId}` : '/profile/orders';
    case 'return_requested_seller':
      return d.returnId ? `/seller/returns/${d.returnId}` : '/seller/returns';
    case 'return_status_customer':
      return d.returnId ? `/profile/returns/${d.returnId}` : '/profile/returns';
    case 'payout_status_changed':
      return '/seller/payouts';
    case 'payout_created':
      const adminPayoutsUrl = '/admin/payouts';
      return adminPayoutsUrl;
    case 'shop_registered':
      const adminSellersUrl = '/admin/sellers';
      return adminSellersUrl;
    case 'product_moderated':
      const prodIdVal = d.productId;
      const targetHref = prodIdVal
        ? `/seller/products/${prodIdVal}`
        : '/seller/products';
      return targetHref;
    default:
      return role === UserRole.SELLER ? '/seller/orders' : '/profile/orders';
  }
};

export function NotificationBell({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
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

  // Bell cho mọi user đã đăng nhập (Part 1 đã mở notifications API cho cả ADMIN).
  const canUseNotif = isAuthenticated;

  const listQuery = useNotificationsList(canUseNotif && open);
  const unreadQuery = useUnreadCount(canUseNotif);

  // Sync badge từ server count (nguồn sự thật, tự sửa lệch sau increment lạc quan).
  useEffect(() => {
    const total = unreadQuery.data?.data.meta.totalItems;
    if (typeof total === 'number') setCount(total);
  }, [unreadQuery.data, setCount]);

  // Đăng ký listener WS — toast + increment + invalidate. Navigate theo role.
  useEffect(() => {
    if (!socket) return;

    const DROPDOWN_LIMIT = 5;
    const onNotificationNew = (row: NotificationNewWsPayload) => {
      increment();
      queryClient.setQueryData(
        notificationKeys.list,
        (old: NotificationListEnvelope | undefined) => {
          if (!old) return old; // chưa fetch lần nào → để lần mở dropdown đầu tự fetch từ projection
          if (
            old.data.items.some((it: NotificationItemType) => it.id === row.id)
          )
            return old; // dedupe redelivery
          const item: NotificationItemType = {
            id: row.id,
            type: row.type as NotificationItemType['type'],
            title: row.title,
            content: row.content,
            data: row.data,
            is_read: row.isRead,
            created_at: row.createdAt,
          };
          const items = [item, ...old.data.items].slice(0, DROPDOWN_LIMIT);
          const meta = {
            ...old.data.meta,
            totalItems: old.data.meta.totalItems + 1,
          };
          return { ...old, data: { ...old.data, items, meta } };
        },
      );
    };

    const onOrderNew = (payload: OrderNewPayload) => {
      // Đơn mới của khách → làm mới danh sách đơn seller ngay, khỏi F5.
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.all });
      // order.new thiếu subOrderId → chỉ tới được danh sách seller.
      toast.success(payload.message, {
        description: `Đơn ${payload.orderNumber}`,
        action: { label: 'Xem', onClick: () => router.push('/seller/orders') },
      });
    };

    const onStatusChanged = (payload: OrderStatusChangedPayload) => {
      queryClient.invalidateQueries({ queryKey: customerOrderKeys.all });
      queryClient.invalidateQueries({ queryKey: sellerOrderKeys.all });
      const href =
        role === UserRole.SELLER
          ? `/seller/orders/${payload.subOrderId}`
          : `/profile/orders/${payload.orderId}`;
      toast.info(payload.message, {
        description: `Đơn ${payload.orderNumber}`,
        action: { label: 'Xem', onClick: () => router.push(href) },
      });
    };

    const onReviewNew = (payload: ReviewNewPayload) => {
      toast.info(
        `Khách hàng vừa đánh giá ${payload.rating}⭐ cho ${payload.productName}`,
        {
          action: {
            label: 'Xem ngay',
            onClick: () => router.push('/seller/reviews'),
          },
        },
      );
    };

    const onReviewReplied = (payload: ReviewRepliedPayload) => {
      toast.info(`Shop đã phản hồi đánh giá sản phẩm ${payload.productName}`, {
        action: {
          label: 'Xem',
          onClick: () => router.push(`/products/${payload.productId}`),
        },
      });
    };

    const onPayoutStatusChanged = (payload: PayoutStatusChangedWsPayload) => {
      // Invalidate số dư/lịch sử payout
      queryClient.invalidateQueries({ queryKey: payoutKeys.all });

      const sellerPayoutsHref = '/seller/payouts';
      const toastAction = {
        label: 'Xem',
        onClick: () => router.push(sellerPayoutsHref),
      };

      const formattedAmount = formatVnd.format(payload.amount);
      const toastDescription = `Số tiền rút: ${formattedAmount}`;

      toast.info(payload.message, {
        description: toastDescription,
        action: toastAction,
      });
    };

    const onPayoutCreated = (payload: PayoutCreatedWsPayload) => {
      const payoutAllQueryKey = payoutKeys.all;
      queryClient.invalidateQueries({ queryKey: payoutAllQueryKey });

      const amountVal = payload.amount;
      const formattedAmount = formatVnd.format(amountVal);
      const shopNameVal = payload.shopName;
      const descriptionText = `Cửa hàng ${shopNameVal} • ${formattedAmount}`;
      const payloadMessage = payload.message;
      const payoutRedirectPath = '/admin/payouts';
      const actionHandler = () => {
        router.push(payoutRedirectPath);
      };
      const toastLabel = 'Xem';
      toast.info(payloadMessage, {
        description: descriptionText,
        action: { label: toastLabel, onClick: actionHandler },
      });
    };

    const onShopRegistered = (payload: ShopRegisteredWsPayload) => {
      const pendingShopsKey = pendingShopKeys.all;
      const invalidateOptions = { queryKey: pendingShopsKey };
      queryClient.invalidateQueries(invalidateOptions);

      const shopNameVal = payload.shopName;
      const descriptionText = `Cửa hàng ${shopNameVal}`;
      const payloadMessage = payload.message;
      const sellersRedirectPath = '/admin/sellers';
      const actionHandler = () => {
        router.push(sellersRedirectPath);
      };
      const toastLabel = 'Xem';
      toast.info(payloadMessage, {
        description: descriptionText,
        action: { label: toastLabel, onClick: actionHandler },
      });
    };

    // Yêu cầu trả mới → báo seller. Deep-link tới chi tiết yêu cầu.
    const onReturnRequested = (payload: ReturnRequestedWsPayload) => {
      queryClient.invalidateQueries({ queryKey: sellerReturnKeys.all });
      toast.info(payload.message, {
        description: `Đơn ${payload.orderNumber}`,
        action: {
          label: 'Xem',
          onClick: () => router.push(`/seller/returns/${payload.returnId}`),
        },
      });
    };

    // Seller duyệt/từ chối/nhận hàng → báo khách. Deep-link tới chi tiết yêu cầu.
    const onReturnStatusChanged = (payload: ReturnStatusChangedWsPayload) => {
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
      // Seller nhận đủ hàng → sub_order thành RETURNED → order detail phải refetch
      // để đổi badge "Đã trả hàng" + ẩn nút "Trả hàng".
      queryClient.invalidateQueries({ queryKey: customerOrderKeys.all });
      toast.info(payload.message, {
        description: `Đơn ${payload.orderNumber}`,
        action: {
          label: 'Xem',
          onClick: () => router.push(`/profile/returns/${payload.returnId}`),
        },
      });
    };

    const onProductModerated = (payload: ProductModeratedWsPayload) => {
      const productIdVal = payload.productId;
      const productNameVal = payload.productName;
      const messageVal = payload.message;
      const hrefVal = `/seller/products/${productIdVal}`;
      const actionHandler = () => {
        router.push(hrefVal);
      };
      const toastLabelVal = 'Xem';
      const toastOptions = {
        description: `Sản phẩm: ${productNameVal}`,
        action: { label: toastLabelVal, onClick: actionHandler },
      };

      toast.info(messageVal, toastOptions);
    };

    socket.on(WS_ORDER_NEW, onOrderNew);
    socket.on(WS_ORDER_STATUS_CHANGED, onStatusChanged);
    socket.on(WS_REVIEW_NEW, onReviewNew);
    socket.on(WS_REVIEW_REPLIED, onReviewReplied);
    socket.on(WS_PAYOUT_STATUS_CHANGED, onPayoutStatusChanged);
    socket.on(WS_PAYOUT_CREATED, onPayoutCreated);
    socket.on(WS_SHOP_REGISTERED, onShopRegistered);
    socket.on(WS_RETURN_REQUESTED, onReturnRequested);
    socket.on(WS_RETURN_STATUS_CHANGED, onReturnStatusChanged);
    socket.on(WS_PRODUCT_MODERATED, onProductModerated);
    socket.on(WS_NOTIFICATION_NEW, onNotificationNew);

    return () => {
      socket.off(WS_ORDER_NEW, onOrderNew);
      socket.off(WS_ORDER_STATUS_CHANGED, onStatusChanged);
      socket.off(WS_REVIEW_NEW, onReviewNew);
      socket.off(WS_REVIEW_REPLIED, onReviewReplied);
      socket.off(WS_PAYOUT_STATUS_CHANGED, onPayoutStatusChanged);
      socket.off(WS_PAYOUT_CREATED, onPayoutCreated);
      socket.off(WS_SHOP_REGISTERED, onShopRegistered);
      socket.off(WS_RETURN_REQUESTED, onReturnRequested);
      socket.off(WS_RETURN_STATUS_CHANGED, onReturnStatusChanged);
      socket.off(WS_PRODUCT_MODERATED, onProductModerated);
      socket.off(WS_NOTIFICATION_NEW, onNotificationNew);
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
    const href = getNotificationHref(item, role);
    router.push(href);
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
          size === 'lg'
            ? 'h-16 w-16 rounded-2xl border-2 flex items-center justify-center relative hover:bg-zinc-100 dark:hover:bg-zinc-900 transition shadow-sm cursor-pointer'
            : 'p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 border relative transition'
        }
        aria-label="Thông báo"
      >
        <Bell className={size === 'lg' ? 'h-6 w-6' : 'h-4 w-4'} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold ring-2 ring-white dark:ring-zinc-950">
            {unreadCount > 99 ? '99+' : unreadCount}
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
                      item.is_read
                        ? ''
                        : 'bg-violet-50/50 dark:bg-violet-950/10'
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
                const roleValue = role;
                const isAdmin = roleValue === UserRole.ADMIN;
                const isSeller = roleValue === UserRole.SELLER;
                const adminPath = '/admin/payouts';
                const sellerPath = '/seller/orders';
                const customerPath = '/profile/orders';
                const href = isAdmin
                  ? adminPath
                  : isSeller
                    ? sellerPath
                    : customerPath;
                router.push(href);
              }}
              className="w-full px-4 py-3 text-sm font-bold text-center text-muted-foreground hover:text-foreground border-t hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
            >
              {role === UserRole.ADMIN
                ? 'Tới trang quản trị'
                : 'Xem tất cả đơn hàng'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
