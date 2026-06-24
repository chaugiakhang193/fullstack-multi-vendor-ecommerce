import Link from 'next/link';
import { Button } from '@/components/ui/button';

// Next 15: searchParams là Promise — bắt buộc await.
interface CheckoutSuccessPageProps {
  searchParams: Promise<{ orderNumber?: string; orderId?: string }>;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const { orderNumber, orderId } = await searchParams;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center text-center max-w-md animate-in fade-in zoom-in-95 duration-500">
        {/* Checkmark vẽ bằng SVG + CSS keyframes (không framer-motion) */}
        <svg
          viewBox="0 0 80 80"
          className="w-24 h-24 mb-6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="40"
            cy="40"
            r="36"
            className="stroke-emerald-500"
            strokeWidth="4"
            strokeLinecap="round"
            style={{
              strokeDasharray: 226,
              strokeDashoffset: 226,
              animation: 'draw-circle 0.6s ease-out forwards',
            }}
          />
          <path
            d="M25 41 L36 52 L56 30"
            className="stroke-emerald-500"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 60,
              strokeDashoffset: 60,
              animation: 'draw-check 0.4s 0.5s ease-out forwards',
            }}
          />
        </svg>

        <h1 className="text-2xl font-extrabold text-foreground mb-2">
          Đặt hàng thành công!
        </h1>
        <p className="text-sm text-muted-foreground mb-1">
          Cảm ơn bạn đã mua sắm. Đơn hàng của bạn đang được xử lý.
        </p>
        {orderNumber && (
          <p className="text-sm mb-6">
            Mã đơn hàng:{' '}
            <span className="font-bold text-foreground">{orderNumber}</span>
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
          {/* Xem chi tiết đơn vừa đặt */}
          <Button
            render={
              <Link
                href={
                  orderId ? `/profile/orders/${orderId}` : '/profile/orders'
                }
              />
            }
          >
            Xem đơn hàng
          </Button>
          <Button variant="outline" render={<Link href="/products" />}>
            Tiếp tục mua sắm
          </Button>
        </div>
      </div>
    </div>
  );
}
