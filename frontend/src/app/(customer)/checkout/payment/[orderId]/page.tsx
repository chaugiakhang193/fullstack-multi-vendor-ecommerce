'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, CreditCard } from 'lucide-react';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import useHydrated from '@/hooks/useHydrated';
import { useAuthStore } from '@/store/useAuthStore';
import { usePollOrderPayment, useCreateVnpayUrl } from '@/hooks/usePayments';
import { setPendingPayment } from '@/lib/vnpay-pending';
import { getErrorMessage } from '@/lib/http';
import { formatVnd } from '@/lib/format';
import { Button } from '@/components/ui/button';

export default function VnpayPaymentPage() {
  useDocumentTitle('Thanh toán VNPay');
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const isHydrated = useHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // allowPoll=false: đơn luôn PENDING lúc mới vào trang này (chưa ai trả tiền) —
  // poll ở đây chỉ tốn ngân sách 15 lần dùng chung với trang Return, không đổi
  // được gì tới khi khách thật sự bấm nút và rời sang VNPay.
  const detailQuery = usePollOrderPayment(orderId, isAuthenticated, false);
  const createUrl = useCreateVnpayUrl();

  const order = detailQuery.data?.data;
  const payment = order?.payment;

  // Chưa đăng nhập (sau hydrate) → về login kèm redirect quay lại đây.
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      const back = encodeURIComponent(`/checkout/payment/${orderId}`);
      router.replace(`/login?redirect=${back}`);
    }
  }, [isHydrated, isAuthenticated, orderId, router]);

  // Đơn không còn PENDING (đã trả / thất bại / hoàn) → về trang chi tiết (nơi có
  // badge + nút hủy). Trang này chỉ lo bước "khởi tạo thanh toán".
  useEffect(() => {
    if (payment && payment.status !== 'pending') {
      router.replace(`/profile/orders/${orderId}`);
    }
  }, [payment, orderId, router]);

  const handlePay = () => {
    if (!order) return;
    const orderNumber = order.order_number ?? '';
    createUrl.mutate(orderId, {
      onSuccess: (res) => {
        // Lưu cầu nối TRƯỚC khi rời trang (setItem đồng bộ → chắc chắn ghi xong).
        setPendingPayment({ orderId, orderNumber });
        window.location.href = res.data.paymentUrl;
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  };

  if (!isHydrated || detailQuery.isLoading) {
    return (
      <div className="max-w-lg mx-auto py-16 animate-pulse space-y-4">
        <div className="h-8 w-48 bg-muted rounded-lg mx-auto" />
        <div className="h-40 bg-muted rounded-xl" />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  if (detailQuery.isError || !order) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {detailQuery.error
            ? getErrorMessage(detailQuery.error)
            : 'Không tìm thấy đơn hàng.'}
        </p>
        <Button variant="outline" render={<Link href="/profile/orders" />}>
          Đơn hàng của tôi
        </Button>
      </div>
    );
  }

  const total = order.total_amount ?? 0;
  const orderNumber = order.order_number ?? orderId;

  return (
    <div className="max-w-lg mx-auto py-12 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
          <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">
          Đơn đã được tạo
        </h1>
        <p className="text-sm text-muted-foreground">
          Hoàn tất thanh toán qua VNPay để shop bắt đầu xử lý đơn của bạn.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Mã đơn hàng</span>
          <span className="font-bold text-foreground">{orderNumber}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-black text-foreground">
            Số tiền cần thanh toán
          </span>
          <span className="text-xl font-black text-violet-600 dark:text-violet-400">
            {formatVnd.format(total)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-violet-500 bg-violet-50/50 dark:bg-violet-950/20 px-4 py-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        Cổng thanh toán VNPay (Sandbox)
      </div>

      <Button
        className="w-full h-12 text-base font-bold"
        onClick={handlePay}
        disabled={createUrl.isPending}
      >
        {createUrl.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Đang chuyển tới
            VNPay...
          </>
        ) : (
          'Thanh toán qua VNPay'
        )}
      </Button>

      <Link
        href={`/profile/orders/${orderId}`}
        className="block text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        Để sau, xem đơn hàng →
      </Link>
    </div>
  );
}
