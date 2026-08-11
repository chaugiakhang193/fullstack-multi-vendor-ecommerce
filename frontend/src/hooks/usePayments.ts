import { useMutation, useQuery } from '@tanstack/react-query';

import paymentApiRequest from '@/apiRequests/payments/payments';
import orderApiRequest from '@/apiRequests/orders/orders';
import { customerOrderKeys, STALE_TIME } from '@/constants/query-keys';

// Trần số lần cập nhật trước khi usePollOrderPayment tự ngừng poll (~35s ở
// interval 2.5s). Export để trang Return so sánh dataUpdateCount hiện tại,
// nhận biết lúc poll đã ngừng mà payment vẫn 'pending' → đổi text cho đúng.
export const VNPAY_POLL_CAP_UPDATES = 15;

/** Tạo URL VNPay cho 1 đơn. Caller tự xử lý onSuccess (cần orderNumber để lưu bridge). */
export const useCreateVnpayUrl = () =>
  useMutation({
    mutationFn: (orderId: string) =>
      paymentApiRequest.createVnpayUrl({ orderId }),
  });

/** Verify kết quả return qua BE (Public). Chỉ chạy 1 lần khi có query string. */
export const useVnpayReturn = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: ['vnpay-return', search],
    queryFn: () => paymentApiRequest.getVnpayReturn(search),
    enabled: enabled && !!search,
    staleTime: Infinity, // verify 1 lần, không refetch
    retry: false,
  });

/**
 * Poll chi tiết đơn tới khi payment (VNPAY) đạt terminal — nguồn chân lý là IPN.
 * Dùng chung queryKey với chi tiết đơn nên cache chia sẻ (payment/return/order-detail
 * đọc cùng 1 entry). refetchInterval inline để TanStack tự suy kiểu `query`. Chỉ poll
 * khi VNPAY còn pending; trần ~35s (15 lần cập nhật) tính từ lần fetch ĐẦU TIÊN của
 * cache entry — không reset theo từng trang mount.
 *
 * `allowPoll` (mặc định true): trang payment/[orderId] truyền false vì đơn luôn
 * PENDING lúc mới vào (chưa ai trả tiền) — không có gì để chờ tới khi khách bấm nút,
 * và bấm xong thì rời trang ngay. Poll sớm ở đó chỉ tốn ngân sách 15 lần dùng chung
 * cho trang Return sau này mà không đổi được gì.
 */
export const usePollOrderPayment = (
  orderId: string,
  enabled: boolean,
  allowPoll: boolean = true,
) =>
  useQuery({
    queryKey: customerOrderKeys.detail(orderId),
    queryFn: () => orderApiRequest.getOrderDetail(orderId),
    enabled: enabled && !!orderId,
    staleTime: STALE_TIME.SHORT,
    refetchInterval: (query) => {
      if (!allowPoll) return false;
      const payment = query.state.data?.data?.payment;
      const isVnpayPending =
        payment?.method === 'vnpay' && payment?.status === 'pending';
      if (!isVnpayPending) return false;
      if (query.state.dataUpdateCount >= VNPAY_POLL_CAP_UPDATES) return false;
      return 2500;
    },
  });
