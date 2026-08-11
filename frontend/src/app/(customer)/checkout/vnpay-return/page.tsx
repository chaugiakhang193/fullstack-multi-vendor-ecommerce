'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import useHydrated from '@/hooks/useHydrated';
import { useAuthStore } from '@/store/useAuthStore';
import { useVnpayReturn, usePollOrderPayment } from '@/hooks/usePayments';
import {
  readPendingPayment,
  clearPendingPayment,
  type PendingPayment,
} from '@/lib/vnpay-pending';
import { Button } from '@/components/ui/button';

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

  // 3) Poll trạng thái thanh toán (nguồn IPN) tới terminal, tối đa ~15s.
  const canPoll = !!orderId && isHydrated && isAuthenticated;
  const detailQuery = usePollOrderPayment(orderId ?? '', canPoll);
  const paymentStatus = detailQuery.data?.data?.payment?.status ?? null;

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
            <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
            <h1 className="text-2xl font-extrabold text-foreground">
              Đang xác nhận thanh toán
            </h1>
            <p className="text-sm text-muted-foreground">
              VNPay đã ghi nhận giao dịch. Hệ thống đang cập nhật trạng thái đơn
              hàng, vui lòng đợi trong giây lát...
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
              Giao dịch bị hủy hoặc thất bại. Bạn có thể mở đơn hàng để hủy
              (hoàn kho) rồi đặt lại.
            </p>
          </>
        )}

        {view !== 'loading' && (
          <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full sm:w-auto">
            <Button render={<Link href={orderHref} />}>Xem đơn hàng</Button>
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
