import { useMutation, useQuery } from '@tanstack/react-query';

import paymentApiRequest from '@/apiRequests/payments/payments';
import orderApiRequest from '@/apiRequests/orders/orders';
import { customerOrderKeys, STALE_TIME } from '@/constants/query-keys';

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
 * Dùng chung queryKey với chi tiết đơn nên cache chia sẻ. refetchInterval inline để
 * TanStack tự suy kiểu `query`. Chỉ poll khi VNPAY còn pending; trần ~35s (15 lần cập nhật).
 */
export const usePollOrderPayment = (orderId: string, enabled: boolean) =>
  useQuery({
    queryKey: customerOrderKeys.detail(orderId),
    queryFn: () => orderApiRequest.getOrderDetail(orderId),
    enabled: enabled && !!orderId,
    staleTime: STALE_TIME.SHORT,
    refetchInterval: (query) => {
      const payment = query.state.data?.data?.payment;
      const isVnpayPending =
        payment?.method === 'vnpay' && payment?.status === 'pending';
      if (!isVnpayPending) return false;
      if (query.state.dataUpdateCount >= 15) return false;
      return 2500;
    },
  });
