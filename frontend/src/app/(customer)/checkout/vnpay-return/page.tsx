'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import useHydrated from '@/hooks/useHydrated';
import { useAuthStore } from '@/store/useAuthStore';
import {
  useVnpayReturn,
  usePollOrderPayment,
  useCreateVnpayUrl,
  VNPAY_POLL_CAP_UPDATES,
} from '@/hooks/usePayments';
import { customerOrderKeys } from '@/constants/query-keys';
import {
  readPendingPayment,
  clearPendingPayment,
  setPendingPayment,
  type PendingPayment,
} from '@/lib/vnpay-pending';
import { getErrorMessage } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// vnp_TxnRef = `${order_number}-${timestamp}` → tách order_number bằng lastIndexOf('-')
// (timestamp thuần số không có '-'; order_number có '#' và nhiều '-' vẫn an toàn).
function orderNumberFromTxnRef(txnRef: string | null): string | null {
  if (!txnRef) return null;
  const idx = txnRef.lastIndexOf('-');
  if (idx <= 0) return null;
  return txnRef.slice(0, idx);
}

export default function VnpayReturnPage() {
  useDocumentTitle('Kết quả thanh toán');
  const isHydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // window.location.search + sessionStorage chỉ có ở client → đọc trong effect
  // (tránh mismatch SSR/hydrate).
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingPayment | null>(null);
  useEffect(() => {
    setSearch(window.location.search);
    setPending(readPendingPayment());
  }, []);

  // 1) Verify chữ ký qua BE (Public) — phản hồi tức thì, không cần auth.
  const returnQuery = useVnpayReturn(search, isHydrated);
  const returnData = returnQuery.data?.data;
  const returnCode = returnData?.code ?? null;
  const txnRef = returnData?.txnRef ?? null;

  // 2) Cầu nối orderId: pending + cross-check order_number suy ra từ txnRef.
  //    Lệch (store cũ/nhầm) → bỏ store, dùng fallback.
  const derivedOrderNumber = orderNumberFromTxnRef(txnRef);
  const orderId =
    pending &&
    (!derivedOrderNumber || pending.orderNumber === derivedOrderNumber)
      ? pending.orderId
      : null;

  // 3) Poll trạng thái thanh toán (nguồn IPN) tới terminal, tối đa ~35s.
  const canPoll = !!orderId && isHydrated && isAuthenticated;
  const detailQuery = usePollOrderPayment(orderId ?? '', canPoll);
  const paymentStatus = detailQuery.data?.data?.payment?.status ?? null;

  // dataUpdateCount không lộ qua kết quả useQuery công khai — đọc thẳng từ
  // cache để biết khi nào usePollOrderPayment đã tự ngừng poll (hết cap) mà
  // payment vẫn 'pending', tránh text nói "đang đợi" trong khi thực ra đã bỏ cuộc.
  const queryClient = useQueryClient();
  const updateCount = orderId
    ? (queryClient.getQueryState(customerOrderKeys.detail(orderId))
        ?.dataUpdateCount ?? 0)
    : 0;
  const pollExhausted =
    canPoll &&
    paymentStatus === 'pending' &&
    updateCount >= VNPAY_POLL_CAP_UPDATES;

  // Dọn cầu nối khi đã có kết quả terminal.
  useEffect(() => {
    if (
      paymentStatus === 'completed' ||
      paymentStatus === 'failed' ||
      paymentStatus === 'refunded'
    ) {
      clearPendingPayment();
    }
  }, [paymentStatus]);

  // ===== Suy ra view =====
  // Ưu tiên payment.status (chân lý); chưa poll được thì tạm theo return code.
  const isVerifying = returnQuery.isLoading;
  const returnOk = returnCode === '00';

  let view: 'loading' | 'success' | 'failed' | 'confirming';
  if (isVerifying || !isHydrated) {
    view = 'loading';
  } else if (paymentStatus === 'completed') {
    view = 'success';
  } else if (paymentStatus === 'failed' || paymentStatus === 'refunded') {
    view = 'failed';
  } else if (!returnOk) {
    // Return báo hủy/thất bại và DB chưa/không completed → thất bại.
    view = 'failed';
  } else if (canPoll && paymentStatus === 'pending') {
    // Return OK nhưng IPN chưa cập nhật xong → đang xác nhận.
    view = 'confirming';
  } else {
    // Return OK, không poll được (fallback) → tạm thành công theo return.
    view = 'success';
  }

  // Chỉ mở retry khi biết chắc đơn nào: orderId đến từ cầu nối sessionStorage, mất
  // cầu nối thì chỉ còn đường vào trang đơn. Đơn đã hoàn tiền thì BE cũng chặn.
  const createUrl = useCreateVnpayUrl();
  const canRetryPayment =
    view === 'failed' &&
    !!orderId &&
    !!pending &&
    isAuthenticated &&
    paymentStatus !== 'refunded';

  const handleRetryPayment = () => {
    if (!orderId || !pending) return;
    const retryOrderNumber = pending.orderNumber;
    createUrl.mutate(orderId, {
      onSuccess: (res) => {
        // Effect ở trên đã xóa cầu nối khi thấy trạng thái cuối — ghi lại trước
        // khi rời trang, nếu không trang Return lần sau không suy được orderId.
        setPendingPayment({ orderId, orderNumber: retryOrderNumber });
        window.location.href = res.data.paymentUrl;
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  };

  const orderHref = orderId ? `/profile/orders/${orderId}` : '/profile/orders';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center text-center max-w-md w-full space-y-5">
        {view === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 text-violet-500 animate-spin" />
            <p className="text-sm text-muted-foreground">
              Đang kiểm tra kết quả thanh toán...
            </p>
          </>
        )}

        {view === 'confirming' && (
          <>
            <Loader2
              className={cn(
                'h-12 w-12 text-amber-500',
                !pollExhausted && 'animate-spin',
              )}
            />
            <h1 className="text-2xl font-extrabold text-foreground">
              Đang xác nhận thanh toán
            </h1>
            <p className="text-sm text-muted-foreground">
              {pollExhausted
                ? 'Giao dịch đang xử lý lâu hơn bình thường. Mở đơn hàng để kiểm tra trạng thái mới nhất, hoặc quay lại sau ít phút.'
                : 'VNPay đã ghi nhận giao dịch. Hệ thống đang cập nhật trạng thái đơn hàng, vui lòng đợi trong giây lát...'}
            </p>
          </>
        )}

        {view === 'success' && (
          <>
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
            <h1 className="text-2xl font-extrabold text-foreground">
              Thanh toán thành công!
            </h1>
            <p className="text-sm text-muted-foreground">
              Cảm ơn bạn. Đơn hàng đã được thanh toán và sẽ sớm được xử lý.
            </p>
          </>
        )}

        {view === 'failed' && (
          <>
            <XCircle className="h-16 w-16 text-rose-500" />
            <h1 className="text-2xl font-extrabold text-foreground">
              Thanh toán chưa thành công
            </h1>
            <p className="text-sm text-muted-foreground">
              {canRetryPayment
                ? 'Giao dịch bị hủy hoặc thất bại. Bạn có thể thử lại ngay trên đơn hàng này — giỏ hàng và mã giảm giá vẫn được giữ nguyên.'
                : 'Giao dịch bị hủy hoặc thất bại. Mở đơn hàng để thử lại hoặc hủy đơn.'}
            </p>
          </>
        )}

        {view !== 'loading' && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full sm:w-auto">
            {canRetryPayment && (
              <Button
                onClick={handleRetryPayment}
                disabled={createUrl.isPending}
              >
                {createUrl.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang chuyển...
                  </>
                ) : (
                  'Thử lại thanh toán'
                )}
              </Button>
            )}
            <Button
              variant={canRetryPayment ? 'outline' : 'default'}
              render={<Link href={orderHref} />}
            >
              Xem đơn hàng
            </Button>
            <Button variant="outline" render={<Link href="/products" />}>
              Tiếp tục mua sắm
            </Button>
          </div>
        )}

        {isHydrated && !isAuthenticated && view !== 'loading' && (
          <p className="text-xs text-muted-foreground pt-1">
            Đăng nhập để xem chi tiết trạng thái đơn hàng.
          </p>
        )}
      </div>
    </div>
  );
}
